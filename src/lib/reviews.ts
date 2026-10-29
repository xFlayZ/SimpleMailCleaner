import {personalDecision} from './personal-filter';
import {randomUUID} from 'node:crypto';
import {tenant} from './db';
import {AppError,requireValue} from './errors';
import {models,modelReason,type Model} from './ai';
import {matchingMessages} from './message-query';
import {cleanupConfigSchema,reviewFilterSchema,type CleanupConfig,type IndexedMessage,type PatternGroup,type ReviewPreview,type Decision} from './review-types';
import {planPipeline,constrainDecision} from './cleanup-pipeline';
import {estimateGroups} from './group-ai';
import {protectionReasons} from './policy';

export async function reviewModel(modelId:string,method:string) {
 const catalog=await models();const base=requireValue(catalog.find(m=>m.id===modelId),'Modell nicht im aktuellen Katalog.');
 if(modelReason(base))throw new AppError(409,modelReason(base)!);
 if(method!=='batch')return {base,billing:base};
 const variant=catalog.find(m=>m.id===`${base.id}:batch`);
 if(!variant)throw new AppError(409,'Für dieses Modell sind keine Batch-Preise im Katalog vorhanden. Worker-Modus oder ein anderes Modell wählen.');
 return {base,billing:variant};
}
export async function cachedPatterns(userId:string,groups:PatternGroup[],model:string,reuse:boolean) {
 if(!reuse||!groups.length)return new Map<string,Decision>();
 const result=await tenant(userId,db=>db.query('SELECT fingerprint,result FROM pattern_cache WHERE model=$1 AND fingerprint=ANY($2::text[]) AND expires_at>now()',[model,groups.map(g=>g.fingerprint)]));
 return new Map<string,Decision>(result.rows.map(r=>[r.fingerprint,r.result]));
}
export async function previewReview(userId:string,input:{filters:unknown;config:unknown;ids?:string[]}):Promise<ReviewPreview> {
 const filters=reviewFilterSchema.parse(input.filters),config=cleanupConfigSchema.parse(input.config);
 if(filters.state!=='active')throw new AppError(422,'Neubewertung nur für aktive Nachrichten möglich.');
 const snapshot=await tenant(userId,async db=>({messages:await matchingMessages(db,filters,config.maxMessages||50000,input.ids),rules:new Set<string>((await db.query('SELECT sender FROM rules')).rows.map(r=>r.sender)),settings:requireValue((await db.query('SELECT * FROM settings WHERE user_id=$1',[userId])).rows[0])}));
 if(!snapshot.messages.length)throw new AppError(422,'Keine Nachrichten passen zu dieser Auswahl.');
 config.model=config.model||snapshot.settings.model;
 let chosen:{base:Model;billing:Model}|null=null;
 if(config.method!=='local'){
  if(!snapshot.settings.api_key||!snapshot.settings.ai_consent)throw new AppError(409,'Zuerst KI-Schlüssel und Einwilligung in den Einstellungen hinterlegen.');
  chosen=await reviewModel(config.model,config.method);
 }
 const personalRules=await tenant(userId,async db=>(await db.query('SELECT * FROM learned_filter_rules WHERE enabled')).rows);
 const pipeline=planPipeline(snapshot.messages,config,snapshot.rules,Date.now(),personalRules);
 const cache=chosen?await cachedPatterns(userId,pipeline.groups,chosen.base.id,config.reuseCache):new Map<string,Decision>();
 const unresolved=pipeline.groups.filter(g=>!cache.has(g.fingerprint));
 const estimate=chosen?estimateGroups(unresolved,config,chosen.billing):{low:0,high:0,reservation:0,requests:0};
 const stats={...pipeline.stats,cachedGroups:pipeline.groups.filter(g=>cache.has(g.fingerprint)).length,aiGroups:config.method==='local'?0:unresolved.length,aiMessages:config.method==='local'?0:unresolved.reduce((n,g)=>n+g.members.length,0),requests:estimate.requests};
 const id=randomUUID();
 await tenant(userId,async db=>{
  await db.query('INSERT INTO review_runs(id,user_id,config,filters,model,model_price,key_version,total,stats,estimated_low,estimated_high) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,userId,config,filters,chosen?.base.id||null,chosen?{base:chosen.base,billing:chosen.billing}:null,snapshot.settings.key_version,snapshot.messages.length,stats,estimate.low,estimate.high]);
  await db.query(`INSERT INTO review_targets(user_id,run_id,message_id,message_version) SELECT $1::uuid,$2::uuid,t.id,t.version FROM jsonb_to_recordset($3::jsonb) AS t(id uuid,version int)`,[userId,id,JSON.stringify(snapshot.messages.map(m=>({id:m.id,version:m.version})))]);
 });
 const sample=pipeline.local.slice(0,12).map(x=>({subject:x.message.subject,sender:x.message.sender,action:x.decision.action,reason:x.decision.reason}));
 for(const group of pipeline.groups.slice(0,8)){const cached=cache.get(group.fingerprint);sample.push({subject:group.samples[0],sender:group.sender,action:cached?.action||'review',reason:cached?'Bereits bewertetes Muster wiederverwendet.':config.method==='local'?'Kein eindeutiger lokaler Treffer; bleibt zur Prüfung.':'Verbleibendes Muster wird gemeinsam bewertet.'});}
 return {id,expiresAt:new Date(Date.now()+900000).toISOString(),stats,estimate:{...estimate,currency:'USD',model:chosen?.base.id||'',batch:config.method==='batch'},sample,method:config.method};
}
export async function startReview(userId:string,id:string,consent:{ai:boolean;batch:boolean}) {
 return tenant(userId,async db=>{
  const run=requireValue((await db.query('SELECT * FROM review_runs WHERE id=$1 FOR UPDATE',[id])).rows[0]);
  if(run.status!=='preview'||new Date(run.expires_at).getTime()<Date.now())throw new AppError(409,'Vorschau abgelaufen oder bereits gestartet.');
  const config=cleanupConfigSchema.parse(run.config);
  if(config.method!=='local'&&!consent.ai)throw new AppError(422,'KI-Verarbeitung benötigt eine ausdrückliche Bestätigung.');
  if(config.method==='batch'&&!consent.batch)throw new AppError(422,'Asynchroner Batch benötigt eine gesonderte Einwilligung zur zeitweisen Speicherung ohne ZDR.');
  if(config.method!=='local'){
   const settings=requireValue((await db.query('SELECT * FROM settings WHERE user_id=$1',[userId])).rows[0]);
   if(!settings.api_key||!settings.ai_consent||settings.key_version!==run.key_version)throw new AppError(409,'KI-Zugang seit Vorschau geändert. Vorschau neu erstellen.');
  }
  await db.query("UPDATE review_runs SET status='queued',approved_at=now() WHERE id=$1",[id]);
  await db.query("INSERT INTO jobs(id,user_id,kind,ref_id) VALUES($1,$2,'review',$3)",[randomUUID(),userId,id]);
  return {ok:true,id};
 });
}
export async function reviewSnapshot(userId:string,id:string) {
 return tenant(userId,async db=>{
  const run=requireValue((await db.query('SELECT * FROM review_runs WHERE id=$1',[id])).rows[0]);
  const messages=(await db.query(`SELECT m.* FROM review_targets t JOIN messages m ON m.id=t.message_id AND m.user_id=t.user_id WHERE t.run_id=$1 AND t.status='pending' AND m.version=t.message_version AND m.state='active' ORDER BY m.received_at DESC,m.id`,[id])).rows as IndexedMessage[];
  const rules=new Set<string>((await db.query('SELECT sender FROM rules')).rows.map(r=>r.sender));
  const personalRules=(await db.query('SELECT * FROM learned_filter_rules WHERE enabled')).rows;
  return {run,messages,rules,personalRules,config:cleanupConfigSchema.parse(run.config)};
 });
}
export async function applyReviewDecision(userId:string,runId:string,members:IndexedMessage[],raw:Decision,source:string,config:CleanupConfig) {
 return tenant(userId,async db=>{
  const run=requireValue((await db.query('SELECT status FROM review_runs WHERE id=$1 FOR UPDATE',[runId])).rows[0]);
  if(!['running','waiting_batch'].includes(run.status))return 0;
  const rows=(await db.query(`SELECT m.* FROM messages m JOIN review_targets t ON t.message_id=m.id AND t.user_id=m.user_id WHERE t.run_id=$1 AND m.id=ANY($2::uuid[]) AND t.status='pending' AND m.version=t.message_version AND m.state='active' FOR UPDATE OF m,t`,[runId,members.map(m=>m.id)])).rows;
  const rules=new Set<string>((await db.query('SELECT sender FROM rules')).rows.map(r=>r.sender));let changed=0;
  for(const row of rows){
   const reasons=protectionReasons(row,rules);
   let proposed=raw;
   if(raw.reason.startsWith('Persönliche Regel ')){const current=(await db.query('SELECT * FROM learned_filter_rules WHERE enabled')).rows;proposed=personalDecision(row,current,rules)||{category:row.category,action:'review',confidence:'low',reason:'Persönliche Regel seit Planung geändert oder deaktiviert.'};}
   const decision=reasons.length?{...proposed,action:'keep' as const,reason:reasons.join('; ')}:constrainDecision(proposed,config);
   if(row.recommendation!==decision.action||row.category!==decision.category)changed++;
   await db.query('UPDATE messages SET category=$2,recommendation=$3,reason=$4,decision_source=$5,decision_confidence=$6,analysis_mode=$5,analyzed_at=now(),version=version+1 WHERE id=$1',[row.id,decision.category,decision.action,decision.reason,source,decision.confidence]);
   await db.query("UPDATE review_targets SET status='applied' WHERE run_id=$1 AND message_id=$2",[runId,row.id]);
  }
  await db.query('UPDATE review_runs SET processed=processed+$2,changed=changed+$3 WHERE id=$1',[runId,rows.length,changed]);
  return rows.length;
 });
}
export async function savePattern(userId:string,group:PatternGroup,model:string,result:Decision) {
 await tenant(userId,db=>db.query("INSERT INTO pattern_cache(user_id,fingerprint,model,result) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,fingerprint,model) DO UPDATE SET result=excluded.result,expires_at=now()+interval '30 days'",[userId,group.fingerprint,model,result]));
}
export async function finishReview(userId:string,id:string,error?:string) {
 await tenant(userId,async db=>{
  await db.query("UPDATE review_targets SET status='skipped' WHERE run_id=$1 AND status='pending'",[id]);
  const skipped=(await db.query("SELECT count(*)::int AS n FROM review_targets WHERE run_id=$1 AND status='skipped'",[id])).rows[0].n;
  await db.query("UPDATE review_runs SET status=CASE WHEN status='cancelled' THEN status WHEN $3::text IS NULL THEN 'completed' WHEN processed>0 THEN 'partial' ELSE 'failed' END,error=$3,skipped=$2,completed_at=now() WHERE id=$1",[id,skipped,error||null]);
 });
}
