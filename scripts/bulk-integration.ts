import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,tenant} from '../src/lib/db';
import {createBulkCleanup} from '../src/lib/bulk-cleanup';
import {approvePlan,createPlan} from '../src/lib/service';
import {actionJob} from '../src/lib/jobs';
import type {MailAdapter} from '../src/lib/mail/types';
const user=randomUUID(),other=randomUUID(),account=randomUUID(),account2=randomUUID();let checks=0,calls=0;
const check=(v:unknown)=>{assert.ok(v);checks++;};
const fake:MailAdapter={list:async()=>[],content:async()=>{throw new Error('No bodies for trash');},guard:async()=>({subject:'Weekly digest',flagged:false,has_attachments:false}),trash:async remoteId=>{calls++;return {remoteId,folder:'INBOX'};},restore:async()=>'',close:async()=>{}};
try{
 for(const id of [user,other]){await pool.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture')",[id,`${id}@bulk-test.invalid`]);await tenant(id,db=>db.query('INSERT INTO settings(user_id) VALUES($1)',[id]));}
 await tenant(user,async db=>{
  for(const id of [account,account2])await db.query("INSERT INTO accounts(id,user_id,provider,email) VALUES($1,$2,'gmail',$3)",[id,user,`${id}@mail.invalid`]);
  await db.query(`INSERT INTO messages(id,user_id,account_id,remote_id,folder,sender,subject,received_at,is_read,list_id,recommendation,flagged)
   SELECT md5($1::text||g)::uuid,$1::uuid,$2::uuid,'news-'||g,'INBOX','digest@example.invalid','Weekly digest '||g,'2024-12-31',true,'digest',CASE WHEN g%2=0 THEN 'keep' ELSE 'trash' END,g=1 FROM generate_series(1,125) g`,[user,account]);
  await db.query(`INSERT INTO messages(id,user_id,account_id,remote_id,folder,sender,subject,received_at,recommendation) VALUES
   ($1,$2,$3,'boundary','INBOX','digest@example.invalid','Boundary','2025-01-01','keep'),
   ($4,$2,$3,'personal','INBOX','personal@example.invalid','Ordinary message','2024-01-01','keep'),
   ($5,$2,$6,'second','INBOX','digest@example.invalid','Second account','2024-01-01','keep'),
   ($7,$2,$3,'lookalike','INBOX','otherdigest@example.invalid','Different sender','2024-01-01','keep')`,[randomUUID(),user,account,randomUUID(),randomUUID(),account2,randomUUID()]);
 });
 const all=await createBulkCleanup(user,{scope:'newsletters'});check(all.count===124&&all.protected===1&&all.messages.length===100&&all.keep===62);
 check((await tenant(user,db=>db.query('SELECT id FROM action_items WHERE plan_id=$1',[all.id]))).rowCount===124);
 const withoutKeep=await createBulkCleanup(user,{scope:'newsletters',includeKeep:false});check(withoutKeep.keep===0&&withoutKeep.count===62);
 const sender=await createBulkCleanup(user,{scope:'sender',sender:'digest@example.invalid',before:'2025-01-01'});check(sender.count===125&&sender.accounts.length===2);
 const ownAccount=await createBulkCleanup(user,{scope:'sender',sender:'digest@example.invalid',accountId:account,before:'2025-01-01'});check(ownAccount.count===124);
 const old=await createBulkCleanup(user,{scope:'older',before:'2025-01-01'});check(old.count===127&&old.keep===65);
 await assert.rejects(()=>createBulkCleanup(other,{scope:'newsletters'}));checks++;
 await assert.rejects(()=>approvePlan(other,all.id,all.digest));checks++;
 await assert.rejects(()=>createBulkCleanup(user,{scope:'older'}));checks++;
 await assert.rejects(()=>createBulkCleanup(user,{scope:'sender',sender:''}));checks++;
 const personal=await tenant(user,async db=>(await db.query("SELECT id FROM messages WHERE remote_id='personal'")).rows[0].id);
 await assert.rejects(()=>createPlan(user,'trash',[personal]));checks++;
 const manual=await createPlan(user,'trash',[personal],true);await approvePlan(user,manual.id,manual.digest);
 await actionJob({id:randomUUID(),user_id:user,kind:'action',ref_id:manual.id},async()=>fake);check(calls===1);
 check((await tenant(user,async db=>(await db.query('SELECT state FROM messages WHERE id=$1',[personal])).rows[0].state))==='trashed');
 // All-newsletter scope is frozen: a new arrival cannot join after preview.
 const later=randomUUID();await tenant(user,db=>db.query("INSERT INTO messages(id,user_id,account_id,remote_id,folder,sender,subject,received_at,list_id) VALUES($1,$2,$3,'late','INBOX','digest@example.invalid','Late arrival','2024-01-01','digest')",[later,user,account]));
 check((await tenant(user,db=>db.query('SELECT id FROM action_items WHERE plan_id=$1 AND message_id=$2',[all.id,later]))).rowCount===0);
 // One edited message must be skipped even after an explicit bulk approval.
 const edited=all.messages[0].id;await tenant(user,db=>db.query('UPDATE messages SET version=version+1 WHERE id=$1',[edited]));
 await approvePlan(user,all.id,all.digest);
 await actionJob({id:randomUUID(),user_id:user,kind:'action',ref_id:all.id},async()=>fake);check(calls===124);
 const result=await tenant(user,async db=>(await db.query('SELECT status FROM plans WHERE id=$1',[all.id])).rows[0]);check(result.status==='partial');
 check((await tenant(user,async db=>(await db.query('SELECT state FROM messages WHERE id=$1',[edited])).rows[0].state))==='active');
 check((await tenant(user,async db=>(await db.query('SELECT state FROM messages WHERE id=$1',[later])).rows[0].state))==='active');
 const flagged=await tenant(user,async db=>(await db.query("SELECT id FROM messages WHERE remote_id='news-1'")).rows[0].id);
 await assert.rejects(()=>createPlan(user,'trash',[flagged],true));checks++;
 const stopped=await createBulkCleanup(user,{scope:'older',before:'2026-01-01'});await approvePlan(user,stopped.id,stopped.digest);
 const beforeCalls=calls;
 await actionJob({id:randomUUID(),user_id:user,kind:'action',ref_id:stopped.id},async()=>({...fake,trash:async remoteId=>{calls++;await tenant(user,db=>db.query("UPDATE plans SET status='cancelled' WHERE id=$1",[stopped.id]));return {remoteId,folder:'INBOX'};}}));
 check(calls===beforeCalls+1);
 check((await tenant(user,db=>db.query("SELECT id FROM action_items WHERE plan_id=$1 AND status='pending'",[stopped.id]))).rowCount===0);
 console.log(`${checks} Sammelaktionsprüfungen bestanden: >100 Nachrichten, Behalten-Override, exakte Absender, Postfächer, Datumsgrenze, Schutz, Versionen und eingefrorene Auswahl. Nur simulierte Mail-Aktionen.`);
}finally{for(const id of [user,other])await pool.query('DELETE FROM users WHERE id=$1',[id]);await pool.end();}
