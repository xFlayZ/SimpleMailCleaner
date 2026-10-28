import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool,tenant } from '../src/lib/db';
import { createPlan,approvePlan,startScan } from '../src/lib/service';
import { actionJob } from '../src/lib/jobs';
import type { MailAdapter } from '../src/lib/mail/types';
const alice=randomUUID(),bob=randomUUID(),account=randomUUID(),message=randomUUID();
const anotherMessage=randomUUID();let checks=0;
async function rejects(fn:()=>Promise<unknown>){await assert.rejects(fn);checks++;}
try {
 for(const id of [alice,bob]) {
  await pool.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',[id,`${id}@integration.invalid`,'test-only']);
  await tenant(id,db=>db.query('INSERT INTO settings(user_id) VALUES($1)',[id]));
 }
 await tenant(alice,async db=>{
  await db.query("INSERT INTO accounts(id,user_id,provider,email) VALUES($1,$2,'gmail','test@integration.invalid')",[account,alice]);
  await db.query(`INSERT INTO messages(id,user_id,account_id,remote_id,folder,sender,subject,received_at,recommendation,analyzed_at)
   VALUES($1,$2,$3,'message-1','INBOX','newsletter@integration.invalid','Weekly news',now(),'trash',now())`,[message,alice,account]);
 });
 const invisible=await tenant(bob,db=>db.query('SELECT id FROM messages WHERE id=$1',[message]));assert.equal(invisible.rowCount,0);checks++;
 await rejects(()=>tenant(bob,db=>db.query("INSERT INTO messages(id,user_id,account_id,remote_id,folder,sender,subject,received_at) VALUES($1,$2,$3,'bad','INBOX','x','bad',now())",[randomUUID(),bob,account])));
 await rejects(()=>createPlan(bob,'trash',[message]));
 const plan=await createPlan(alice,'trash',[message]);assert.equal(plan.count,1);checks++;
 // A new message after the snapshot must never join the approval.
 await tenant(alice,db=>db.query("INSERT INTO messages(id,user_id,account_id,remote_id,folder,sender,subject,received_at,recommendation,analyzed_at) VALUES($1,$2,$3,'message-2','INBOX','newsletter@integration.invalid','New arrival',now(),'trash',now())",[anotherMessage,alice,account]));
 await rejects(()=>approvePlan(bob,plan.id,plan.digest));
 await rejects(()=>approvePlan(alice,plan.id,'0'.repeat(64)));
 await approvePlan(alice,plan.id,plan.digest);
 const items=await tenant(alice,db=>db.query('SELECT message_id FROM action_items WHERE plan_id=$1',[plan.id]));assert.deepEqual(items.rows.map(r=>r.message_id),[message]);checks++;
 const jobs=await tenant(alice,db=>db.query('SELECT id FROM jobs WHERE ref_id=$1',[plan.id]));assert.equal(jobs.rowCount,1);checks++;
 await rejects(()=>approvePlan(alice,plan.id,plan.digest));
 await tenant(alice,db=>db.query('INSERT INTO rules(user_id,sender) VALUES($1,$2)',[alice,'newsletter@integration.invalid']));
 await rejects(()=>createPlan(alice,'trash',[anotherMessage]));
 await tenant(alice,db=>db.query('DELETE FROM rules'));
 const expired=await createPlan(alice,'trash',[anotherMessage]);
 await tenant(alice,db=>db.query("UPDATE plans SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]));
 await rejects(()=>approvePlan(alice,expired.id,expired.digest));
 await tenant(alice,db=>db.query("UPDATE action_items SET status='unknown' WHERE plan_id=$1",[plan.id]));
 await rejects(()=>createPlan(alice,'trash',[message]));
 await rejects(()=>startScan(bob,account,'metadata',30,20));
 const scan=await startScan(alice,account,'metadata',30,20);assert.ok(scan.id);checks++;
 await rejects(()=>startScan(alice,account,'metadata',30,20));
 const liveMessage=randomUUID();
 await tenant(alice,db=>db.query("INSERT INTO messages(id,user_id,account_id,remote_id,folder,sender,subject,received_at,recommendation,analyzed_at) VALUES($1,$2,$3,'live-message','INBOX','newsletter@integration.invalid','Another newsletter',now(),'trash',now())",[liveMessage,alice,account]));
 let trashCalls=0,restoreCalls=0,liveFlagged=false,failMutation=false;
 const fake:MailAdapter={list:async()=>[],content:async()=>({text:'',raw:Buffer.alloc(0)}),guard:async()=>({subject:'Another newsletter',flagged:liveFlagged,has_attachments:false}),trash:async()=>{trashCalls++;if(failMutation)throw new Error('timeout');return {remoteId:'trash-id',folder:'INBOX'};},restore:async()=>{restoreCalls++;return 'live-message';},close:async()=>{}};
 const jobFor=(ref:string)=>({id:randomUUID(),user_id:alice,kind:'action',ref_id:ref});
 const notApproved=await createPlan(alice,'trash',[liveMessage]);
 await rejects(()=>actionJob(jobFor(notApproved.id),async()=>fake));assert.equal(trashCalls,0);checks++;
 await approvePlan(alice,notApproved.id,notApproved.digest);
 await tenant(alice,db=>db.query('INSERT INTO rules(user_id,sender) VALUES($1,$2)',[alice,'newsletter@integration.invalid']));
 await actionJob(jobFor(notApproved.id),async()=>fake);assert.equal(trashCalls,0);checks++;
 await tenant(alice,db=>db.query('DELETE FROM rules'));
 const flaggedPlan=await createPlan(alice,'trash',[liveMessage]);await approvePlan(alice,flaggedPlan.id,flaggedPlan.digest);liveFlagged=true;
 await actionJob(jobFor(flaggedPlan.id),async()=>fake);assert.equal(trashCalls,0);checks++;
 const validPlan=await createPlan(alice,'trash',[liveMessage]);await approvePlan(alice,validPlan.id,validPlan.digest);liveFlagged=false;
 await actionJob(jobFor(validPlan.id),async()=>fake);assert.equal(trashCalls,1);checks++;
 const trashed=await tenant(alice,db=>db.query('SELECT state,restore_data FROM messages WHERE id=$1',[liveMessage]));assert.equal(trashed.rows[0].state,'trashed');assert.equal(trashed.rows[0].restore_data.remoteId,'trash-id');checks++;
 const restore=await createPlan(alice,'restore',[liveMessage]);await approvePlan(alice,restore.id,restore.digest);await actionJob(jobFor(restore.id),async()=>fake);assert.equal(restoreCalls,1);checks++;
 const uncertain=await createPlan(alice,'trash',[liveMessage]);await approvePlan(alice,uncertain.id,uncertain.digest);failMutation=true;await actionJob(jobFor(uncertain.id),async()=>fake);
 const unknown=await tenant(alice,db=>db.query('SELECT status FROM action_items WHERE plan_id=$1',[uncertain.id]));assert.equal(unknown.rows[0].status,'unknown');checks++;
 await rejects(()=>createPlan(alice,'trash',[liveMessage]));
 console.log(`${checks} Datenbank-Integrationsprüfungen erfolgreich: RLS, Eigentümer-FK, Freigabebindung, Einmaligkeit, Ablauf, Schutzregeln, unklare Aktionen und Scan-Deduplizierung.`);
}finally {
 await pool.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[[alice,bob]]);
 await pool.end();
}
