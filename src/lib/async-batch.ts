import {randomUUID} from 'node:crypto';
import {pool,tenant} from './db';
import {decrypt,encrypt} from './crypto';
import {AppError,requireValue} from './errors';
import {readLimited} from './http';
import {packetGroups,groupRequestBody,estimateGroups,parseGroupResults} from './group-ai';
import {applyReviewDecision,finishReview,savePattern} from './reviews';
import type {CleanupConfig,PatternGroup} from './review-types';
import type {Model} from './ai';

type BatchPayload={groups:PatternGroup[];config:CleanupConfig;packets:number[][]};
export async function submitAsyncBatch(userId:string,runId:string,groups:PatternGroup[],config:CleanupConfig,base:Model,billing:Model,keyVersion:number) {
 const packets=packetGroups(groups,config,base),estimate=estimateGroups(groups,config,billing),usageId=randomUUID(),id=randomUUID();
 const key=await tenant(userId,async db=>{
  const settings=requireValue((await db.query('SELECT * FROM settings WHERE user_id=$1 FOR UPDATE',[userId])).rows[0]);
  const run=requireValue((await db.query('SELECT status FROM review_runs WHERE id=$1 FOR UPDATE',[runId])).rows[0]);
  if(run.status!=='running')throw new AppError(409,'Bewertung wurde gestoppt.');
  if(!settings.api_key||!settings.ai_consent||settings.key_version!==keyVersion)throw new AppError(409,'KI-Zugang geändert.');
  const existing=await db.query('SELECT id FROM ai_batches WHERE run_id=$1',[runId]);if(existing.rowCount)throw new AppError(409,'Batch-Auftrag existiert bereits. Keine automatische Zweitübermittlung.');
  const used=(await db.query("SELECT coalesce(sum(coalesce(cost,reserved)),0)::float AS monthly,coalesce(sum(coalesce(cost,reserved)) FILTER(WHERE review_run_id=$1),0)::float AS run FROM usage_events WHERE created_at>=date_trunc('month',now())",[runId])).rows[0];
  if(used.monthly+estimate.reservation>Number(settings.monthly_budget)||used.run+estimate.reservation>Math.min(config.budget,Number(settings.scan_budget)))throw new AppError(409,'Budget reicht nicht für die sichere Batch-Reservierung. Auswahl verkleinern oder Budget selbst anpassen.');
  const payload:BatchPayload={groups,config,packets:packets.map(packet=>packet.map(group=>groups.indexOf(group)))};
  await db.query('INSERT INTO usage_events(id,user_id,review_run_id,model,key_version,reserved) VALUES($1,$2,$3,$4,$5,$6)',[usageId,userId,runId,base.id,keyVersion,estimate.reservation]);
  await db.query("INSERT INTO ai_batches(id,user_id,run_id,status,payload,usage_id) VALUES($1,$2,$3,'submitting',$4,$5)",[id,userId,runId,encrypt(payload,userId),usageId]);
  return decrypt<string>(settings.api_key,userId);
 });
 const requests=packets.map((packet,index)=>({custom_id:`p${index}`,body:groupRequestBody(packet,config)}));
 try {
  const response=await fetch('https://openrouter.ai/api/v1/batches',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({endpoint:'/v1/chat/completions',model:base.id,completion_window:'24h',requests}),redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!response.ok){await response.body?.cancel();if(response.status>=500||response.status===408)throw new AppError(409,'Übermittlung unklar. Remote-Aufträge prüfen; keine automatische Wiederholung.');await tenant(userId,async db=>{await db.query("UPDATE ai_batches SET status='rejected',payload='',error=$2 WHERE id=$1",[id,`Batch abgelehnt: HTTP ${response.status}. Kein automatischer Standardtarif-Fallback.`]);await db.query("UPDATE usage_events SET status='rejected',cost=0 WHERE id=$1",[usageId]);});throw new AppError(409,`Batch abgelehnt: HTTP ${response.status}. Modell-/Kontoberechtigungen und ZDR-Einstellungen prüfen.`);}
  const result=JSON.parse((await readLimited(response,100000)).toString());
  if(!/^[A-Za-z0-9_-]{1,200}$/.test(result.id||''))throw new Error('Invalid batch identifier');
  await tenant(userId,async db=>{await db.query("UPDATE ai_batches SET remote_id=$2,status='pending',next_poll_at=now()+interval '30 seconds' WHERE id=$1",[id,result.id]);await db.query("UPDATE review_runs SET status='waiting_batch' WHERE id=$1 AND status='running'",[runId]);});
 }catch(error){
  await tenant(userId,db=>db.query("UPDATE ai_batches SET status='unknown',error='Übermittlung unklar. Nicht automatisch erneut senden; OpenRouter-Batches prüfen.' WHERE id=$1 AND status='submitting'",[id]));
  throw error;
 }
}
export async function pollOneBatch(onlyRunId:string|null=null) {
 const row=(await pool.query(`UPDATE ai_batches SET next_poll_at=now()+interval '60 seconds' WHERE id=(SELECT b.id FROM ai_batches b JOIN settings s ON s.user_id=b.user_id AND s.activity_paused=false WHERE ($1::uuid IS NULL OR b.run_id=$1) AND b.remote_id IS NOT NULL AND b.status IN ('pending','cleanup') AND (b.next_poll_at IS NULL OR b.next_poll_at<now()) ORDER BY b.created_at FOR UPDATE OF b SKIP LOCKED LIMIT 1) RETURNING *`,[onlyRunId])).rows[0];
 if(!row)return false;
 const settings=await tenant(row.user_id,async db=>requireValue((await db.query('SELECT * FROM settings WHERE user_id=$1',[row.user_id])).rows[0]));
 const usage=await tenant(row.user_id,async db=>requireValue((await db.query('SELECT key_version FROM usage_events WHERE id=$1',[row.usage_id])).rows[0]));
 if(!settings.api_key||settings.key_version!==usage.key_version){await tenant(row.user_id,db=>db.query("UPDATE ai_batches SET status='needs_attention',error='Schlüssel geändert. Remote-Batch und Datenlöschung im OpenRouter-Konto prüfen.' WHERE id=$1",[row.id]));await finishReview(row.user_id,row.run_id,'Batch-Zugang geändert. Ergebnis nicht übernommen; Remote-Auftrag prüfen.');return true;}
 const key=decrypt<string>(settings.api_key,row.user_id),headers={Authorization:`Bearer ${key}`};
 try {
  if(row.status==='cleanup'){
   const response=await fetch(`https://openrouter.ai/api/v1/batches/${row.remote_id}`,{method:'DELETE',headers,redirect:'error',signal:AbortSignal.timeout(30000)});
   let cleanup='openrouter_deleted_upstream_unknown';
   if(response.ok&&response.status!==204){const result=JSON.parse((await readLimited(response,100000)).toString());cleanup=result.deletion?.upstream?.status==='deleted'?'deleted':result.deletion?.upstream?.status==='unsupported'?'openrouter_deleted_upstream_unsupported':result.deletion?.upstream?.status==='not_applicable'?'deleted_not_applicable':cleanup;}else await response.body?.cancel();
   if(response.status===404||response.status===410)cleanup='remote_unavailable';
   if(response.ok||response.status===404||response.status===410)await tenant(row.user_id,db=>db.query("UPDATE ai_batches SET status='completed',cleanup_status=$2,payload='' WHERE id=$1",[row.id,cleanup]));
   return true;
  }
  const response=await fetch(`https://openrouter.ai/api/v1/batches/${row.remote_id}`,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
  if(response.status===429||response.status>=500){await response.body?.cancel();return true;}
  if(!response.ok){await response.body?.cancel();throw new AppError(409,`Remote-Batch nicht abrufbar: HTTP ${response.status}.`);}
  const batch=JSON.parse((await readLimited(response,30_000_000)).toString());
  if(!['completed','failed','expired','cancelled'].includes(batch.status))return true;
  if(batch.status==='completed'&&!Array.isArray(batch.results))return true;
  const payload=decrypt<BatchPayload>(row.payload,row.user_id);let failures=0;
  const seen=new Set<string>();
  for(const result of batch.results||[]){
   const match=/^p(\d+)$/.exec(result.custom_id||'');
   if(!match||seen.has(result.custom_id)||Number(match[1])>=payload.packets.length){failures++;continue;}seen.add(result.custom_id);
   const packet=payload.packets[Number(match[1])].map(i=>payload.groups[i]);
   if(result.error||result.response?.status_code!==200){failures++;continue;}
   try {
    const decisions=parseGroupResults(JSON.parse(result.response.body?.choices?.[0]?.message?.content||''),packet.length);
    for(let i=0;i<packet.length;i++){const applied=await applyReviewDecision(row.user_id,row.run_id,packet[i].members,decisions[i],'ai',payload.config);if(applied)await savePattern(row.user_id,packet[i],payload.config.model,decisions[i]);}
   }catch{failures++;}
  }
  if(seen.size!==payload.packets.length)failures++;
  const cost=batch.usage?.cost==null?null:Number(batch.usage.cost);
  await tenant(row.user_id,async db=>{
   await db.query("UPDATE usage_events SET cost=$2,input_tokens=$3,output_tokens=$4,status=$5 WHERE id=$1",[row.usage_id,cost!==null&&Number.isFinite(cost)&&cost>=0?cost:null,batch.usage?.prompt_tokens||null,batch.usage?.completion_tokens||null,cost!==null?'completed':'unknown']);
   await db.query("UPDATE ai_batches SET status='cleanup',payload='',next_poll_at=now(),error=$2 WHERE id=$1",[row.id,failures||batch.status!=='completed'?'Einzelne Batch-Ergebnisse fehlen oder sind ungültig. Keine automatische Wiederholung.':null]);
  });
  await finishReview(row.user_id,row.run_id,failures||batch.status!=='completed'?'Batch teilweise fehlgeschlagen; verbleibende Nachrichten nicht geändert.':undefined);
 }catch(error){
  if(error instanceof AppError){await tenant(row.user_id,db=>db.query("UPDATE ai_batches SET status='needs_attention',error=$2 WHERE id=$1",[row.id,error.message]));await finishReview(row.user_id,row.run_id,error.message);}
  // Transient network errors keep the known batch ID. Never submit a duplicate.
 }
 return true;
}
