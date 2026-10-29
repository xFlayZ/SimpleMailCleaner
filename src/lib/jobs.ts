import { randomUUID } from 'node:crypto';
import { tenant,pool } from './db';
import { adapter } from './mail';
import { AppError,requireValue,publicError } from './errors';
import { protectionReasons } from './policy';
import { verifiedUnsubscribe,sendUnsubscribe } from './unsubscribe';
import { decrypt } from './crypto';
import type { Account,RestoreData,MailAdapter } from './mail/types';
type Job={id:string;user_id:string;kind:string;ref_id:string};
const deadline=(plan:{execution_expires_at?:string|null;expires_at:string})=>new Date(plan.execution_expires_at||plan.expires_at).getTime();
import { scanJob } from './scan-job';
import {reviewJob} from './review-job';
import {pollOneBatch} from './async-batch';
export { scanJob };
export async function actionJob(job:Job,makeAdapter:(account:Account)=>Promise<MailAdapter>=adapter) {
 const plan=await tenant(job.user_id,async db=>{
  const plan=requireValue((await db.query('SELECT * FROM plans WHERE id=$1 FOR UPDATE',[job.ref_id])).rows[0]);
  if(!plan.approved_at||plan.status!=='approved'||deadline(plan)<Date.now())throw new AppError(409,'Keine gültige Freigabe.');
  await db.query("UPDATE plans SET status='executing' WHERE id=$1",[plan.id]);return plan;
 });
 const items=await tenant(job.user_id,async db=>(await db.query('SELECT id FROM action_items WHERE plan_id=$1 ORDER BY id',[plan.id])).rows);
 for(const item of items) {
  let started=false;
  try {
   const target=await tenant(job.user_id,async db=>{
    const current=requireValue((await db.query('SELECT * FROM plans WHERE id=$1',[plan.id])).rows[0]);
    if(current.status==='cancelled'||deadline(current)<Date.now()||process.env.PAUSE_WRITES==='true')throw new AppError(409,'Aktion abgebrochen, pausiert oder Freigabe abgelaufen.');
    const row=requireValue((await db.query(`SELECT m.*,a.id AS item_id,a.message_version FROM action_items a JOIN messages m ON m.id=a.message_id AND m.user_id=a.user_id WHERE a.id=$1 AND a.status='pending' FOR UPDATE OF a,m`,[item.id])).rows[0]);
    if(row.version!==row.message_version)throw new AppError(409,'Nachricht wurde seit der Freigabe verändert. Erneut prüfen.');
    const rules=new Set<string>((await db.query('SELECT sender FROM rules')).rows.map(r=>r.sender));
    if(plan.kind==='trash'&&(row.state!=='active'||!plan.manual_selection&&row.recommendation!=='trash'||protectionReasons(row,rules).length))throw new AppError(409,'Schutzregel verhindert Aufräumen.');
    if(plan.kind==='unsubscribe'&&(!row.unsubscribe_verified||!row.unsubscribe_url||row.unsubscribe_status==='accepted'))throw new AppError(409,'Keine gültige Abmeldung.');
    if(plan.kind==='restore'&&(row.state!=='trashed'||!row.restore_data))throw new AppError(409,'Keine gültige Wiederherstellung.');
    return row;
   });
   const lock=await pool.connect();
   try {
    const locked=(await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[target.account_id])).rows[0].locked;
    if(!locked)throw new AppError(409,'Postfach wird gerade bearbeitet. Erneut prüfen und freigeben.');
    try {
     const account=await tenant(job.user_id,async db=>requireValue((await db.query('SELECT * FROM accounts WHERE id=$1',[target.account_id])).rows[0]) as Account);
     const mail=await makeAdapter(account);
     try {
      // Refresh security signals at the provider immediately before a trash operation.
      if(plan.kind==='trash') {
       const live=await mail.guard(target.remote_id);
       if(protectionReasons({...target,...live}).length)throw new AppError(409,'Aktuelle Schutzsignale verhindern die Aktion.');
      }
      if(plan.kind==='unsubscribe') {
       const content=await mail.content(target.remote_id),url=await verifiedUnsubscribe(content.raw);
       if(!url||url!==decrypt<string>(target.unsubscribe_url,job.user_id))throw new AppError(409,'Abmeldeziel konnte nicht erneut bestätigt werden.');
      }
      // Last database gate after network preparation; cancel/rule updates cannot silently widen an approval.
      await tenant(job.user_id,async db=>{
       const p=requireValue((await db.query('SELECT * FROM plans WHERE id=$1 FOR UPDATE',[plan.id])).rows[0]);
       const m=requireValue((await db.query('SELECT * FROM messages WHERE id=$1 FOR UPDATE',[target.id])).rows[0]);
       if(p.status!=='executing'||deadline(p)<Date.now()||m.version!==target.message_version)throw new AppError(409,'Freigabe nicht mehr aktuell.');
       const rules=new Set<string>((await db.query('SELECT sender FROM rules')).rows.map(r=>r.sender));
       if(plan.kind==='trash'&&protectionReasons(m,rules).length)throw new AppError(409,'Nachricht ist geschützt.');
       await db.query("UPDATE action_items SET status='executing',started_at=now() WHERE id=$1",[item.id]);
      });
      started=true;
      if(plan.kind==='unsubscribe') {
       await sendUnsubscribe(decrypt<string>(target.unsubscribe_url,job.user_id));
       await tenant(job.user_id,db=>db.query("UPDATE messages SET unsubscribe_status='accepted',version=version+1 WHERE account_id=$1 AND sender=$2 AND (id=$3 OR ($4::text IS NOT NULL AND list_id=$4))",[target.account_id,target.sender,target.id,target.list_id]));
      }else if(plan.kind==='trash') {
       const restore=await mail.trash(target.remote_id);
       await tenant(job.user_id,db=>db.query("UPDATE messages SET state='trashed',restore_data=$2,version=version+1 WHERE id=$1",[target.id,restore]));
      }else {
       const remoteId=await mail.restore(target.restore_data as RestoreData);
       await tenant(job.user_id,db=>db.query("UPDATE messages SET state='active',remote_id=$2,restore_data=NULL,version=version+1 WHERE id=$1",[target.id,remoteId]));
      }
      await tenant(job.user_id,db=>db.query("UPDATE action_items SET status='succeeded',completed_at=now() WHERE id=$1",[item.id]));
     }finally{await mail.close();}
    }finally{await lock.query('SELECT pg_advisory_unlock(hashtext($1))',[target.account_id]);}
   }finally{lock.release();}
  }catch(error) {
   await tenant(job.user_id,db=>db.query('UPDATE action_items SET status=$2,error=$3,completed_at=now() WHERE id=$1',[item.id,started?'unknown':'failed',started?'Ergebnis unklar. Im Postfach prüfen; keine automatische Wiederholung.':publicError(error)]));
   const stop=await tenant(job.user_id,async db=>{
    const current=(await db.query('SELECT * FROM plans WHERE id=$1',[plan.id])).rows[0];
    if(!current||current.status==='cancelled'||deadline(current)<Date.now()||process.env.PAUSE_WRITES==='true'){
     await db.query("UPDATE action_items SET status='failed',error='Nicht ausgeführt: Auftrag gestoppt, pausiert oder abgelaufen.',completed_at=now() WHERE plan_id=$1 AND status='pending'",[plan.id]);return true;
    }return false;
   });
   if(stop)break;
  }
 }
 await tenant(job.user_id,async db=>{
  const result=(await db.query("SELECT count(*) FILTER(WHERE status='succeeded')::int AS ok,count(*)::int AS total FROM action_items WHERE plan_id=$1",[plan.id])).rows[0];
  await db.query('UPDATE plans SET status=$2 WHERE id=$1 AND status<>\'cancelled\'',[plan.id,result.ok===result.total?'succeeded':result.ok?'partial':'failed']);
  await db.query('INSERT INTO events(id,user_id,kind,summary) VALUES($1,$2,$3,$4)',[randomUUID(),job.user_id,plan.kind,`${result.ok}/${result.total} Aktionen erfolgreich. Details im Verlauf.`]);
 });
}
export async function workOnce() {
 const job=(await pool.query(`UPDATE jobs SET status='running',locked_at=now() WHERE id=(SELECT j.id FROM jobs j LEFT JOIN settings s ON s.user_id=j.user_id WHERE j.status='queued' AND coalesce(s.activity_paused,false)=false ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1) RETURNING *`)).rows[0] as Job|undefined;
 if(!job)return pollOneBatch();
 const heartbeat=setInterval(()=>{void pool.query("UPDATE jobs SET locked_at=now() WHERE id=$1 AND status='running'",[job.id]).catch(()=>{});},15000);
 try {
  if(job.kind==='scan') {
   const accountId=await tenant(job.user_id,async db=>(await db.query('SELECT account_id FROM scans WHERE id=$1',[job.ref_id])).rows[0]?.account_id);
   if(!accountId)throw new AppError(404,'Postfach entfernt.');
   const lock=await pool.connect();
   try {
    if(!(await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[accountId])).rows[0].locked)throw new AppError(409,'Postfach wird gerade bearbeitet. Scan erneut starten.');
    try{await scanJob(job);}finally{await lock.query('SELECT pg_advisory_unlock(hashtext($1))',[accountId]);}
   }finally{lock.release();}
  }else if(job.kind==='review')await reviewJob(job);else await actionJob(job);
  await tenant(job.user_id,db=>db.query("UPDATE jobs SET status='completed' WHERE id=$1",[job.id]));
 }catch(error) {
  await tenant(job.user_id,async db=>{
   await db.query("UPDATE jobs SET status='failed',error=$2 WHERE id=$1",[job.id,publicError(error)]);
   if(job.kind==='scan')await db.query("UPDATE scans SET status=CASE WHEN status='cancelled' THEN status ELSE 'failed' END,error=$2,completed_at=now() WHERE id=$1",[job.ref_id,publicError(error)]);
   else if(job.kind==='review')await db.query("UPDATE review_runs SET status=CASE WHEN status='cancelled' THEN status WHEN processed>0 THEN 'partial' ELSE 'failed' END,error=$2 WHERE id=$1",[job.ref_id,publicError(error)]);
   else await db.query("UPDATE plans SET status='failed' WHERE id=$1 AND status<>'cancelled'",[job.ref_id]);
  });
 }finally{clearInterval(heartbeat);}
 return true;
}
export async function recoverStaleJobs() {
 const stale=(await pool.query("UPDATE jobs SET status='interrupted' WHERE status='running' AND locked_at<now()-interval '3 minutes' RETURNING *")).rows;
 for(const job of stale)await tenant(job.user_id,async db=>{
  if(job.kind==='scan')await db.query("UPDATE scans SET status='failed',error='Worker unterbrochen. Scan erneut starten.' WHERE id=$1 AND status<>'cancelled'",[job.ref_id]);
  else if(job.kind==='review')await db.query("UPDATE review_runs SET status=CASE WHEN status='cancelled' THEN status ELSE 'needs_attention' END,error='Worker unterbrochen. Kein automatisches erneutes Senden bezahlter Anfragen.' WHERE id=$1",[job.ref_id]);
  else {
   await db.query("UPDATE plans SET status='failed' WHERE id=$1 AND status<>'cancelled'",[job.ref_id]);
   await db.query("UPDATE action_items SET status='unknown',error='Worker unterbrochen. Externen Zustand vor weiteren Aktionen prüfen.' WHERE plan_id=$1 AND status='executing'",[job.ref_id]);
   await db.query("UPDATE action_items SET status='failed',error='Nach Worker-Unterbrechung nicht ausgeführt.' WHERE plan_id=$1 AND status='pending'",[job.ref_id]);
  }
 });
 await pool.query("DELETE FROM connector_tasks WHERE expires_at<now()-interval '5 minutes'");
 await pool.query('DELETE FROM sessions WHERE expires_at<now()');
 await pool.query('DELETE FROM oauth_states WHERE expires_at<now()');
 await pool.query("DELETE FROM auth_attempts WHERE reset_at<now()-interval '1 day'");
 await pool.query("DELETE FROM pattern_cache WHERE expires_at<now()");
 await pool.query("DELETE FROM review_runs WHERE status='preview' AND expires_at<now()-interval '1 day'");
}
