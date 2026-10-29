import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,tenant} from '../src/lib/db';
import {scanJob} from '../src/lib/scan-job';
import {startScan} from '../src/lib/service';
import type {MailMessage,MailAdapter} from '../src/lib/mail/types';
const user=randomUUID(),account=randomUUID();let checks=0,bodyCalls=0,headerCalls=0,contentAiCalls=0,enqueueCalls=0;
const now=new Date().toISOString();
const messages:MailMessage[]=Array.from({length:25},(_,i)=>({remoteId:`header-test-${i}`,folder:'INBOX',sender:'newsletter@example.invalid',subject:`Weekly offer ${i}`,receivedAt:now,size:20000,isRead:false,flagged:false,hasAttachments:false,listId:'newsletter.example.invalid'}));
const model={id:'test-model',name:'test-model',context_length:100000,pricing:{prompt:'0.000001',completion:'0.000005'},architecture:{input_modalities:['text'],output_modalities:['text']},supported_parameters:['response_format']};
const mail:MailAdapter={list:async()=>messages,content:async()=>{bodyCalls++;return {text:'Example content',raw:Buffer.from('Subject: news\r\n\r\nExample content')};},guard:async()=>({flagged:false,has_attachments:false,subject:'news'}),trash:async()=>{throw new Error('Must never mutate');},restore:async()=>{throw new Error('Must never mutate');},close:async()=>{}};
const deps={enqueue:async(_u:string,_a:string,ids:string[])=>{enqueueCalls++;assert.equal(ids.length,25);},makeAdapter:async()=>mail,getModels:async()=>[model],headers:async(_u:string,_s:string,items:{id:string}[])=>{headerCalls++;return items.map(m=>({id:m.id,category:'newsletter' as const,action:'trash' as const,reason:'Werbung anhand Betreff',riskFlags:[]}));},content:async()=>{contentAiCalls++;return {category:'newsletter' as const,action:'trash' as const,reason:'Werbung im Text',riskFlags:[]};}};
async function run(mode:string,consent=false) {
 const id=randomUUID();
 await tenant(user,db=>db.query("INSERT INTO scans(id,user_id,account_id,mode,days,max_messages,model,key_version,content_consent) VALUES($1,$2,$3,$4,90,100,'test-model',1,$5)",[id,user,account,mode,consent]));
 await scanJob({id:randomUUID(),user_id:user,kind:'scan',ref_id:id},deps);
 return tenant(user,async db=>(await db.query('SELECT * FROM scans WHERE id=$1',[id])).rows[0]);
}
try {
 await pool.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',[user,`${user}@scan-test.invalid`,'test-only']);
 await tenant(user,async db=>{
  await db.query("INSERT INTO settings(user_id,model,key_version) VALUES($1,'test-model',1)",[user]);
  await db.query("INSERT INTO accounts(id,user_id,provider,email) VALUES($1,$2,'gmail','scan@example.invalid')",[account,user]);
 });
 await run('metadata');assert.equal(bodyCalls,0);assert.equal(headerCalls,0);checks++;
 const first=await run('ai_headers');assert.equal(first.status,'completed');assert.equal(first.processed,25);assert.equal(headerCalls,0);assert.equal(bodyCalls,0);checks++;
 const cached=await run('ai_headers');assert.equal(enqueueCalls,2);assert.equal(headerCalls,0);assert.equal(bodyCalls,0);checks++;
 messages[0].subject='Updated weekly offer';const changed=await run('ai_headers');assert.equal(enqueueCalls,3);assert.equal(headerCalls,0);assert.equal(bodyCalls,0);checks++;
 await assert.rejects(()=>run('ai',false));assert.equal(bodyCalls,0);checks++;
 // Remove the intentionally rejected scan from the partial unique index before the next run.
 await tenant(user,db=>db.query("UPDATE scans SET status='cancelled' WHERE status='queued'"));
 await run('ai',true);assert.equal(bodyCalls,25);assert.equal(contentAiCalls,25);checks++;
 const both=await tenant(user,db=>db.query('SELECT header_analysis,content_analysis FROM messages LIMIT 1'));assert.equal(both.rows[0].header_analysis,null);assert.ok(both.rows[0].content_analysis);checks++;
 const cachedAfterContent=await run('ai_headers');assert.equal(enqueueCalls,4);assert.equal(headerCalls,0);assert.equal(bodyCalls,25);checks++;
 await assert.rejects(()=>startScan(user,account,'ai',90,100,{ai:true,content:false}));checks++;
 await assert.rejects(()=>startScan(user,account,'ai_headers',90,100));checks++;
 console.log(`${checks} Scan-Integrationsprüfungen erfolgreich: keine Body-Abfragen bei lokaler/Schnellanalyse, gruppierte Folgeaufträge, Inhalts-Cache, Änderungen, separate Inhaltseinwilligung und unabhängige Ergebnisse.`);
}finally{await pool.query('DELETE FROM users WHERE id=$1',[user]);await pool.end();}
