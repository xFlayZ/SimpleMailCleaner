import {z} from 'zod';
import type {PoolClient} from 'pg';
import {tenant} from './db';
import {AppError,requireValue} from './errors';
import {features,personalConfig,matchesPersonal,trainingSelection} from './personal-filter';
import {protectionReasons} from './policy';
import type {IndexedMessage} from './review-types';
export async function correctionFeedback(db:PoolClient,userId:string,m:IndexedMessage,action:string){
 const decision=action==='trash'?'remove':action==='keep'?'keep':'skip';
 await db.query(`INSERT INTO training_feedback(user_id,account_id,message_id,original,decision,scope,kind,features,contributes) VALUES($1,$2,$3,$4,$5,'similar','correction',$6,true)`,[userId,m.account_id,m.id,{category:m.category,recommendation:m.recommendation,reason:m.reason,source:m.decision_source},decision,features(m)]);
 const rules=(await db.query('SELECT * FROM learned_filter_rules WHERE account_id=$1 AND enabled AND config->>\'sender\'=$2',[m.account_id,m.sender.toLowerCase()])).rows;
 for(const r of rules)if(matchesPersonal(m,r.config)&&decision!==r.config.decision)await db.query('UPDATE learned_filter_rules SET enabled=false,revision=revision+1,updated_at=now(),history=$2 WHERE id=$1',[r.id,JSON.stringify([...r.history,{name:r.name,config:r.config,priority:r.priority,enabled:r.enabled,at:new Date().toISOString(),reason:'Manuelle Korrektur widerspricht Regel'}].slice(-20))]);
}
export async function trainingState(userId:string,accountId:string){
 return tenant(userId,async db=>{
  const session=(await db.query("SELECT * FROM training_sessions WHERE account_id=$1 AND status<>'completed' ORDER BY created_at DESC LIMIT 1",[accountId])).rows[0]||null;
  let message=null;if(session){const id=session.targets[session.cursor];if(id)message=(await db.query('SELECT * FROM messages WHERE id=$1',[id])).rows[0]||null;}
  const rules=(await db.query('SELECT * FROM learned_filter_rules WHERE account_id=$1 ORDER BY priority,created_at DESC',[accountId])).rows;
  const stats=(await db.query(`SELECT count(DISTINCT message_id)::int AS rated,count(*) FILTER(WHERE kind='correction')::int AS corrections FROM training_feedback WHERE account_id=$1`,[accountId])).rows[0];
  const classifications=(await db.query(`SELECT count(*) FILTER(WHERE decision_source='rules')::int AS local,count(*) FILTER(WHERE decision_source='ai')::int AS external FROM messages WHERE account_id=$1`,[accountId])).rows[0];
  const cost=(await db.query('SELECT coalesce(sum(cost),0) AS cost FROM usage_events')).rows[0];
  return {session,message,rules,stats:{...stats,...classifications,cost:Number(cost.cost),activeRules:rules.filter(r=>r.enabled).length}};
 });
}
export async function startTraining(userId:string,input:unknown){
 const data=z.object({accountId:z.uuid(),size:z.union([z.literal(10),z.literal(20),z.literal(50)]),repeat:z.boolean().default(false)}).parse(input);
 return tenant(userId,async db=>{
  requireValue((await db.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[data.accountId])).rows[0]);
  if((await db.query("SELECT id FROM training_sessions WHERE account_id=$1 AND status<>'completed'",[data.accountId])).rows.length)throw new AppError(409,'Vorhandene Session zuerst fortsetzen oder abschließen.');
  const messages=(await db.query(`SELECT m.* FROM messages m WHERE account_id=$1 AND state='active' AND ($2 OR NOT EXISTS(SELECT 1 FROM training_feedback f WHERE f.message_id=m.id)) ORDER BY md5(m.id::text) LIMIT 50000`,[data.accountId,data.repeat])).rows;
  const targets=trainingSelection(messages,data.size);if(!targets.length)throw new AppError(422,'Keine unbewerteten Nachrichten vorhanden. Erneute Prüfung aktivieren.');
  await db.query('INSERT INTO training_sessions(user_id,account_id,size,targets) VALUES($1,$2,$3,$4)',[userId,data.accountId,data.size,JSON.stringify(targets)]);return {ok:true};
 });
}
export async function trainFeedback(userId:string,input:unknown){
 const data=z.object({sessionId:z.uuid(),messageId:z.uuid(),version:z.number().int(),decision:z.enum(['keep','archive','remove','skip']),reasons:z.array(z.enum(['sender','subject','age','type','relevance','other'])).max(6),explanation:z.string().trim().max(2000),scope:z.enum(['message','similar','rule']),contributes:z.boolean()}).parse(input);
 return tenant(userId,async db=>{
  const s=requireValue((await db.query('SELECT * FROM training_sessions WHERE id=$1 FOR UPDATE',[data.sessionId])).rows[0]);
  if(s.status!=='active'||s.targets[s.cursor]!==data.messageId)throw new AppError(409,'Session pausiert oder bereits weitergeschaltet.');
  const m=(await db.query("SELECT * FROM messages WHERE id=$1 AND state='active' FOR UPDATE",[data.messageId])).rows[0];
  if(m&&m.version!==data.version)throw new AppError(409,'Nachricht wurde verändert. Ansicht neu laden.');
  if(m){await db.query(`INSERT INTO training_feedback(user_id,account_id,message_id,session_id,original,decision,reasons,explanation,scope,contributes,kind,features) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[userId,m.account_id,m.id,s.id,{category:m.category,recommendation:m.recommendation,reason:m.reason,source:m.decision_source},data.decision,JSON.stringify(data.reasons),data.explanation,data.scope,data.contributes&&data.decision!=='skip',m.recommendation!==(data.decision==='remove'?'trash':data.decision==='keep'?'keep':'review')?'correction':'training',features(m)]);
   if(data.decision!=='skip')await db.query("UPDATE messages SET personal_disposition=$2,recommendation=$3,decision_source='manual',analysis_mode='manual',reason='Persönliches Trainingsfeedback',version=version+1 WHERE id=$1",[m.id,data.decision,data.decision==='remove'?'trash':data.decision==='keep'?'keep':'review']);
  }
  await db.query("UPDATE training_sessions SET cursor=cursor+1,status=CASE WHEN cursor+1>=jsonb_array_length(targets) THEN 'completed' ELSE status END WHERE id=$1",[s.id]);
  await suggestRules(db,userId,s.account_id);return {ok:true};
 });
}
export async function suggestRules(db:PoolClient,userId:string,accountId:string){
 const rows=(await db.query(`SELECT DISTINCT ON(message_id) * FROM training_feedback WHERE account_id=$1 AND contributes AND decision<>'skip' ORDER BY message_id,created_at DESC,id`,[accountId])).rows;
 const patterns=new Map<string,typeof rows>();
 for(const row of rows)for(const term of row.features.terms||[]){const key=JSON.stringify([row.features.sender,row.features.category,term]);patterns.set(key,[...(patterns.get(key)||[]),row]);}
 for(const [signature,items] of patterns){if(items.length<3||new Set(items.map(i=>i.decision)).size!==1)continue;const [sender,category,term]=JSON.parse(signature);const config=personalConfig.parse({sender,category,terms:[term],decision:items[0].decision});
  await db.query(`INSERT INTO learned_filter_rules(user_id,account_id,name,config,support,signature) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,account_id,signature) DO UPDATE SET support=excluded.support`,[userId,accountId,`${sender}: ${term}`,config,items.length,signature]);
 }
 // Contradictions disable affected suggestions and active rules; confirmation must follow a fresh review.
 for(const row of (await db.query('SELECT * FROM learned_filter_rules WHERE account_id=$1',[accountId])).rows){if(rows.some(f=>f.decision!==row.config.decision&&f.features.sender===row.config.sender&&f.features.category===row.config.category&&f.features.terms.some((t:string)=>row.config.terms.includes(t))))await db.query('UPDATE learned_filter_rules SET enabled=false,revision=revision+1,updated_at=now(),history=$2 WHERE id=$1 AND enabled',[row.id,JSON.stringify([...row.history,{name:row.name,config:row.config,priority:row.priority,enabled:row.enabled,at:new Date().toISOString(),reason:'Widersprüchliches Feedback'}].slice(-20))]);}
}
export async function trainingPause(userId:string,input:unknown){const d=z.object({id:z.uuid(),paused:z.boolean()}).parse(input);await tenant(userId,db=>db.query("UPDATE training_sessions SET status=$2 WHERE id=$1 AND status<>'completed'",[d.id,d.paused?'paused':'active']));return {ok:true};}
export async function createPersonalRule(userId:string,input:unknown){const d=z.object({accountId:z.uuid(),name:z.string().min(1).max(160),config:personalConfig}).parse(input);return tenant(userId,async db=>{requireValue((await db.query('SELECT id FROM accounts WHERE id=$1',[d.accountId])).rows[0]);await db.query("INSERT INTO learned_filter_rules(user_id,account_id,name,config,signature,origin) VALUES($1,$2,$3,$4,gen_random_uuid()::text,'manual')",[userId,d.accountId,d.name,d.config]);return {ok:true};});}
export async function personalRuleAction(userId:string,input:unknown){
 const d=z.object({id:z.uuid(),operation:z.enum(['save','test','delete','undo']),revision:z.number().int(),name:z.string().min(1).max(160).optional(),config:personalConfig.optional(),enabled:z.boolean().optional(),priority:z.number().int().min(0).max(10000).optional(),confirm:z.boolean().default(false)}).parse(input);
 return tenant(userId,async db=>{const r=requireValue((await db.query('SELECT * FROM learned_filter_rules WHERE id=$1 FOR UPDATE',[d.id])).rows[0]);if(r.revision!==d.revision)throw new AppError(409,'Regel inzwischen verändert. Neu laden.');const config=d.config||r.config;
  if(d.operation==='test'){const rows=(await db.query("SELECT * FROM messages WHERE account_id=$1 AND lower(sender)=lower($2) AND state='active' LIMIT 50001",[r.account_id,config.sender])).rows;const senders=new Set<string>((await db.query('SELECT sender FROM rules')).rows.map(r=>r.sender));const hits=rows.filter(m=>matchesPersonal(m,config)&&!protectionReasons(m,senders).length);return {count:hits.length,sample:hits.slice(0,10).map(m=>({subject:m.subject,sender:m.sender})),limited:rows.length>50000};}
  if(d.operation==='delete'){await db.query('DELETE FROM learned_filter_rules WHERE id=$1',[r.id]);return {ok:true};}
  if(d.enabled&&!d.confirm)throw new AppError(422,'Regel nach Vorschau ausdrücklich bestätigen.');
  if(d.enabled){const feedback=(await db.query("SELECT DISTINCT ON(message_id) * FROM training_feedback WHERE account_id=$1 AND contributes ORDER BY message_id,created_at DESC,id",[r.account_id])).rows;const conflict=feedback.some(f=>f.decision!=='skip'&&f.decision!==config.decision&&f.features.sender===config.sender&&f.features.category===config.category&&f.features.terms.some((t:string)=>config.terms.includes(t)));if(conflict)throw new AppError(409,'Widersprüchliches Feedback vorhanden. Bedingungen enger fassen oder das Beispiel erneut prüfen.');}
  const history=[...r.history,{name:r.name,config:r.config,enabled:r.enabled,priority:r.priority,at:new Date().toISOString()}].slice(-20);let next={name:d.name||r.name,config,enabled:d.enabled??r.enabled,priority:d.priority??r.priority};
  if(d.operation==='undo'){const previous=r.history.at(-1);if(!previous)throw new AppError(409,'Keine vorherige Version.');next={...previous,enabled:false};}
  await db.query('UPDATE learned_filter_rules SET name=$2,config=$3,enabled=$4,priority=$5,history=$6,revision=revision+1,updated_at=now() WHERE id=$1',[r.id,next.name,next.config,next.enabled,next.priority,JSON.stringify(history)]);return {ok:true};});
}
