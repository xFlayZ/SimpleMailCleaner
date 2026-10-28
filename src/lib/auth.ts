import { cookies } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { pool, tenant } from './db';
import { digest, passwordHash, passwordMatches, token } from './crypto';
import { AppError } from './errors';
export const cookieName = 'smc_session';
export function originCheck(request: Request) {
 const expected = new URL(process.env.APP_URL || 'http://localhost:3000').origin;
 if (request.headers.get('origin') !== expected) throw new AppError(403,'Ungültiger Anfrageursprung.');
}
export async function session() {
 const value = (await cookies()).get(cookieName)?.value;
 if (!value) return null;
 const {rows} = await pool.query('SELECT u.id,u.email,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[digest(value)]);
 return rows[0] as {id:string;email:string;token_hash:string}|undefined;
}
export async function requireSession() {
 const user = await session();
 if (!user) throw new AppError(401,'Bitte anmelden.');
 return user;
}
export async function authenticate(email: string, password: string, register: boolean) {
 const bucket = digest(email.toLowerCase());
 const rate = await pool.query(`INSERT INTO auth_attempts(bucket,count,reset_at) VALUES($1,1,now()+interval '15 minutes')
 ON CONFLICT(bucket) DO UPDATE SET count=CASE WHEN auth_attempts.reset_at<now() THEN 1 ELSE auth_attempts.count+1 END,
 reset_at=CASE WHEN auth_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE auth_attempts.reset_at END RETURNING count`,[bucket]);
 if(rate.rows[0].count>10) throw new AppError(429,'Zu viele Versuche. In 15 Minuten erneut versuchen.');
 let user: {id:string;password_hash:string}|undefined;
 if (register) {
  const hash=await passwordHash(password), db=await pool.connect();
  try {
   await db.query('BEGIN'); await db.query("SELECT pg_advisory_xact_lock(hashtext('registration'))");
   const count=await db.query('SELECT count(*)::int AS count FROM users');
   if(count.rows[0].count>0 && process.env.REGISTRATION_OPEN!=='true') throw new AppError(403,'Registrierung geschlossen. Betreiber kann REGISTRATION_OPEN aktivieren.');
   user={id:randomUUID(),password_hash:hash};
   await db.query('INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)',[user.id,email.toLowerCase(),hash]);
   await db.query('COMMIT');
  } catch(error) { await db.query('ROLLBACK'); if((error as {code?:string}).code==='23505') throw new AppError(409,'Registrierung nicht möglich. Bestehendes Konto anmelden.'); throw error; }
  finally {db.release();}
  await tenant(user.id,db=>db.query('INSERT INTO settings(user_id) VALUES($1)',[user!.id]));
 } else {
  user=(await pool.query('SELECT id,password_hash FROM users WHERE email=$1',[email.toLowerCase()])).rows[0];
  // Equal-cost derivation for unknown users.
  const saved=user?.password_hash || `${'0'.repeat(32)}:${'0'.repeat(128)}`;
  if(!await passwordMatches(password,saved) || !user) throw new AppError(401,'E-Mail oder Passwort ungültig.');
 }
 const value=token();
 await pool.query('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval \'7 days\')',[digest(value),user.id]);
 (await cookies()).set(cookieName,value,{httpOnly:true,sameSite:'lax',secure:new URL(process.env.APP_URL||'http://localhost:3000').protocol==='https:',path:'/',maxAge:604800});
 return {ok:true};
}
