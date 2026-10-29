import type {ListingObserver} from './types';
import { jsonRequest } from '../http';
import { AppError } from '../errors';
import { headerMap, parseContent, senderAddress, MAX_RAW,newsletterHeaderSignal } from './parse';
import type { MailAdapter, MailMessage, RestoreData } from './types';
export class GmailAdapter implements MailAdapter {
 constructor(private access:string){}
 private async request(path:string,method='GET',body?:unknown) {
  return jsonRequest(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{method,headers:{Authorization:`Bearer ${this.access}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 }
 async list(since:Date,max:number,observer:ListingObserver={}) {
  const limit=max===0?Infinity:max;
  const messages:MailMessage[]=[];let page='';
  do {
   await observer.check?.();
   const params=new URLSearchParams({maxResults:String(Math.min(100,limit-messages.length)),q:since.getTime()===0?'in:inbox':`in:inbox after:${Math.floor(since.getTime()/1000)}`});
   if(page)params.set('pageToken',page);
   const result=await this.request(`messages?${params}`);
   const entries=result.messages||[];
   for(let offset=0;offset<entries.length;offset+=5){
    await observer.check?.();
    const page=await Promise.all(entries.slice(offset,offset+5).map(async(entry:{id:string})=> {
    const msg=await this.request(`messages/${encodeURIComponent(entry.id)}?format=metadata`);
    const headers=headerMap(msg.payload?.headers||[]),labels:string[]=msg.labelIds||[];
    return {remoteId:msg.id,folder:'INBOX',sender:senderAddress(headers.from||''),subject:(headers.subject||'(Ohne Betreff)').slice(0,1000),receivedAt:new Date(Number(msg.internalDate)).toISOString(),size:msg.sizeEstimate||0,isRead:!labels.includes('UNREAD'),flagged:labels.includes('STARRED')||labels.includes('IMPORTANT'),hasAttachments:Boolean(msg.payload?.parts?.some((p:{filename?:string})=>p.filename)),listId:headers['list-id']||null,newsletterSignal:newsletterHeaderSignal(headers)};
    }));
    messages.push(...page);
    await observer.progress?.(messages.length);
   }
   page=result.nextPageToken||'';
  }while(page&&messages.length<limit);
  return messages;
 }
 async content(id:string) {
  const metadata=await this.request(`messages/${encodeURIComponent(id)}?format=minimal`);
  if(metadata.sizeEstimate>MAX_RAW)throw new AppError(422,'Nachricht zu groß für Inhaltsanalyse.');
  const msg=await this.request(`messages/${encodeURIComponent(id)}?format=raw`);
  return parseContent(Buffer.from(msg.raw,'base64url'));
 }
 async guard(id:string) {
  const msg=await this.request(`messages/${encodeURIComponent(id)}?format=full`);
  const headers=headerMap(msg.payload?.headers||[]);
  const attachment=(part:{filename?:string;parts?:unknown[]}):boolean=>Boolean(part.filename)||Boolean(part.parts?.some(p=>attachment(p as typeof part)));
  return {subject:headers.subject||'',flagged:msg.labelIds?.some((l:string)=>['STARRED','IMPORTANT','TRASH'].includes(l))||false,has_attachments:attachment(msg.payload||{})};
 }
 async trash(id:string):Promise<RestoreData> {
  const msg=await this.request(`messages/${encodeURIComponent(id)}?format=minimal`);
  if(msg.labelIds?.includes('TRASH'))throw new AppError(409,'Nachricht liegt bereits im Papierkorb. Neu synchronisieren.');
  await this.request(`messages/${encodeURIComponent(id)}/trash`,'POST',{});
  return {remoteId:id,folder:'INBOX',labels:msg.labelIds};
 }
 async restore(data:RestoreData) {
  await this.request(`messages/${encodeURIComponent(data.remoteId)}/untrash`,'POST',{});
  const labels=data.labels?.filter(x=>!['TRASH','SPAM','SENT','DRAFT'].includes(x))||[];
  if(labels.length)await this.request(`messages/${encodeURIComponent(data.remoteId)}/modify`,'POST',{addLabelIds:labels});
  return data.remoteId;
 }
 async close(){}
}
