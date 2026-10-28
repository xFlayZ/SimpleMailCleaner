import { randomUUID, createHash } from 'node:crypto';
import { pool, tenant } from '../db';
import { token, digest, encrypt, decrypt } from '../crypto';
import { AppError, requireValue } from '../errors';
import { jsonRequest } from '../http';
import type { Account, OAuthToken } from './types';
type OAuthProvider='gmail'|'outlook';
export function oauthConfig(provider:OAuthProvider) {
 const google=provider==='gmail';
 const id=process.env[google?'GOOGLE_CLIENT_ID':'MICROSOFT_CLIENT_ID'];
 const secret=process.env[google?'GOOGLE_CLIENT_SECRET':'MICROSOFT_CLIENT_SECRET'];
 if(!id||!secret)throw new AppError(409,`${google?'Google':'Microsoft'} OAuth ist noch nicht eingerichtet. Siehe Einrichtungsanleitung.`);
 const tenantName=encodeURIComponent(process.env.MICROSOFT_TENANT||'common');
 return {id,secret,
  auth:google?'https://accounts.google.com/o/oauth2/v2/auth':`https://login.microsoftonline.com/${tenantName}/oauth2/v2.0/authorize`,
  tokenUrl:google?'https://oauth2.googleapis.com/token':`https://login.microsoftonline.com/${tenantName}/oauth2/v2.0/token`,
  scope:google?'https://www.googleapis.com/auth/gmail.modify':'offline_access https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/User.Read',
  redirect:`${process.env.APP_URL||'http://localhost:3000'}/api/oauth/${provider}/callback`};
}
export async function startOAuth(userId:string,sessionHash:string,provider:OAuthProvider) {
 const config=oauthConfig(provider), state=token(),verifier=token();
 await pool.query('INSERT INTO oauth_states(state_hash,user_id,session_hash,provider,verifier,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval \'10 minutes\')',[digest(state),userId,sessionHash,provider,encrypt(verifier,userId)]);
 const url=new URL(config.auth);
 const params:Record<string,string>={client_id:config.id,redirect_uri:config.redirect,response_type:'code',scope:config.scope,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'};
 if(provider==='gmail'){params.access_type='offline';params.prompt='consent';}else params.prompt='select_account';
 url.search=new URLSearchParams(params).toString(); return url.toString();
}
export async function finishOAuth(userId:string,sessionHash:string,provider:OAuthProvider,state:string,code:string) {
 const config=oauthConfig(provider);
 const result=await pool.query('DELETE FROM oauth_states WHERE state_hash=$1 AND user_id=$2 AND session_hash=$3 AND provider=$4 AND expires_at>now() RETURNING verifier',[digest(state),userId,sessionHash,provider]);
 const verifier=decrypt<string>(requireValue(result.rows[0],'OAuth-Anfrage abgelaufen oder ungültig.').verifier,userId);
 const response=await jsonRequest(config.tokenUrl,{method:'POST',body:new URLSearchParams({client_id:config.id,client_secret:config.secret,redirect_uri:config.redirect,grant_type:'authorization_code',code,code_verifier:verifier})});
 if(!response.access_token || !response.refresh_token)throw new AppError(409,'Offline-Zugriff fehlt. Berechtigungen widerrufen und Konto erneut verbinden.');
 if(provider==='gmail' && !(response.scope||'').split(' ').includes('https://www.googleapis.com/auth/gmail.modify'))throw new AppError(409,'Gmail-Lese-/Änderungsberechtigung fehlt.');
 if(provider==='outlook' && !String(response.scope||'').toLowerCase().includes('mail.readwrite'))throw new AppError(409,'Microsoft Mail.ReadWrite fehlt.');
 const profile=await jsonRequest(provider==='gmail'?'https://gmail.googleapis.com/gmail/v1/users/me/profile':'https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName',{headers:{Authorization:`Bearer ${response.access_token}`}});
 const email=String(provider==='gmail'?profile.emailAddress:profile.mail||profile.userPrincipalName).toLowerCase();
 if(!email.includes('@'))throw new AppError(409,'Postfachadresse konnte nicht bestimmt werden.');
 const tokens:OAuthToken={access_token:response.access_token,refresh_token:response.refresh_token,expires_at:Date.now()+Number(response.expires_in)*1000,scope:response.scope};
 await tenant(userId,db=>db.query(`INSERT INTO accounts(id,user_id,provider,email,secret) VALUES($1,$2,$3,$4,$5)
 ON CONFLICT(user_id,provider,email) DO UPDATE SET secret=excluded.secret,status='connected'`,[randomUUID(),userId,provider,email,encrypt(tokens,userId)]));
}
export async function accessToken(account:Account) {
 return tenant(account.user_id,async db=>{
  const row=requireValue((await db.query('SELECT secret FROM accounts WHERE id=$1 FOR UPDATE',[account.id])).rows[0]);
  const saved=decrypt<OAuthToken>(row.secret,account.user_id);
  if(saved.expires_at>Date.now()+60000)return saved.access_token;
  const config=oauthConfig(account.provider as OAuthProvider);
  const response=await jsonRequest(config.tokenUrl,{method:'POST',body:new URLSearchParams({client_id:config.id,client_secret:config.secret,grant_type:'refresh_token',refresh_token:saved.refresh_token})});
  if(!response.access_token)throw new AppError(409,'Zugang konnte nicht erneuert werden.');
  const updated={...saved,access_token:response.access_token,refresh_token:response.refresh_token||saved.refresh_token,expires_at:Date.now()+Number(response.expires_in)*1000};
  await db.query('UPDATE accounts SET secret=$2 WHERE id=$1',[account.id,encrypt(updated,account.user_id)]);
  return updated.access_token as string;
 });
}
