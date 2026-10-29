import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,tenant} from '../src/lib/db';
import {previewReview,startReview} from '../src/lib/reviews';
import {reviewJob} from '../src/lib/review-job';
import {messagePage,manualDecision} from '../src/lib/message-query';
import {aggregateOverview,groupedMessages} from '../src/lib/aggregate';
import {cleanupConfigSchema} from '../src/lib/review-types';
import {planPipeline} from '../src/lib/cleanup-pipeline';
import {submitAsyncBatch,pollOneBatch} from '../src/lib/async-batch';
import {encrypt} from '../src/lib/crypto';
const user=randomUUID(),other=randomUUID(),account=randomUUID();let checks=0;
const originalFetch=globalThis.fetch;
const model={id:'fixture',name:'fixture',context_length:32000,pricing:{prompt:'0.0000001',completion:'0.0000004'}};
const check=(value:unknown)=>{assert.ok(value);checks++;};
async function run(id:string,overrides:Parameters<typeof reviewJob>[1]={}){await reviewJob({user_id:user,ref_id:id},overrides);}
async function customRun(method='worker'){
 const id=randomUUID(),config=cleanupConfigSchema.parse({method,model:'fixture',newsletters:false,promotions:false});
 await tenant(user,async db=>{
  await db.query("INSERT INTO review_runs(id,user_id,config,filters,model,model_price,key_version,total,status,approved_at) VALUES($1,$2,$3,'{}','fixture',$4,1,4,'queued',now())",[id,user,config,{base:model,billing:model}]);
  await db.query("INSERT INTO review_targets(user_id,run_id,message_id,message_version) SELECT user_id,$1,id,version FROM messages WHERE remote_id LIKE 'pattern-%'",[id]);
 });return {id,config};
}
try{
 for(const id of [user,other]){await pool.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,\'test-only\')',[id,`${id}@review-test.invalid`]);await tenant(id,db=>db.query('INSERT INTO settings(user_id) VALUES($1)',[id]));}
 await tenant(user,async db=>{
  await db.query("INSERT INTO accounts(id,user_id,provider,email) VALUES($1,$2,'gmail','review@example.invalid')",[account,user]);
  await db.query(`INSERT INTO messages(id,user_id,account_id,remote_id,folder,sender,subject,received_at,is_read,list_id,newsletter_signal)
   SELECT md5($1::text||g::text)::uuid,$1::uuid,$2::uuid,'bulk-'||g,'INBOX','newsletter@example.invalid','Weekly offer '||g,'2025-01-01',true,'list.example.invalid',true FROM generate_series(1,2101) g`,[user,account]);
  await db.query(`INSERT INTO messages(id,user_id,account_id,remote_id,folder,sender,subject,received_at,is_read)
   SELECT md5($1::text||'pattern'||g)::uuid,$1::uuid,$2::uuid,'pattern-'||g,'INBOX','status@example.invalid','Your weekly digest '||g,'2025-01-01',true FROM generate_series(1,4) g`,[user,account]);
 });
 const page=await messagePage(user,{pageSize:100});check(page.total===2105&&page.items.length===100&&page.pages===22);
 const second=await messagePage(user,{page:2,pageSize:100});check(!page.items.some(m=>second.items.some(n=>n.id===m.id)));
 check((await aggregateOverview(user)).summary.tracked===2105);check((await groupedMessages(user,{})).items[0].count===2101);
 check((await messagePage(other,{})).total===0);
 const preview=await previewReview(user,{filters:{},config:{method:'local'}});check(preview.stats.localTrash===2101&&preview.estimate.high===0);
 await assert.rejects(()=>startReview(other,preview.id,{ai:false,batch:false}));checks++;
 // User edits after preview must win over stale review targets.
 await manualDecision(user,[page.items[0].id],'keep');
 await startReview(user,preview.id,{ai:false,batch:false});await run(preview.id,{classify:async()=>{throw new Error('No AI for local mode');}});
 const result=await tenant(user,async db=>(await db.query('SELECT * FROM review_runs WHERE id=$1',[preview.id])).rows[0]);check(result.status==='completed'&&result.processed===2104&&result.skipped===1);
 check((await tenant(user,async db=>(await db.query('SELECT recommendation,state FROM messages WHERE id=$1',[page.items[0].id])).rows[0])).recommendation==='keep');
 check((await tenant(user,db=>db.query("SELECT id FROM messages WHERE state<>'active'"))).rowCount===0);
 await tenant(user,db=>db.query("UPDATE messages SET flagged=true WHERE id=$1",[page.items[0].id]));
 await assert.rejects(()=>manualDecision(user,[page.items[0].id],'trash'));checks++;
 let calls=0;const first=await customRun();await run(first.id,{classify:async(_u,_r,groups)=>{calls++;check(groups.length===1&&groups[0].members.length===4);return [{category:'unclear',action:'review',confidence:'low',reason:'Manuell prüfen.'}];}});check(calls===1);
 const again=await customRun();await run(again.id,{classify:async()=>{throw new Error('Cache should eliminate AI');}});check((await tenant(user,db=>db.query("SELECT id FROM messages WHERE remote_id LIKE 'pattern-%' AND decision_source='cache'"))).rowCount===4);
 check((await tenant(other,db=>db.query('SELECT * FROM pattern_cache'))).rowCount===0);
 // Explicit batch submission fixtures: no provider or mailbox traffic.
 await tenant(user,db=>db.query('UPDATE settings SET api_key=$2,ai_consent=true,key_version=1,scan_budget=10,monthly_budget=100 WHERE user_id=$1',[user,encrypt('test-key-only',user)]));
 const batch=await customRun('batch');await tenant(user,db=>db.query("UPDATE review_runs SET status='running' WHERE id=$1",[batch.id]));
 const members=await tenant(user,async db=>(await db.query("SELECT * FROM messages WHERE remote_id LIKE 'pattern-%'")).rows);
 const groups=planPipeline(members,batch.config,new Set()).groups;let posts=0,deletes=0;
 globalThis.fetch=async(_url,init)=>{if(init?.method==='POST'){posts++;return new Response(JSON.stringify({id:'fixture_batch'}),{status:202});}if(init?.method==='DELETE'){deletes++;return new Response(JSON.stringify({deletion:{openrouter:'deleted',upstream:{status:'deleted'}}}),{status:200});}return new Response(JSON.stringify({status:'completed',usage:{cost:.0001},results:[{custom_id:'p0',response:{status_code:200,body:{choices:[{message:{content:JSON.stringify({items:[[0,'unclear','review','low','Muster geprüft']]})}}]}}}]}));};
 await submitAsyncBatch(user,batch.id,groups,batch.config,model,model,1);check(posts===1);
 await assert.rejects(()=>submitAsyncBatch(user,batch.id,groups,batch.config,model,model,1));check(posts===1);
 await tenant(user,db=>db.query('UPDATE ai_batches SET next_poll_at=now()-interval \'1 minute\' WHERE run_id=$1',[batch.id]));await pollOneBatch(batch.id);await pollOneBatch(batch.id);check(deletes===1);
 const completed=await tenant(user,async db=>(await db.query('SELECT status,cleanup_status,payload FROM ai_batches WHERE run_id=$1',[batch.id])).rows[0]);check(completed.status==='completed'&&completed.cleanup_status==='deleted'&&completed.payload==='');
 const unknown=await customRun('batch');await tenant(user,db=>db.query("UPDATE review_runs SET status='running' WHERE id=$1",[unknown.id]));
 globalThis.fetch=async()=>new Response('ambiguous',{status:503});await assert.rejects(()=>submitAsyncBatch(user,unknown.id,groups,unknown.config,model,model,1));
 const uncertain=await tenant(user,async db=>(await db.query('SELECT b.status,u.cost FROM ai_batches b JOIN usage_events u ON u.id=b.usage_id WHERE b.run_id=$1',[unknown.id])).rows[0]);check(uncertain.status==='unknown'&&uncertain.cost===null);
 console.log(`${checks} Neubewertungs-Integrationsprüfungen erfolgreich: >2000 Nachrichten, Seiten, Tenant-Isolation, Schutz, Versionen, Gruppen-Cache, Batch-Reservierung, keine Doppelübermittlung und Remote-Löschung (HTTP-Fixtures).`);
}finally{globalThis.fetch=originalFetch;for(const id of [user,other])await pool.query('DELETE FROM users WHERE id=$1',[id]);await pool.end();}
