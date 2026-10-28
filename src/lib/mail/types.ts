export type Provider = 'gmail'|'outlook'|'tonline'|'yahoo'|'proton';
export type Account = {id:string;user_id:string;provider:Provider;email:string;secret:string|null;status:string};
export type MailMessage = {
 remoteId:string;folder:string;sender:string;subject:string;receivedAt:string;size:number;
 isRead:boolean;flagged:boolean;hasAttachments:boolean;listId:string|null;
};
export type MailContent = {text:string;raw:Buffer};
export type RestoreData = {remoteId:string;folder:string;labels?:string[];originalId?:string};
export interface MailAdapter {
 list(since:Date,max:number):Promise<MailMessage[]>;
 content(remoteId:string):Promise<MailContent>;
 guard(remoteId:string):Promise<{flagged:boolean;has_attachments:boolean;subject:string}>;
 trash(remoteId:string):Promise<RestoreData>;
 restore(data:RestoreData):Promise<string>;
 close():Promise<void>;
}
export type OAuthToken = {access_token:string;refresh_token:string;expires_at:number;scope?:string};
