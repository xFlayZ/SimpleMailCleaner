import { ImapFlow } from 'imapflow';
import { AppError } from '../errors';
import { parseContent, senderAddress, MAX_RAW } from './parse';
import type { MailAdapter, MailMessage, RestoreData } from './types';
export type ImapConfig={host:string;port:number;secure:boolean;user:string;password:string;ca?:string;servername?:string};
export const encodeRef=(folder:string,validity:string,uid:number)=>Buffer.from(JSON.stringify({folder,validity,uid})).toString('base64url');
export function decodeRef(id:string):{folder:string;validity:string;uid:number} {
 const value=JSON.parse(Buffer.from(id,'base64url').toString('utf8'));
 if(typeof value.folder!=='string'||typeof value.validity!=='string'||!Number.isSafeInteger(value.uid)||value.uid<1)throw new AppError(422,'Ungültige IMAP-Referenz.');
 return value;
}
export class ImapAdapter implements MailAdapter {
 private client:ImapFlow;
 constructor(config:ImapConfig) {
  this.client=new ImapFlow({host:config.host,port:config.port,secure:config.secure,doSTARTTLS:config.secure?undefined:true,auth:{user:config.user,pass:config.password},tls:{rejectUnauthorized:true,...(config.ca?{ca:config.ca}:{}),...(config.servername?{servername:config.servername}:{})},logger:false,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:45000});
  this.client.on('error',()=>{});
 }
 async connect(){await this.client.connect();return this;}
 private async select(id:string) {
  const ref=decodeRef(id),lock=await this.client.getMailboxLock(ref.folder);
  if(!this.client.mailbox || String(this.client.mailbox.uidValidity)!==ref.validity){lock.release();throw new AppError(409,'Postfach wurde neu aufgebaut. Erneut scannen.');}
  return {ref,lock};
 }
 async list(since:Date,max:number) {
  const lock=await this.client.getMailboxLock('INBOX');
  try {
   if(!this.client.mailbox)return [];
   const validity=String(this.client.mailbox.uidValidity);
   const found=await this.client.search({...(since.getTime()===0?{}:{since}),deleted:false},{uid:true});
   const uids=(found||[]).slice(-max).reverse();
   if(!uids.length)return [];
   const result:MailMessage[]=[];
   for await(const msg of this.client.fetch(uids.join(','),{uid:true,envelope:true,flags:true,size:true,bodyStructure:true,headers:['list-id','list-unsubscribe','precedence']},{uid:true})) {
    const from=msg.envelope?.from?.[0];
    const headerText=msg.headers?.toString()||'';
    const list=headerText.match(/^list-id:\s*(.+)$/im)?.[1]?.trim()||null;
    const hasAttachment=(node:unknown):boolean=>{
     const n=node as {disposition?:string;childNodes?:unknown[]};
     return n?.disposition==='attachment'||Boolean(n?.childNodes?.some(hasAttachment));
    };
    result.push({remoteId:encodeRef('INBOX',validity,msg.uid),folder:'INBOX',sender:senderAddress(from?.address||''),subject:(msg.envelope?.subject||'(Ohne Betreff)').slice(0,1000),receivedAt:(msg.envelope?.date||new Date()).toISOString(),size:msg.size||0,isRead:msg.flags?.has('\\Seen')||false,flagged:msg.flags?.has('\\Flagged')||false,hasAttachments:hasAttachment(msg.bodyStructure),listId:list,newsletterSignal:Boolean(list||/^list-unsubscribe:/im.test(headerText)||/^precedence:\s*(bulk|list)\s*$/im.test(headerText))});
   }
   return result;
  }finally{lock.release();}
 }
 async content(id:string) {
  const {ref,lock}=await this.select(id);
  try {
   const meta=await this.client.fetchOne(String(ref.uid),{size:true},{uid:true});
   if(!meta)throw new AppError(404,'Nachricht nicht mehr vorhanden.');
   if((meta.size||0)>MAX_RAW)throw new AppError(422,'Nachricht zu groß für Inhaltsanalyse.');
   const msg=await this.client.fetchOne(String(ref.uid),{source:{start:0,maxLength:MAX_RAW+1}},{uid:true});
   if(!msg||!msg.source)throw new AppError(404,'Nachricht nicht mehr vorhanden.');
   return parseContent(msg.source);
  }finally{lock.release();}
 }
 async guard(id:string) {
  const {ref,lock}=await this.select(id);
  try {
   const msg=await this.client.fetchOne(String(ref.uid),{envelope:true,flags:true,bodyStructure:true},{uid:true});
   if(!msg)throw new AppError(404,'Nachricht nicht mehr vorhanden.');
   const attached=(node:unknown):boolean=>{const n=node as {disposition?:string;childNodes?:unknown[]};return n?.disposition==='attachment'||Boolean(n?.childNodes?.some(attached));};
   return {subject:msg.envelope?.subject||'',flagged:Boolean(msg.flags?.has('\\Flagged')||msg.flags?.has('\\Deleted')),has_attachments:attached(msg.bodyStructure)};
  }finally{lock.release();}
 }
 private async move(id:string,destination:string):Promise<string> {
  const {ref,lock}=await this.select(id);
  try {
   // ImapFlow may emulate MOVE with COPY/DELETE. We explicitly prohibit that fallback.
   if(!this.client.capabilities.has('MOVE')||!this.client.capabilities.has('UIDPLUS'))throw new AppError(409,'Server unterstützt keinen sicher wiederherstellbaren UID-MOVE.');
   const current=await this.client.fetchOne(String(ref.uid),{flags:true},{uid:true});
   if(!current)throw new AppError(404,'Nachricht nicht mehr vorhanden.');
   const moved=await this.client.messageMove(String(ref.uid),destination,{uid:true});
   if(!moved||!moved.uidMap?.get(ref.uid)||!moved.uidValidity)throw new AppError(409,'Verschiebungsergebnis unklar. Postfach vor weiteren Aktionen prüfen.');
   return encodeRef(destination,String(moved.uidValidity),moved.uidMap.get(ref.uid)!);
  }finally{lock.release();}
 }
 async trash(id:string):Promise<RestoreData> {
  const folders=await this.client.list(),trash=folders.find(f=>f.specialUse==='\\Trash');
  if(!trash)throw new AppError(409,'Papierkorb konnte nicht sicher erkannt werden.');
  const ref=decodeRef(id);
  if(ref.folder===trash.path)throw new AppError(409,'Nachricht bereits im Papierkorb.');
  return {remoteId:await this.move(id,trash.path),folder:ref.folder,originalId:id};
 }
 async restore(data:RestoreData){return this.move(data.remoteId,data.folder);}
 async close(){await this.client.logout().catch(()=>this.client.close());}
}
