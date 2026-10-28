import { randomUUID } from 'node:crypto';
import { tenant,pool } from './db';
import { encrypt,digest } from './crypto';
import { AppError,requireValue } from './errors';
import { protectionReasons } from './policy';
import { ImapAdapter } from './mail/imap';
import { models,modelReason,headerFingerprint } from './ai';
import { estimateScanCost,type ScanMode,type ScanEstimate } from './scan-cost';
export async function connectImap(userId:string,provider:'tonline'|'yahoo',email:string,password:string) {
 const imap=new ImapAdapter({host:provider==='tonline'?'secureimap.t-online.de':'imap.mail.yahoo.com',port:993,secure:true,user:email,password});
 try{await imap.connect();}finally{await imap.close();}
 await tenant(userId,db=>db.query(`INSERT INTO accounts(id,user_id,provider,email,secret) VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(user_id,provider,email) DO UPDATE SET secret=excluded.secret,status='connected'`,[randomUUID(),userId,provider,email.toLowerCase(),encrypt({password},userId)]));
 return {ok:true};
}
export async function dashboard(userId:string) {
 const data=await tenant(userId,async db=>{
  const accounts=(await db.query('SELECT id,provider,email,status,last_scan_at FROM accounts ORDER BY created_at')).rows;
  const messages=(await db.query('SELECT id,account_id,sender,subject,received_at,size,is_read,flagged,has_attachments,list_id,category,recommendation,reason,protected,state,version,analyzed_at,analysis_mode,header_analysis,content_analysis,unsubscribe_verified,unsubscribe_status FROM messages ORDER BY received_at DESC LIMIT 2000')).rows;
  const scans=(await db.query('SELECT * FROM scans ORDER BY created_at DESC LIMIT 20')).rows;
  const plans=(await db.query(`SELECT p.*, (SELECT count(*)::int FROM action_items a WHERE a.plan_id=p.id) AS count FROM plans p ORDER BY created_at DESC LIMIT 30`)).rows;
  const events=(await db.query('SELECT * FROM events ORDER BY created_at DESC LIMIT 50')).rows;
  const settings=requireValue((await db.query('SELECT model,api_key IS NOT NULL AS has_key,key_version,ai_consent,scan_budget,monthly_budget FROM settings WHERE user_id=$1',[userId])).rows[0]);
  const rules=(await db.query('SELECT sender FROM rules')).rows.map(r=>r.sender);
  const usage=(await db.query("SELECT coalesce(sum(coalesce(cost,reserved)),0)::float AS cost,count(*) FILTER(WHERE cost IS NULL)::int AS estimated FROM usage_events WHERE created_at>=date_trunc('month',now())")).rows[0];
  return {accounts,messages,scans,plans,events,settings,rules,usage};
 });
 const devices=(await pool.query('SELECT account_id,last_seen FROM devices WHERE user_id=$1 AND revoked=false',[userId])).rows;
 return {...data,devices,configured:{google:Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET),microsoft:Boolean(process.env.MICROSOFT_CLIENT_ID&&process.env.MICROSOFT_CLIENT_SECRET)},writesPaused:process.env.PAUSE_WRITES==='true'};
}
export async function scanEstimate(userId:string,accountId:string,mode:ScanMode,days:number,max:number):Promise<ScanEstimate> {
 const snapshot=await tenant(userId,async db=>{
  requireValue((await db.query('SELECT id FROM accounts WHERE id=$1',[accountId])).rows[0]);
  const settings=requireValue((await db.query('SELECT * FROM settings WHERE user_id=$1',[userId])).rows[0]);
  const rows=(await db.query("SELECT * FROM messages WHERE account_id=$1 AND state='active' AND received_at>=now()-($2::int*interval '1 day') ORDER BY received_at DESC LIMIT $3",[accountId,days,max])).rows;
  const rules=new Set<string>((await db.query('SELECT sender FROM rules')).rows.map(r=>r.sender));
  const usage=(await db.query("SELECT coalesce(sum(coalesce(cost,reserved)),0)::float AS used FROM usage_events WHERE created_at>=date_trunc('month',now())")).rows[0];
  return {settings,rows,rules,used:usage.used};
 });
 const {settings,rows,rules}=snapshot;
 if(mode!=='metadata'&&(!settings.api_key||!settings.model||!settings.ai_consent))throw new AppError(409,'Zuerst API-Schlüssel, Modell und KI-Einwilligung speichern.');
 const model=mode==='metadata'?null:requireValue((await models()).find(m=>m.id===settings.model),'Modell nicht verfügbar.');
 if(model&&modelReason(model))throw new AppError(409,modelReason(model)!);
 const skipped=rows.filter(m=>protectionReasons(m,rules).length>0||mode==='ai_headers'&&m.header_analysis?._model===settings.model&&m.header_analysis?._fingerprint===headerFingerprint({sender:m.sender,subject:m.subject,receivedAt:new Date(m.received_at).toISOString()},settings.model)).length;
 const count=mode==='metadata'?0:Math.max(0,max-skipped);
 const metadataBytes=rows.length?Math.ceil(rows.reduce((sum,m)=>sum+Buffer.byteLength(JSON.stringify({id:m.id,sender:m.sender.slice(0,320),subject:m.subject.slice(0,400),date:new Date(m.received_at).toISOString()})),0)/rows.length):400;
 return {mode,model:settings.model,requested:max,estimatedMessages:count,knownMessages:rows.length,skipped,...(model?estimateScanCost(model,count,mode,metadataBytes):{calls:0,low:0,high:0,reservation:0}),scanBudget:Number(settings.scan_budget),monthlyBudget:Number(settings.monthly_budget),availableBudget:Math.max(0,Number(settings.monthly_budget)-snapshot.used),priceAt:new Date().toISOString(),basis:rows.length>=max?'Bereich aus dem vorhandenen Index; unveränderte Schnellbewertungen und geschützte Nachrichten abgezogen.':'Hochrechnung für die maximale Auswahl; tatsächliche Trefferzahl und Textlängen werden erst im Scan bekannt.'};
}
export async function startScan(userId:string,accountId:string,mode:ScanMode,days:number,max:number,consent:{ai?:boolean;content?:boolean}={}) {
 if(mode!=='metadata'&&!consent.ai)throw new AppError(422,'KI-Übermittlung muss für diesen Scan ausdrücklich bestätigt werden.');
 if(mode==='ai'&&!consent.content)throw new AppError(422,'Inhaltsscan benötigt eine gesonderte Bestätigung.');
 if(max>(mode==='ai'?500:20000))throw new AppError(422,'Zu viele Nachrichten für diese Analyseart.');
 const estimate=mode==='metadata'?null:await scanEstimate(userId,accountId,mode,days,max);
 return tenant(userId,async db=>{
  requireValue((await db.query('SELECT id FROM accounts WHERE id=$1',[accountId])).rows[0]);
  if(mode!=='metadata') {
   const settings=requireValue((await db.query('SELECT api_key,model,ai_consent FROM settings WHERE user_id=$1',[userId])).rows[0]);
   if(!settings.api_key||!settings.model||!settings.ai_consent)throw new AppError(409,'Zuerst API-Schlüssel, Modell und KI-Einwilligung speichern.');
  }
  const id=randomUUID();
  const settings=requireValue((await db.query('SELECT model,key_version FROM settings WHERE user_id=$1',[userId])).rows[0]);
  if(estimate&&estimate.model!==settings.model)throw new AppError(409,'Modell geändert. Kostenschätzung neu laden.');
  await db.query('INSERT INTO scans(id,user_id,account_id,mode,days,max_messages,model,key_version,estimated_cost_low,estimated_cost_high,content_consent) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,userId,accountId,mode,days,max,settings.model,settings.key_version,estimate?.low??0,estimate?.high??0,mode==='ai'&&consent.content===true]);
  await db.query("INSERT INTO jobs(id,user_id,kind,ref_id) VALUES($1,$2,'scan',$3)",[randomUUID(),userId,id]);
  return {id};
 });
}
export async function createPlan(userId:string,kind:'trash'|'restore'|'unsubscribe',ids:string[]) {
 if(process.env.PAUSE_WRITES==='true')throw new AppError(503,'Schreibaktionen sind vom Betreiber pausiert.');
 return tenant(userId,async db=>{
  const messages=(await db.query('SELECT * FROM messages WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[ids])).rows;
  if(messages.length!==new Set(ids).size)throw new AppError(404,'Auswahl enthält nicht verfügbare Nachrichten.');
  const rules=new Set<string>((await db.query('SELECT sender FROM rules')).rows.map(r=>r.sender));
  const accounts=new Set(messages.map(m=>m.account_id));
  if(accounts.size!==1)throw new AppError(422,'Pro Freigabe genau ein Postfach auswählen.');
  const selected=kind==='unsubscribe'?messages.filter((m,i,a)=>a.findIndex(n=>`${n.sender}|${n.list_id||n.id}`===`${m.sender}|${m.list_id||m.id}`)===i):messages;
  const unresolved=await db.query("SELECT id FROM action_items WHERE message_id=ANY($1::uuid[]) AND status IN ('executing','unknown') LIMIT 1",[selected.map(m=>m.id)]);
  if(unresolved.rowCount)throw new AppError(409,'Eine frühere Aktion für diese Auswahl ist noch aktiv oder unklar. Externen Zustand zuerst prüfen.');
  for(const m of selected) {
   if(kind==='trash'&&(m.state!=='active'||m.recommendation!=='trash'||!m.analyzed_at||protectionReasons(m,rules).length))throw new AppError(409,'Auswahl enthält geschützte oder nicht zum Aufräumen bewertete Nachrichten.');
   if(kind==='restore'&&(m.state!=='trashed'||!m.restore_data))throw new AppError(409,'Nachricht kann nicht wiederhergestellt werden.');
   if(kind==='unsubscribe'&&(!m.unsubscribe_verified||!m.unsubscribe_url||m.unsubscribe_status==='accepted'))throw new AppError(409,'Keine verifizierte One-Click-Abmeldung verfügbar.');
  }
  const planId=randomUUID(),hash=digest(JSON.stringify({kind,items:selected.map(m=>({id:m.id,version:m.version}))}));
  await db.query('INSERT INTO plans(id,user_id,kind,digest) VALUES($1,$2,$3,$4)',[planId,userId,kind,hash]);
  for(const m of selected)await db.query('INSERT INTO action_items(id,user_id,plan_id,message_id,message_version) VALUES($1,$2,$3,$4,$5)',[randomUUID(),userId,planId,m.id,m.version]);
  return {id:planId,digest:hash,kind,count:selected.length,expiresAt:new Date(Date.now()+900000).toISOString(),messages:selected.map(m=>({id:m.id,subject:m.subject,sender:m.sender}))};
 });
}
export async function approvePlan(userId:string,id:string,hash:string) {
 return tenant(userId,async db=>{
  const plan=requireValue((await db.query('SELECT * FROM plans WHERE id=$1 FOR UPDATE',[id])).rows[0]);
  if(plan.digest!==hash||plan.status!=='proposed'||new Date(plan.expires_at).getTime()<Date.now())throw new AppError(409,'Freigabe ist abgelaufen oder wurde bereits verwendet.');
  await db.query("UPDATE plans SET status='approved',approved_at=now() WHERE id=$1",[id]);
  await db.query("INSERT INTO jobs(id,user_id,kind,ref_id) VALUES($1,$2,'action',$3)",[randomUUID(),userId,id]);
  await db.query("INSERT INTO events(id,user_id,kind,summary) VALUES($1,$2,'approval',$3)",[randomUUID(),userId,`Aktion ${plan.kind} ausdrücklich freigegeben.`]);
  return {ok:true};
 });
}
