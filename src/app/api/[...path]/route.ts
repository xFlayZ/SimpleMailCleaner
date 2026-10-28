import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z,ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import { session,requireSession,authenticate,cookieName,originCheck } from '@/lib/auth';
import { pool,tenant,event } from '@/lib/db';
import { AppError,requireValue } from '@/lib/errors';
import { encrypt } from '@/lib/crypto';
import { readLimited,jsonRequest } from '@/lib/http';
import { dashboard,connectImap,startScan,createPlan,approvePlan,scanEstimate } from '@/lib/service';
import { startOAuth,finishOAuth } from '@/lib/mail/oauth';
import { adapter } from '@/lib/mail';
import { models,modelReason } from '@/lib/ai';
import { createDevice,pollConnector,completeConnector } from '@/lib/connector';
import type { Account } from '@/lib/mail/types';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=z.uuid(), email=z.email().max(320).transform(v=>v.toLowerCase());
const credentials=z.object({email,password:z.string().min(12).max(256)});
async function body(request:Request,limit=64000){return JSON.parse((await readLimited(new Response(request.body),limit)).toString('utf8'));}
async function handle(request:Request,{params}:{params:Promise<{path:string[]}>}) {
 const path=(await params).path,route=path.join('/'),method=request.method;
 try {
  if(route==='health')return NextResponse.json({ok:true});
  if(route==='connector/poll'&&method==='GET')return NextResponse.json(await pollConnector(request));
  if(path[0]==='connector'&&path[1]==='tasks'&&method==='POST')return NextResponse.json(await completeConnector(request,uuid.parse(path[2]),await body(request,24_000_000)));
  if(method!=='GET')originCheck(request);
  if(route==='session'&&method==='GET'){const user=await session();return NextResponse.json({user:user?{id:user.id,email:user.email}:null});}
  if((route==='auth/login'||route==='auth/register')&&method==='POST') {
   const data=credentials.parse(await body(request));return NextResponse.json(await authenticate(data.email,data.password,route.endsWith('register')));
  }
  const user=await requireSession();
  if(route==='auth/logout'&&method==='POST') {
   await pool.query('DELETE FROM sessions WHERE token_hash=$1',[user.token_hash]);(await cookies()).delete(cookieName);return NextResponse.json({ok:true});
  }
  if(route==='dashboard'&&method==='GET')return NextResponse.json(await dashboard(user.id));
  if(route==='models'&&method==='GET')return NextResponse.json({models:(await models()).map(m=>({...m,unavailableReason:modelReason(m)})),fetchedAt:new Date().toISOString()});
  if(route==='settings'&&method==='POST') {
   const data=z.object({apiKey:z.string().max(512).optional(),removeKey:z.boolean().optional(),model:z.string().max(200),aiConsent:z.boolean(),scanBudget:z.number().min(0.01).max(100),monthlyBudget:z.number().min(0.01).max(1000)}).parse(await body(request));
   if(data.model)requireValue((await models()).find(m=>m.id===data.model),'Modell existiert nicht im aktuellen Katalog.');
   if(data.apiKey)await jsonRequest('https://openrouter.ai/api/v1/key',{headers:{Authorization:`Bearer ${data.apiKey}`}});
   await tenant(user.id,async db=>{
    await db.query(`INSERT INTO settings(user_id) VALUES($1) ON CONFLICT DO NOTHING`,[user.id]);
    await db.query(`UPDATE settings SET model=$2,ai_consent=$3,scan_budget=$4,monthly_budget=$5,
     api_key=CASE WHEN $6 THEN NULL WHEN $7::text IS NOT NULL THEN $7 ELSE api_key END,
     key_version=key_version+CASE WHEN $6 OR $7::text IS NOT NULL THEN 1 ELSE 0 END WHERE user_id=$1`,[user.id,data.model,data.aiConsent,data.scanBudget,data.monthlyBudget,Boolean(data.removeKey),data.apiKey?encrypt(data.apiKey,user.id):null]);
   });return NextResponse.json({ok:true});
  }
  if(route==='accounts/imap'&&method==='POST') {
   const data=z.object({provider:z.enum(['tonline','yahoo']),email,password:z.string().min(1).max(512)}).parse(await body(request));
   return NextResponse.json(await connectImap(user.id,data.provider,data.email,data.password));
  }
  if(route==='accounts/proton'&&method==='POST') {
   const data=z.object({email}).parse(await body(request));return NextResponse.json(await createDevice(user.id,data.email));
  }
  if(path[0]==='accounts'&&path[2]==='disconnect'&&method==='POST') {
   const id=uuid.parse(path[1]),lock=await pool.connect();
   try {
    if(!(await lock.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[id])).rows[0].locked)throw new AppError(409,'Postfach wird gerade bearbeitet. Zuerst Scan/Aktion beenden.');
    try {
     await tenant(user.id,async db=>{
      const account=requireValue((await db.query('SELECT id FROM accounts WHERE id=$1 FOR UPDATE',[id])).rows[0]);
      await db.query('DELETE FROM jobs WHERE ref_id IN (SELECT id FROM scans WHERE account_id=$1)',[account.id]);
      await db.query('DELETE FROM accounts WHERE id=$1',[account.id]);
     });
    }finally{await lock.query('SELECT pg_advisory_unlock(hashtext($1))',[id]);}
   }finally{lock.release();}
   return NextResponse.json({ok:true});
  }
  if(path[0]==='oauth'&&path[2]==='start'&&method==='POST')return NextResponse.json({url:await startOAuth(user.id,user.token_hash,z.enum(['gmail','outlook']).parse(path[1]))});
  if(path[0]==='oauth'&&path[2]==='callback'&&method==='GET') {
   const query=new URL(request.url).searchParams;
   if(query.has('error'))return NextResponse.redirect(new URL('/?connection=cancelled',process.env.APP_URL));
   await finishOAuth(user.id,user.token_hash,z.enum(['gmail','outlook']).parse(path[1]),z.string().min(16).parse(query.get('state')),z.string().min(1).parse(query.get('code')));
   return NextResponse.redirect(new URL('/?connection=success',process.env.APP_URL));
  }
  if((route==='scans'||route==='scans/estimate')&&method==='POST') {
   const data=z.object({accountId:uuid,mode:z.enum(['metadata','ai_headers','ai']),days:z.number().int().min(1).max(3650),max:z.number().int().min(1).max(20000),confirmAi:z.boolean().default(false),confirmContent:z.boolean().default(false)}).refine(d=>d.mode!=='ai'||d.max<=500,{message:'Inhaltsscan auf 500 Nachrichten begrenzt.'}).parse(await body(request));
   if(route==='scans/estimate')return NextResponse.json(await scanEstimate(user.id,data.accountId,data.mode,data.days,data.max));
   return NextResponse.json(await startScan(user.id,data.accountId,data.mode,data.days,data.max,{ai:data.confirmAi,content:data.confirmContent}));
  }
  if(path[0]==='scans'&&path[2]==='cancel'&&method==='POST') {
   await tenant(user.id,db=>db.query("UPDATE scans SET status='cancelled' WHERE id=$1 AND status IN ('queued','running','waiting_connector')",[uuid.parse(path[1])]));return NextResponse.json({ok:true});
  }
  if(route==='plans'&&method==='POST') {
   const data=z.object({kind:z.enum(['trash','restore','unsubscribe']),ids:z.array(uuid).min(1).max(100)}).parse(await body(request));
   return NextResponse.json(await createPlan(user.id,data.kind,data.ids));
  }
  if(path[0]==='plans'&&path[2]==='approve'&&method==='POST')return NextResponse.json(await approvePlan(user.id,uuid.parse(path[1]),z.object({digest:z.string().length(64)}).parse(await body(request)).digest));
  if(path[0]==='plans'&&path[2]==='cancel'&&method==='POST') {
   await tenant(user.id,db=>db.query("UPDATE plans SET status='cancelled' WHERE id=$1 AND status IN ('proposed','approved','executing')",[uuid.parse(path[1])]));return NextResponse.json({ok:true});
  }
  if(path[0]==='plans'&&path.length===2&&method==='GET') {
   const data=await tenant(user.id,async db=>(await db.query('SELECT a.id,a.status,a.error,a.completed_at,m.subject,m.sender FROM action_items a JOIN messages m ON m.id=a.message_id AND m.user_id=a.user_id WHERE a.plan_id=$1',[uuid.parse(path[1])])).rows);return NextResponse.json({items:data});
  }
  if(path[0]==='messages'&&path[2]==='preview'&&method==='GET') {
   const target=await tenant(user.id,async db=>requireValue((await db.query('SELECT m.remote_id,m.state,a.* FROM messages m JOIN accounts a ON a.id=m.account_id AND a.user_id=m.user_id WHERE m.id=$1',[uuid.parse(path[1])])).rows[0]));
   if(target.state!=='active')throw new AppError(409,'Vorschau nur für aktive Nachrichten verfügbar.');
   const mail=await adapter(target as Account);
   try{return NextResponse.json({text:(await mail.content(target.remote_id)).text});}finally{await mail.close();}
  }
  if(route==='rules'&&method==='POST') {
   const data=z.object({sender:z.string().min(1).max(320),protect:z.boolean()}).parse(await body(request));
   await tenant(user.id,async db=>{
    if(data.protect)await db.query('INSERT INTO rules(user_id,sender) VALUES($1,$2) ON CONFLICT DO NOTHING',[user.id,data.sender.toLowerCase()]);
    else await db.query('DELETE FROM rules WHERE sender=$1',[data.sender.toLowerCase()]);
    await db.query("UPDATE messages SET version=version+1 WHERE sender=$1",[data.sender.toLowerCase()]);
   });await event(user.id,'rule',data.protect?'Absenderschutz hinzugefügt.':'Absenderschutz entfernt.');return NextResponse.json({ok:true});
  }
  throw new AppError(404,'Endpunkt nicht gefunden.');
 }catch(error) {
  const status=error instanceof AppError?error.status:error instanceof ZodError||error instanceof SyntaxError?422:(error as {code?:string}).code==='23505'?409:500;
  const message=error instanceof AppError?error.message:status===422?'Eingaben sind ungültig.':status===409?'Ein entsprechender Vorgang oder ein Konto existiert bereits.':'Dienst nicht verfügbar. Datenbank und Serverkonfiguration prüfen.';
  return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
 }
}
export async function GET(request:Request,context:{params:Promise<{path:string[]}>}){const response=await handle(request,context);response.headers.set('Cache-Control','no-store');return response;}
export const POST=GET;
