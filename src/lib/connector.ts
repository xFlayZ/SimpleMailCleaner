import { randomUUID,randomBytes } from 'node:crypto';
import { pool,tenant } from './db';
import { digest,token,encrypt,decrypt,deviceSignature } from './crypto';
import { AppError,requireValue } from './errors';
import type { Account,MailAdapter,MailMessage,MailContent,RestoreData } from './mail/types';
export async function createDevice(userId:string,email:string) {
 const id=randomUUID(),accountId=randomUUID(),secret=token(),key=randomBytes(32).toString('base64');
 await tenant(userId,db=>db.query("INSERT INTO accounts(id,user_id,provider,email,status) VALUES($1,$2,'proton',$3,'waiting_connector')",[accountId,userId,email]));
 try {
  await pool.query('INSERT INTO devices(id,user_id,account_id,token_hash,signing_key) VALUES($1,$2,$3,$4,$5)',[id,userId,accountId,digest(secret),encrypt(key,userId)]);
 } catch(error) { await tenant(userId,db=>db.query('DELETE FROM accounts WHERE id=$1',[accountId]));throw error; }
 return {token:secret,deviceKey:key,accountId};
}
export async function connectorIdentity(request:Request) {
 const value=request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
 if(!value)throw new AppError(401,'Connector-Anmeldung erforderlich.');
 const device=(await pool.query('SELECT * FROM devices WHERE token_hash=$1 AND revoked=false',[digest(value)])).rows[0];
 if(!device)throw new AppError(401,'Connector widerrufen oder ungültig.');
 return device as {id:string;user_id:string;account_id:string;signing_key:string};
}
export async function pollConnector(request:Request) {
 const device=await connectorIdentity(request);
 await pool.query('UPDATE devices SET last_seen=now() WHERE id=$1',[device.id]);
 return tenant(device.user_id,async db=>{
  await db.query("UPDATE accounts SET status='connected' WHERE id=$1",[device.account_id]);
  const row=(await db.query(`UPDATE connector_tasks SET status='running' WHERE id=(SELECT id FROM connector_tasks
   WHERE device_id=$1 AND status='queued' AND expires_at>now() ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,[device.id])).rows[0];
  if(!row)return null;
  const envelope={id:row.id,kind:row.kind,expiresAt:new Date(row.expires_at).toISOString(),payload:row.payload};
  return {envelope,signature:deviceSignature(decrypt<string>(device.signing_key,device.user_id),envelope)};
 });
}
export async function completeConnector(request:Request,taskId:string,result:unknown) {
 const device=await connectorIdentity(request);
 return tenant(device.user_id,async db=>{
  const updated=await db.query("UPDATE connector_tasks SET result=$3,status='done' WHERE id=$1 AND device_id=$2 AND status='running' AND expires_at>now() RETURNING id",[taskId,device.id,encrypt(result,device.user_id)]);
  if(!updated.rowCount)throw new AppError(409,'Auftrag bereits abgeschlossen oder abgelaufen.');
  return {ok:true};
 });
}
export class ProtonAdapter implements MailAdapter {
 constructor(private account:Account){}
 private async call<T>(kind:string,args:unknown):Promise<T> {
  const device=requireValue((await pool.query('SELECT id,last_seen FROM devices WHERE account_id=$1 AND user_id=$2 AND revoked=false',[this.account.id,this.account.user_id])).rows[0],'Proton-Connector nicht gekoppelt.');
  if(!device.last_seen || Date.now()-new Date(device.last_seen).getTime()>30000)throw new AppError(409,'Proton-Connector ist offline. Lokal starten und erneut versuchen.');
  const id=randomUUID();
  await tenant(this.account.user_id,db=>db.query("INSERT INTO connector_tasks(id,user_id,device_id,kind,payload,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '100 seconds')",[id,this.account.user_id,device.id,kind,{email:this.account.email,args}]));
  for(let attempt=0;attempt<95;attempt++) {
   await new Promise(resolve=>setTimeout(resolve,1000));
   const task=await tenant(this.account.user_id,db=>db.query('SELECT status,result FROM connector_tasks WHERE id=$1',[id]));
   if(task.rows[0]?.status==='done') {
    const result=decrypt<{ok:boolean;data:T;error?:string}>(task.rows[0].result,this.account.user_id);
    await tenant(this.account.user_id,db=>db.query('DELETE FROM connector_tasks WHERE id=$1',[id]));
    if(!result.ok)throw new AppError(409,result.error==='unknown'?'Connector-Ergebnis unklar. Postfach prüfen.':'Proton-Auftrag fehlgeschlagen. Bridge-Konfiguration prüfen.');
    return result.data;
   }
  }
  throw new AppError(409,'Connector-Zeitlimit. Bei Schreibaktionen Ergebnis im Postfach prüfen.');
 }
 async list(since:Date,max:number){return this.call<MailMessage[]>('list',{since:since.toISOString(),max});}
 async content(remoteId:string):Promise<MailContent> {
  const result=await this.call<{text:string;raw:string}>('content',{remoteId});
  return {text:result.text,raw:Buffer.from(result.raw,'base64')};
 }
 async trash(remoteId:string){return this.call<RestoreData>('trash',{remoteId});}
 async guard(remoteId:string){return this.call<{flagged:boolean;has_attachments:boolean;subject:string}>('guard',{remoteId});}
 async restore(data:RestoreData){return this.call<string>('restore',data);}
 async close(){}
}
