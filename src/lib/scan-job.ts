import {personalDecision} from './personal-filter';
import { randomUUID } from 'node:crypto';
import { tenant,event } from './db';
import { adapter } from './mail';
import { AppError,requireValue } from './errors';
import { analyze,analyzeHeaders,models,modelReason,type Model } from './ai';
import { scanModeNames,type ScanMode } from './scan-cost';
import { initialCategory,protectionReasons } from './policy';
import { verifiedUnsubscribe } from './unsubscribe';
import { encrypt,digest } from './crypto';
import type { Account,MailAdapter } from './mail/types';
type Job={id:string;user_id:string;kind:string;ref_id:string};
type Dependencies={makeAdapter:(account:Account)=>Promise<MailAdapter>;getModels:()=>Promise<Model[]>;headers:typeof analyzeHeaders;content:typeof analyze;enqueue:(userId:string,accountId:string,ids:string[],model:string)=>Promise<void>};
export async function scanJob(job:Job,overrides:Partial<Dependencies>={}) {
 const deps:Dependencies={makeAdapter:adapter,getModels:()=>models(true),headers:analyzeHeaders,content:analyze,enqueue:enqueueImportedReview,...overrides};
 const scan=await tenant(job.user_id,async db=>{
  const row=requireValue((await db.query('SELECT * FROM scans WHERE id=$1 FOR UPDATE',[job.ref_id])).rows[0]);
  if(row.status==='cancelled')throw new AppError(409,'Scan abgebrochen.');
  if(row.mode==='ai'&&!row.content_consent)throw new AppError(409,'Inhaltsscan bitte mit gesonderter Einwilligung erneut starten.');
  await db.query("UPDATE scans SET status='running' WHERE id=$1",[row.id]);return row;
 });
 const settings=await tenant(job.user_id,async db=>requireValue((await db.query('SELECT model,key_version FROM settings WHERE user_id=$1',[job.user_id])).rows[0]));
 if(scan.mode!=='metadata'&&(scan.model!==settings.model||scan.key_version!==settings.key_version))throw new AppError(409,'KI-Konfiguration seit Freigabe geändert. Scan neu schätzen und starten.');
 const model=scan.mode==='metadata'?null:requireValue((await deps.getModels()).find(m=>m.id===scan.model),'Modell nicht verfügbar.');
 if(model&&modelReason(model))throw new AppError(409,modelReason(model)!);
 const account=await tenant(job.user_id,async db=>requireValue((await db.query('SELECT * FROM accounts WHERE id=$1',[scan.account_id])).rows[0]) as Account);
 const mail=await deps.makeAdapter(account);
 const checkCancelled=async()=>{
  const current=await tenant(job.user_id,async db=>(await db.query('SELECT status FROM scans WHERE id=$1',[scan.id])).rows[0]);
  if(!current||current.status==='cancelled')throw new AppError(409,'Scan abgebrochen.');
 };
 const progress=async(count=1,skipped=0)=>tenant(job.user_id,db=>db.query('UPDATE scans SET processed=processed+$2,skipped=skipped+$3 WHERE id=$1',[scan.id,count,skipped]));
 const saveResult=async(id:string,result:{category:string;action:string;reason:string;riskFlags:string[]},fingerprint:string,mode:'ai_headers'|'ai')=>{
  const safeAction=['important','personal','security'].includes(result.category)?'keep':result.riskFlags.length?'review':result.action;
  // The SQL column is selected from an internal enum, never from user or model output.
  const column=mode==='ai_headers'?'header_analysis':'content_analysis';
  await tenant(job.user_id,db=>db.query(`UPDATE messages SET category=$2,recommendation=$3,reason=$4,analyzed_at=now(),analysis_mode=$5,analysis_model=$6,analysis_fingerprint=$7,${column}=$8,version=version+1 WHERE id=$1`,[id,result.category,safeAction,result.reason,mode,model!.id,fingerprint,{...result,_model:model!.id,_fingerprint:fingerprint}]));
 };
 try {
  const messages=await mail.list(new Date(scan.days===0?0:Date.now()-scan.days*86400000),scan.max_messages,{check:checkCancelled,progress:async count=>{await checkCancelled();await tenant(job.user_id,db=>db.query('UPDATE scans SET total=$2 WHERE id=$1',[scan.id,count]));}});
  await tenant(job.user_id,db=>db.query('UPDATE scans SET total=$2 WHERE id=$1',[scan.id,messages.length]));
  const rules=await tenant(job.user_id,async db=>new Set<string>((await db.query('SELECT sender FROM rules')).rows.map(r=>r.sender)));
  const personalRules=await tenant(job.user_id,async db=>(await db.query('SELECT * FROM learned_filter_rules WHERE enabled AND account_id=$1',[account.id])).rows);
  let index=0;const importedIds:string[]=[];
  for(const m of messages) {
   if(index++%20===0)await checkCancelled();
   const protections=protectionReasons({sender:m.sender,subject:m.subject,flagged:m.flagged,has_attachments:m.hasAttachments},rules);
   const row=await tenant(job.user_id,async db=>(await db.query(`INSERT INTO messages(id,user_id,account_id,remote_id,folder,sender,subject,received_at,size,is_read,flagged,has_attachments,list_id,category,protected,reason,newsletter_signal)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT(account_id,remote_id) DO UPDATE SET subject=excluded.subject,sender=excluded.sender,received_at=excluded.received_at,is_read=excluded.is_read,flagged=excluded.flagged,
     has_attachments=excluded.has_attachments,list_id=excluded.list_id,newsletter_signal=excluded.newsletter_signal,updated_at=now(),
     analysis_fingerprint=CASE WHEN (messages.subject,messages.sender,messages.received_at,messages.flagged,messages.has_attachments) IS DISTINCT FROM (excluded.subject,excluded.sender,excluded.received_at,excluded.flagged,excluded.has_attachments) THEN NULL ELSE messages.analysis_fingerprint END,
     recommendation=CASE WHEN (messages.subject,messages.sender,messages.received_at,messages.flagged,messages.has_attachments) IS DISTINCT FROM (excluded.subject,excluded.sender,excluded.received_at,excluded.flagged,excluded.has_attachments) THEN 'review' ELSE messages.recommendation END,
     analysis_mode=CASE WHEN (messages.subject,messages.sender,messages.received_at,messages.flagged,messages.has_attachments) IS DISTINCT FROM (excluded.subject,excluded.sender,excluded.received_at,excluded.flagged,excluded.has_attachments) THEN NULL ELSE messages.analysis_mode END,
     analyzed_at=CASE WHEN (messages.subject,messages.sender,messages.received_at,messages.flagged,messages.has_attachments) IS DISTINCT FROM (excluded.subject,excluded.sender,excluded.received_at,excluded.flagged,excluded.has_attachments) THEN NULL ELSE messages.analyzed_at END,
     reason=CASE WHEN (messages.subject,messages.sender,messages.received_at,messages.flagged,messages.has_attachments) IS DISTINCT FROM (excluded.subject,excluded.sender,excluded.received_at,excluded.flagged,excluded.has_attachments) THEN 'Metadaten seit der letzten Bewertung verändert. Erneut prüfen.' ELSE messages.reason END,
     version=messages.version+CASE WHEN (messages.subject,messages.sender,messages.received_at,messages.flagged,messages.has_attachments) IS DISTINCT FROM (excluded.subject,excluded.sender,excluded.received_at,excluded.flagged,excluded.has_attachments) THEN 1 ELSE 0 END
    RETURNING *`,[randomUUID(),job.user_id,account.id,m.remoteId,m.folder,m.sender,m.subject,m.receivedAt,m.size,m.isRead,m.flagged,m.hasAttachments,m.listId,initialCategory(m.listId,m.subject),protections.length>0,protections.join('; '),Boolean(m.newsletterSignal||m.listId)])).rows[0]);
   importedIds.push(row.id);
   const reasons=protectionReasons(row,rules);
   const candidate=personalDecision(row,personalRules,rules);
   const personal=candidate?await tenant(job.user_id,async db=>personalDecision(row,(await db.query('SELECT * FROM learned_filter_rules WHERE enabled AND account_id=$1',[account.id])).rows,rules)):null;
   if(personal){await tenant(job.user_id,db=>db.query("UPDATE messages SET recommendation=$2,reason=$3,decision_source='rules',analysis_mode='rules',decision_confidence=$4,analyzed_at=now(),version=version+1 WHERE id=$1",[row.id,personal.action,personal.reason,personal.confidence]));await progress(1,1);continue;}
   if(!model){await progress();continue;}
   if(reasons.length) {
    await tenant(job.user_id,db=>db.query("UPDATE messages SET recommendation='keep',reason=$2,analysis_mode='rules',analyzed_at=now(),version=version+1 WHERE id=$1",[row.id,reasons.join('; ')]));
    await progress(1,1);continue;
   }
   if(scan.mode==='ai_headers'){await progress();continue;}
   // Only this explicitly consented branch is allowed to download a message body.
   try {
    const content=await mail.content(m.remoteId);
    const unsub=await verifiedUnsubscribe(content.raw).catch(()=>null);
    if(unsub)await tenant(job.user_id,db=>db.query('UPDATE messages SET unsubscribe_url=$2,unsubscribe_verified=true WHERE id=$1',[row.id,encrypt(unsub,job.user_id)]));
    const fingerprint=digest(JSON.stringify({v:1,mode:'ai',model:model.id,subject:m.subject,text:content.text}));
    if(row.content_analysis?._model===model.id&&row.content_analysis?._fingerprint===fingerprint){await progress(1,1);continue;}
    const result=await deps.content(job.user_id,scan.id,{subject:m.subject,text:content.text},model,settings.key_version);
    await saveResult(row.id,result,fingerprint,'ai');
   }catch(error) {
    if(error instanceof AppError&&[409,429].includes(error.status))throw error;
    await tenant(job.user_id,db=>db.query("UPDATE messages SET recommendation='review',reason='Inhaltsanalyse nicht möglich; manuell prüfen.',analysis_mode=NULL,analysis_fingerprint=NULL,analyzed_at=NULL,version=version+1 WHERE id=$1",[row.id]));
   }
   await progress();
  }
  await checkCancelled();
  await tenant(job.user_id,async db=>{
   await db.query("UPDATE scans SET status='completed',completed_at=now() WHERE id=$1",[scan.id]);
   await db.query('UPDATE accounts SET last_scan_at=now() WHERE id=$1',[account.id]);
  });
  if(scan.mode==='ai_headers'&&importedIds.length)await deps.enqueue(job.user_id,account.id,importedIds,model!.id);
  await event(job.user_id,'scan',`${messages.length} Nachrichten erfasst; ${scanModeNames[scan.mode as ScanMode]} abgeschlossen.`);
 }finally{await mail.close();}
}

async function enqueueImportedReview(userId:string,accountId:string,ids:string[],model:string) {
 const {previewReview,startReview}=await import('./reviews');
 const preview=await previewReview(userId,{filters:{accountId},config:{method:'worker',model,minAgeDays:30,maxMessages:ids.length},ids});
 await startReview(userId,preview.id,{ai:true,batch:false});
}
