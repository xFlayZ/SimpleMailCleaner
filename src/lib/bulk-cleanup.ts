import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {tenant} from './db';
import {digest} from './crypto';
import {protectionReasons} from './policy';
import {AppError} from './errors';
export const bulkCleanupSchema=z.object({
 scope:z.enum(['newsletters','sender','older']),
 accountId:z.union([z.uuid(),z.literal('all')]).default('all'),
 sender:z.string().trim().max(320).default(''),
 before:z.iso.date().or(z.literal('')).default(''),
 includeKeep:z.boolean().default(true)
}).refine(v=>v.scope!=='sender'||v.sender.length>0,{message:'Absender erforderlich.'})
 .refine(v=>v.scope!=='older'||Boolean(v.before),{message:'Stichtag erforderlich.'});
export type BulkCleanupInput=z.infer<typeof bulkCleanupSchema>;
export type BulkCleanupPreview={id:string;digest:string;count:number;matched:number;protected:number;busy:number;keep:number;expiresAt:string;accounts:{email:string;count:number}[];messages:{id:string;subject:string;sender:string}[]};
export async function createBulkCleanup(userId:string,input:unknown):Promise<BulkCleanupPreview>{
 if(process.env.PAUSE_WRITES==='true')throw new AppError(503,'Schreibaktionen sind pausiert.');
 const selection=bulkCleanupSchema.parse(input);
 return tenant(userId,async db=>{
  const values:unknown[]=[],where=["m.state='active'"];const param=(v:unknown)=>{values.push(v);return `$${values.length}`;};
  if(selection.accountId!=='all')where.push(`m.account_id=${param(selection.accountId)}::uuid`);
  if(selection.scope==='newsletters')where.push("(m.list_id IS NOT NULL OR m.newsletter_signal OR m.category='newsletter')");
  if(selection.scope==='sender')where.push(`lower(m.sender)=lower(${param(selection.sender)})`);
  if(selection.before)where.push(`m.received_at<${param(selection.before)}::date`);
  if(!selection.includeKeep)where.push("m.recommendation<>'keep'");
  const rows=(await db.query(`SELECT m.*,a.email AS account_email FROM messages m JOIN accounts a ON a.id=m.account_id AND a.user_id=m.user_id WHERE ${where.join(' AND ')} ORDER BY m.id LIMIT 50001 FOR UPDATE OF m`,values)).rows;
  if(rows.length>50000)throw new AppError(422,'Mehr als 50.000 Treffer. Mit Postfach oder Datum eingrenzen. Es wird keine Teilauswahl stillschweigend freigegeben.');
  const rules=new Set<string>((await db.query('SELECT sender FROM rules')).rows.map(r=>r.sender));
  const blocked=new Set((await db.query("SELECT message_id FROM action_items WHERE message_id=ANY($1::uuid[]) AND (status IN ('executing','unknown') OR (status='pending' AND plan_id IN (SELECT id FROM plans WHERE status IN ('approved','executing'))))",[rows.map(m=>m.id)])).rows.map(r=>r.message_id));
  const protectedRows=rows.filter(m=>protectionReasons(m,rules).length),eligible=rows.filter(m=>!protectionReasons(m,rules).length&&!blocked.has(m.id));
  if(!eligible.length)throw new AppError(422,`Keine ausführbaren Treffer (${rows.length} gefunden, ${protectedRows.length} geschützt).`);
  const id=randomUUID(),hash=digest(JSON.stringify({kind:'trash',manual:true,selection,items:eligible.map(m=>({id:m.id,version:m.version}))}));
  await db.query("INSERT INTO plans(id,user_id,kind,digest,manual_selection,selection) VALUES($1,$2,'trash',$3,true,$4)",[id,userId,hash,selection]);
  await db.query(`INSERT INTO action_items(id,user_id,plan_id,message_id,message_version) SELECT t.item_id,$1::uuid,$2::uuid,t.id,t.version FROM jsonb_to_recordset($3::jsonb) t(item_id uuid,id uuid,version int)`,[userId,id,JSON.stringify(eligible.map(m=>({item_id:randomUUID(),id:m.id,version:m.version})))]);
  const accounts=new Map<string,{email:string;count:number}>();for(const m of eligible){const a=accounts.get(m.account_id)||{email:m.account_email,count:0};a.count++;accounts.set(m.account_id,a);}
  return {id,digest:hash,count:eligible.length,matched:rows.length,protected:protectedRows.length,busy:rows.filter(m=>blocked.has(m.id)&&!protectionReasons(m,rules).length).length,keep:eligible.filter(m=>m.recommendation==='keep').length,expiresAt:new Date(Date.now()+900000).toISOString(),accounts:[...accounts.values()],messages:eligible.slice(0,100).map(m=>({id:m.id,subject:m.subject,sender:m.sender}))};
 });
}
