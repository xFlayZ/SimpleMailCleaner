import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,tenant} from '../src/lib/db';
import {previewMessageEdit,applyMessageEdit} from '../src/lib/message-edits';
import {messagePage} from '../src/lib/message-query';
import {activityPage,activityItems} from '../src/lib/activity';
import {createPlan,approvePlan} from '../src/lib/service';
import {actionJob} from '../src/lib/jobs';
import type {MailAdapter} from '../src/lib/mail/types';
const user=randomUUID(),other=randomUUID(),account=randomUUID(),id=randomUUID(),second=randomUUID();let checks=0,trash=0;
const check=(v:unknown)=>{assert.ok(v);checks++;};
try{
 for(const u of [user,other]){await pool.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture')",[u,`${u}@controls.invalid`]);await tenant(u,db=>db.query('INSERT INTO settings(user_id) VALUES($1)',[u]));}
 await tenant(user,async db=>{
  await db.query("INSERT INTO accounts(id,user_id,provider,email) VALUES($1,$2,'gmail','fixture@controls.invalid')",[account,user]);
  for(const m of [id,second])await db.query("INSERT INTO messages(id,user_id,account_id,remote_id,folder,sender,subject,received_at,is_read,protected,flagged,has_attachments,category,recommendation) VALUES($1::uuid,$2,$3,$1::text,'INBOX','shop@example.invalid','10% Rabatt auf Bestellung','2024-01-01',true,true,true,true,'important','keep')",[m,user,account]);
  await db.query("INSERT INTO rules(user_id,sender) VALUES($1,'shop@example.invalid')",[user]);
 });
 const snapshot=await previewMessageEdit(user,{sender:'shop@example.invalid',accountId:account});check(snapshot.count===2&&snapshot.protected===2);
 await assert.rejects(()=>applyMessageEdit(user,{targets:snapshot.targets,protection:'unprotect'}));checks++;
 await assert.rejects(()=>applyMessageEdit(other,{targets:snapshot.targets,category:'promotion'}));checks++;
 check((await messagePage(user,{protection:'protected'})).total===2);
 const change=await applyMessageEdit(user,{targets:snapshot.targets,protection:'unprotect',confirmRisk:true,category:'promotion',recommendation:'trash'});check(change.updated===2);
 const page=await messagePage(user,{protection:'unprotected'});check(page.total===2&&page.items.every(m=>m.protection_override&&!m.effective_protected&&m.category==='promotion'));
 const single=await previewMessageEdit(user,{ids:[second]});await applyMessageEdit(user,{targets:single.targets,protection:'protect'});
 check((await messagePage(user,{protection:'protected'})).total===1);
 const stale=await applyMessageEdit(user,{targets:snapshot.targets,category:'newsletter'});check(stale.updated===0&&stale.skipped===2);
 await assert.rejects(()=>createPlan(user,'trash',[second],true));checks++;
 const proposed=await createPlan(user,'trash',[id],true);
 check((await activityPage(user,{})).total===0); // no duplicate notes or unconfirmed previews
 await approvePlan(user,proposed.id,proposed.digest);
 const fake:MailAdapter={list:async()=>[],content:async()=>{throw new Error('No body');},guard:async()=>({subject:'Rechnung',flagged:true,has_attachments:true}),trash:async remoteId=>{trash++;return {remoteId,folder:'INBOX'};},restore:async()=>'',close:async()=>{}};
 await actionJob({id:randomUUID(),user_id:user,kind:'action',ref_id:proposed.id},async()=>fake);check(trash===1);
 const history=await activityPage(user,{});check(history.total===1&&history.items[0].source==='plan'&&history.items[0].state==='completed');
 const items=await activityItems(user,proposed.id,1,'succeeded');check(items.total===1&&items.items[0].sender==='shop@example.invalid');
 check((await activityItems(other,proposed.id,1,'all')).total===0);check((await activityPage(other,{notes:true})).total===0);
 check((await activityPage(user,{notes:true})).total>1);
 check((await activityPage(user,{kind:'trash',status:'completed'})).total===1);
 // More entries than a single page, stable chronology across all operation types.
 await tenant(user,async db=>{
  await db.query("INSERT INTO scans(id,user_id,account_id,mode,days,max_messages,status,created_at) VALUES($1,$2,$3,'metadata',30,10,'failed','2024-01-01')",[randomUUID(),user,account]);
  await db.query(`INSERT INTO review_runs(id,user_id,config,filters,total,status,snapshot_at) SELECT md5($1::text||g)::uuid,$1::uuid,'{"method":"local"}'::jsonb,'{}',0,'completed','2025-01-01'::timestamptz+g*interval '1 day' FROM generate_series(1,30) g`,[user]);
 });
 const first=await activityPage(user,{sort:'oldest',pageSize:25}),next=await activityPage(user,{sort:'oldest',pageSize:25,page:2});check(first.total===32&&first.items[0].source==='scan'&&next.items.length===7);
 check(!first.items.some(a=>next.items.some(b=>a.id===b.id&&a.source===b.source)));
 check((await activityPage(user,{sort:'status'})).items[0].status==='failed');
 check((await activityPage(user,{kind:'review',q:'Lokale Regeln'})).total===30);
 console.log(`${checks} Kontrollprüfungen bestanden: bestätigtes Entschützen, Kategorieänderung, Live-Schutz-Ausnahme, Rücknahme, stale Versionen, Tenant-Isolation und sortierter paginierter Verlauf.`);
}finally{for(const u of [user,other])await pool.query('DELETE FROM users WHERE id=$1',[u]);await pool.end();}
