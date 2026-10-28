import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {pool,tenant} from '../src/lib/db';
import {token,digest} from '../src/lib/crypto';
const user=randomUUID(),account=randomUUID(),session=token(),base=process.env.APP_URL||'http://localhost:3000';
let checks=0;
async function post(path:string,data:unknown){const response=await fetch(`${base}/api/${path}`,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:`smc_session=${session}`},body:JSON.stringify(data)});return {status:response.status,data:await response.json()};}
try {
 await pool.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',[user,`${user}@scan-api.invalid`,'test-only']);
 await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '5 minutes')",[digest(session),user]);
 await tenant(user,async db=>{await db.query('INSERT INTO settings(user_id) VALUES($1)',[user]);await db.query("INSERT INTO accounts(id,user_id,provider,email) VALUES($1,$2,'gmail','scan-api@example.invalid')",[account,user]);});
 const local=await post('scans/estimate',{accountId:account,mode:'metadata',days:90,max:12000});assert.equal(local.status,200);assert.equal(local.data.high,0);checks++;
 assert.equal((await post('scans',{accountId:account,mode:'ai_headers',days:90,max:12000})).status,422);checks++;
 assert.equal((await post('scans',{accountId:account,mode:'ai',days:90,max:100,confirmAi:true})).status,422);checks++;
 assert.equal((await post('scans',{accountId:account,mode:'ai',days:90,max:12000,confirmAi:true,confirmContent:true})).status,422);checks++;
 assert.equal((await post('scans',{accountId:account,mode:'ai_headers',days:90,max:12000,confirmAi:true})).status,409);checks++;
 const queued=await post('scans',{accountId:account,mode:'metadata',days:90,max:12000});assert.equal(queued.status,200);checks++;
 console.log(`${checks} HTTP-Prüfungen der Analysearten erfolgreich: kostenlose Schätzung, getrennte Einwilligungen, Inhaltsscan-Limit und große Metadaten-Scans.`);
}finally{await pool.query('DELETE FROM users WHERE id=$1',[user]);await pool.end();}
