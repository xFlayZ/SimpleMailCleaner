import {z} from 'zod';
import {tenant} from './db';
import {AppError} from './errors';
import {protectionReasons} from './policy';
const category=z.enum(['newsletter','promotion','notification','personal','important','security','unclear','unclassified']);
export const editScopeSchema=z.union([z.object({ids:z.array(z.uuid()).min(1).max(100)}),z.object({sender:z.string().trim().min(1).max(320),accountId:z.union([z.uuid(),z.literal('all')])})]);
export type MessageEditScope=z.infer<typeof editScopeSchema>;
export type EditSnapshot={targets:{id:string;version:number}[];count:number;protected:number;sample:{subject:string;sender:string}[]};
export async function previewMessageEdit(userId:string,input:unknown):Promise<EditSnapshot>{
 const scope=editScopeSchema.parse(input);
 return tenant(userId,async db=>{
  const result='ids' in scope?await db.query("SELECT * FROM messages WHERE state='active' AND id=ANY($1::uuid[]) ORDER BY id",[scope.ids]):await db.query("SELECT * FROM messages WHERE state='active' AND lower(sender)=lower($1) AND ($2::text='all' OR account_id::text=$2) ORDER BY id LIMIT 50001",[scope.sender,scope.accountId]);
  if(!result.rows.length)throw new AppError(422,'Keine aktiven Nachrichten in dieser Auswahl.');
  if('ids' in scope&&result.rows.length!==new Set(scope.ids).size)throw new AppError(404,'Nachrichten nicht verfügbar.');
  if(result.rows.length>50000)throw new AppError(422,'Mehr als 50.000 Nachrichten. Auswahl eingrenzen.');
  const rules=new Set<string>((await db.query('SELECT sender FROM rules')).rows.map(r=>r.sender));
  return {targets:result.rows.map(m=>({id:m.id,version:m.version})),count:result.rows.length,protected:result.rows.filter(m=>protectionReasons(m,rules).length).length,sample:result.rows.slice(0,10).map(m=>({subject:m.subject,sender:m.sender}))};
 });
}
export const messageEditSchema=z.object({targets:z.array(z.object({id:z.uuid(),version:z.number().int().min(1)})).min(1).max(50000),category:category.optional(),recommendation:z.enum(['keep','review','trash']).optional(),protection:z.enum(['unchanged','protect','unprotect']).default('unchanged'),confirmRisk:z.boolean().default(false)})
 .refine(v=>Boolean(v.category||v.recommendation||v.protection!=='unchanged'),{message:'Änderung auswählen.'});
export async function applyMessageEdit(userId:string,input:unknown){
 const edit=messageEditSchema.parse(input);
 if(edit.protection==='unprotect'&&!edit.confirmRisk)throw new AppError(422,'Schutz auf eigene Gefahr aufheben bitte ausdrücklich bestätigen.');
 if(new Set(edit.targets.map(t=>t.id)).size!==edit.targets.length)throw new AppError(422,'Doppelte Nachrichtenreferenz.');
 if(edit.protection==='protect'&&edit.recommendation==='trash')throw new AppError(422,'Schützen und zum Aufräumen vorschlagen widersprechen sich.');
 return tenant(userId,async db=>{
  const rows=(await db.query('SELECT * FROM messages WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[edit.targets.map(t=>t.id)])).rows;
  if(rows.length!==edit.targets.length)throw new AppError(404,'Auswahl enthält nicht verfügbare Nachrichten.');
  const versions=new Map(edit.targets.map(t=>[t.id,t.version]));const eligible=rows.filter(m=>m.state==='active'&&m.version===versions.get(m.id));
  const rules=new Set<string>((await db.query('SELECT sender FROM rules')).rows.map(r=>r.sender));
  if(edit.recommendation==='trash'&&edit.protection!=='unprotect'&&eligible.some(m=>protectionReasons(m,rules).length))throw new AppError(409,'Geschützte Nachrichten enthalten. Schutz separat ausdrücklich aufheben.');
  const result=await db.query(`UPDATE messages SET category=coalesce($2,category),recommendation=CASE WHEN $3='protect' THEN 'keep' ELSE coalesce($4,recommendation) END,
   protected=CASE WHEN $3='protect' THEN true WHEN $3='unprotect' THEN false ELSE protected END,
   protection_override=CASE WHEN $3='unprotect' THEN true WHEN $3='protect' THEN false ELSE protection_override END,
   reason=$5,decision_source='manual',analysis_mode='manual',decision_confidence='high',analyzed_at=now(),version=version+1 WHERE id=ANY($1::uuid[])`,[eligible.map(m=>m.id),edit.category||null,edit.protection,edit.recommendation||null,edit.protection==='unprotect'?'Schutz vom Nutzer auf eigene Gefahr aufgehoben.':'Kategorie / Bewertung / Schutz vom Nutzer bearbeitet.']);
  await db.query("INSERT INTO events(id,user_id,kind,summary) VALUES(gen_random_uuid(),$1,'message_edit',$2)",[userId,`${result.rowCount} Nachrichten manuell bearbeitet${edit.protection==='unprotect'?' · Schutz ausdrücklich aufgehoben':''}; ${rows.length-eligible.length} seit Vorschau verändert und übersprungen.`]);
  return {updated:result.rowCount,skipped:rows.length-eligible.length};
 });
}
