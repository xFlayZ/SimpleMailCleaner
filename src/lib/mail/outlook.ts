import { jsonRequest,readLimited } from '../http';
import { AppError } from '../errors';
import { parseContent,headerMap,MAX_RAW,newsletterHeaderSignal } from './parse';
import type { MailAdapter,MailMessage,RestoreData } from './types';
export class OutlookAdapter implements MailAdapter {
 constructor(private access:string){}
 private headers(){return {Authorization:`Bearer ${this.access}`,Prefer:'IdType="ImmutableId"','Content-Type':'application/json'};}
 private async request(path:string,method='GET',body?:unknown) {
  return jsonRequest(`https://graph.microsoft.com/v1.0/${path}`,{method,headers:this.headers(),body:body?JSON.stringify(body):undefined});
 }
 async list(since:Date,max:number) {
  const messages:MailMessage[]=[];
  let path=`me/mailFolders/inbox/messages?${new URLSearchParams({'$top':String(Math.min(100,max)),'$filter':`receivedDateTime ge ${since.toISOString()}`,'$select':'id,subject,from,receivedDateTime,isRead,flag,hasAttachments,parentFolderId,internetMessageHeaders','$orderby':'receivedDateTime desc'})}`;
  while(path&&messages.length<max) {
   const result=await this.request(path);
   for(const msg of result.value||[]) {
    if(messages.length>=max)break;
    const h=headerMap(msg.internetMessageHeaders||[]);
    messages.push({remoteId:msg.id,folder:msg.parentFolderId,sender:msg.from?.emailAddress?.address?.toLowerCase()||'',subject:(msg.subject||'(Ohne Betreff)').slice(0,1000),receivedAt:msg.receivedDateTime,size:0,isRead:msg.isRead,flagged:msg.flag?.flagStatus==='flagged',hasAttachments:msg.hasAttachments,listId:h['list-id']||null,newsletterSignal:newsletterHeaderSignal(h)});
   }
   const next=result['@odata.nextLink'];
   if(next && !next.startsWith('https://graph.microsoft.com/v1.0/'))throw new AppError(502,'Ungültiger Graph-Fortsetzungslink.');
   path=next?next.slice('https://graph.microsoft.com/v1.0/'.length):'';
  }
  return messages;
 }
 async content(id:string) {
  const response=await fetch(`https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}/$value`,{headers:this.headers(),redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new AppError(502,'Microsoft-Nachricht konnte nicht geladen werden.');
  return parseContent(await readLimited(response,MAX_RAW));
 }
 async guard(id:string) {
  const msg=await this.request(`me/messages/${encodeURIComponent(id)}?$select=subject,flag,hasAttachments`);
  return {subject:msg.subject||'',flagged:msg.flag?.flagStatus==='flagged',has_attachments:Boolean(msg.hasAttachments)};
 }
 async trash(id:string):Promise<RestoreData> {
  const current=await this.request(`me/messages/${encodeURIComponent(id)}?$select=id,parentFolderId`);
  const trash=await this.request('me/mailFolders/deleteditems?$select=id');
  if(current.parentFolderId===trash.id)throw new AppError(409,'Nachricht bereits im Papierkorb.');
  const moved=await this.request(`me/messages/${encodeURIComponent(id)}/move`,'POST',{destinationId:'deleteditems'});
  return {remoteId:moved.id,folder:current.parentFolderId,originalId:id};
 }
 async restore(data:RestoreData) {
  const moved=await this.request(`me/messages/${encodeURIComponent(data.remoteId)}/move`,'POST',{destinationId:data.folder});
  return moved.id as string;
 }
 async close(){}
}
