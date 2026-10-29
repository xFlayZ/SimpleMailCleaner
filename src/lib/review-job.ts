import {tenant,event} from './db';
import {AppError,publicError} from './errors';
import {reviewSnapshot,cachedPatterns,applyReviewDecision,savePattern,finishReview} from './reviews';
import {planPipeline} from './cleanup-pipeline';
import {analyzeGroups,packetGroups} from './group-ai';
import {submitAsyncBatch} from './async-batch';
import type {Model} from './ai';
import type {Decision,PatternGroup,CleanupConfig} from './review-types';
type Dependencies={classify:typeof analyzeGroups;submitBatch:typeof submitAsyncBatch};
export async function reviewJob(job:{user_id:string;ref_id:string},overrides:Partial<Dependencies>={}) {
 const deps={classify:analyzeGroups,submitBatch:submitAsyncBatch,...overrides};
 const {run,messages,rules,personalRules,config}=await reviewSnapshot(job.user_id,job.ref_id);
 if(!run.approved_at||run.status!=='queued')throw new AppError(409,'Keine gültige Neubewertung.');
 await tenant(job.user_id,db=>db.query("UPDATE review_runs SET status='running' WHERE id=$1 AND status='queued'",[run.id]));
 const check=async()=>{const result=await tenant(job.user_id,async db=>(await db.query('SELECT status FROM review_runs WHERE id=$1',[run.id])).rows[0]);if(!result||result.status!=='running')throw new AppError(409,'Neubewertung gestoppt.');};
 try {
  const plan=planPipeline(messages,config,rules,new Date(run.snapshot_at).getTime(),personalRules);
  const localGroups=new Map<string,{members:typeof messages;decision:Decision}>();
  for(const entry of plan.local){const key=JSON.stringify(entry.decision),group=localGroups.get(key)||{members:[],decision:entry.decision};group.members.push(entry.message);localGroups.set(key,group);}
  for(const group of localGroups.values())for(let start=0;start<group.members.length;start+=100){await check();await applyReviewDecision(job.user_id,run.id,group.members.slice(start,start+100),group.decision,'rules',config);}
  const cache=await cachedPatterns(job.user_id,plan.groups,run.model||'',config.reuseCache&&config.analysisMode==='grouped');
  const pending:PatternGroup[]=[];
  for(const group of plan.groups){
   const result=cache.get(group.fingerprint);
   if(result){await check();await applyReviewDecision(job.user_id,run.id,group.members,result,'cache',config);}else pending.push(group);
  }
  if(config.method==='local') {
   for(const group of pending){await check();await applyReviewDecision(job.user_id,run.id,group.members,{category:group.newsletter?'newsletter':'unclear',action:'review',confidence:'low',reason:'Kein eindeutiger lokaler Treffer; manuelle Prüfung empfohlen.'},'rules',config);}
  }else if(pending.length){
   const base=run.model_price?.base as Model,billing=run.model_price?.billing as Model;
   if(!base||!billing)throw new AppError(409,'Modellpreis fehlt. Vorschau neu erstellen.');
   if(config.method==='batch'){await check();await deps.submitBatch(job.user_id,run.id,pending,config,base,billing,run.key_version);return;}
   for(const packet of packetGroups(pending,config,base)){
    await check();const decisions=await deps.classify(job.user_id,run.id,packet,config,base,run.key_version);
    if(decisions.length!==packet.length)throw new AppError(422,'Unvollständige Musterbewertung.');
    for(let i=0;i<packet.length;i++){const applied=await applyReviewDecision(job.user_id,run.id,packet[i].members,decisions[i],'ai',config);if(applied)await savePattern(job.user_id,packet[i],run.model,decisions[i]);}
   }
  }
  await finishReview(job.user_id,run.id);
  await event(job.user_id,'review','Neubewertung des erfassten Bestands abgeschlossen. Keine E-Mails verschoben.');
 }catch(error){await finishReview(job.user_id,run.id,publicError(error));throw error;}
}
