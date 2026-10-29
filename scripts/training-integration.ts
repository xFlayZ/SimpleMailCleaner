import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,tenant} from '../src/lib/db';
import {startTraining,trainingState,trainFeedback,trainingPause,personalRuleAction} from '../src/lib/training';
import {manualDecision} from '../src/lib/message-query';
const user=randomUUID(),other=randomUUID(),account=randomUUID();let checks=0;
const check=(value:unknown)=>{assert.ok(value);checks++;};
try{
 for(const id of [user,other])await pool.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture')",[id,`${id}@training.invalid`]);
 await tenant(user,async db=>{await db.query("INSERT INTO accounts(id,user_id,provider,email) VALUES($1,$2,'gmail','training@example.invalid')",[account,user]);for(let i=0;i<5;i++)await db.query("INSERT INTO messages(id,user_id,account_id,remote_id,folder,sender,subject,received_at,category,recommendation,is_read) VALUES($1,$2,$3,$4,'INBOX','shop@example.com',$5,'2024-01-01','promotion','review',true)",[randomUUID(),user,account,String(i),`Rabatt Sommer ${i}`]);});
 await startTraining(user,{accountId:account,size:10});
 let state=await trainingState(user,account);check(state.session&&state.session.targets.length===5);
 await trainingPause(user,{id:state.session.id,paused:true});
 await assert.rejects(()=>trainFeedback(user,{sessionId:state.session.id,messageId:state.message.id,version:1,decision:'remove',reasons:[],explanation:'',scope:'similar',contributes:true}));checks++;
 await trainingPause(user,{id:state.session.id,paused:false});
 for(let i=0;i<3;i++){
  state=await trainingState(user,account);
  await trainFeedback(user,{sessionId:state.session.id,messageId:state.message.id,version:state.message.version,decision:'remove',reasons:['subject','type'],explanation:'Werbung entfernen, Rechnungen behalten.',scope:'similar',contributes:true});
  const now=await trainingState(user,account);if(i===0)check(now.rules.length===0);
 }
 state=await trainingState(user,account);check(state.stats.rated===3&&state.rules.length>0&&state.rules.every(r=>!r.enabled));
 const r=state.rules[0];const preview=await personalRuleAction(user,{id:r.id,revision:r.revision,operation:'test'});check('count' in preview&&preview.count===5);
 await personalRuleAction(user,{id:r.id,revision:r.revision,operation:'save',enabled:true,confirm:true});
 await assert.rejects(()=>personalRuleAction(other,{id:r.id,revision:r.revision,operation:'test'}));checks++;
 const foreign=await trainingState(other,account);check(foreign.session===null&&foreign.rules.length===0&&foreign.stats.rated===0);
 await tenant(user,async db=>{check((await db.query('SELECT count(*)::int n FROM plans')).rows[0].n===0);check((await db.query("SELECT count(*)::int n FROM messages WHERE state<>'active'")).rows[0].n===0);});
 await manualDecision(user,[state.message.id],'keep');check((await trainingState(user,account)).stats.corrections>=4);
 await tenant(user,async db=>check((await db.query("SELECT count(*)::int n FROM training_feedback WHERE kind='correction'")).rows[0].n>=4));
 console.log(`${checks} training integration assertions passed: persistence, pause/resume, suggestions, consent, dry-run, corrections, RLS and no provider actions.`);
}finally{for(const id of [user,other])await pool.query('DELETE FROM users WHERE id=$1',[id]);await pool.end();}
