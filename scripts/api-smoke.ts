import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { pool } from '../src/lib/db';
const base=process.env.APP_URL||'http://localhost:3000';
const email=`api-test-${randomBytes(8).toString('hex')}@integration.invalid`,password=randomBytes(24).toString('hex');
let cookie='';let checks=0;
async function call(path:string,data?:unknown,origin=base){
 const result=await fetch(`${base}/api/${path}`,{method:data===undefined?'GET':'POST',headers:{...(data===undefined?{}:{'Content-Type':'application/json',Origin:origin}),...(cookie?{Cookie:cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)});
 return {status:result.status,data:await result.json(),cookie:result.headers.get('set-cookie')};
}
try {
 const page=await fetch(base);assert.equal(page.status,200);assert.ok((await page.text()).includes('Dein Postfach. Wieder übersichtlich.'));checks++;
 const guide=await fetch(`${base}/guide`);assert.equal(guide.status,200);assert.ok((await guide.text()).includes('/api/oauth/gmail/callback'));checks++;
 assert.equal((await call('dashboard')).status,401);checks++;
 assert.equal((await call('auth/register',{email,password},'https://evil.invalid')).status,403);checks++;
 const count=(await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n;
 // The first-user bootstrap is deliberately tested only on a fresh test database.
 if(count!==0)throw new Error('API-Smoke-Test benötigt eine Testdatenbank ohne Nutzer.');
 const registration=await call('auth/register',{email,password});assert.equal(registration.status,200);assert.ok(registration.cookie?.includes('HttpOnly'));cookie=registration.cookie!.split(';')[0];checks++;
 const dashboard=await call('dashboard');assert.equal(dashboard.status,200);assert.equal(dashboard.data.accounts.length,0);assert.equal(dashboard.data.settings.has_key,false);checks++;
 assert.equal((await call('plans',{kind:'trash',ids:[]})).status,422);checks++;
 assert.equal((await call('oauth/gmail/start',{})).status,409);checks++;
 await call('auth/logout',{});assert.equal((await call('dashboard')).status,401);checks++;
 assert.equal((await call('auth/login',{email,password:'incorrect-password'})).status,401);checks++;
 const login=await call('auth/login',{email,password});assert.equal(login.status,200);checks++;
 console.log(`${checks} API-Smoke-Prüfungen erfolgreich: Dashboard/Anleitung, CSRF, Registrierung, Sitzung, Validierung, OAuth-Konfiguration und Abmeldung.`);
}finally {
 await pool.query('DELETE FROM users WHERE email=$1',[email]);await pool.end();
}
