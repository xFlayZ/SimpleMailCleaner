import {correctionFeedback,suggestRules} from './training';
import type {PoolClient} from 'pg';
import {tenant} from './db';
import {reviewFilterSchema,type ReviewFilters,type MessagePage} from './review-types';
import {protectionReasons} from './policy';
import {AppError} from './errors';
export const effectiveProtectionSql=(alias='m')=>`(NOT ${alias}.protection_override AND (${alias}.protected OR ${alias}.flagged OR ${alias}.has_attachments OR EXISTS(SELECT 1 FROM rules r WHERE r.sender=lower(${alias}.sender)) OR ${alias}.subject ~* '(^|[^[:alnum:]_])(rechnung|invoice|vertrag|contract|zahlung|payment|bestellung|order|quittung|receipt|passwort|password|security|sicherheit|verification|verifizierung|mahnung|steuer|tax|kündigung|kuendigung)([^[:alnum:]_]|$)'))`;

export function buildMessageWhere(filters:ReviewFilters,alias='m') {
 const values:unknown[]=[],clauses:string[]=[];
 const param=(value:unknown)=>{values.push(value);return `$${values.length}`;};
 const f=(key:string)=>`${alias}.${key}`;
 if(filters.state!=='all')clauses.push(`${f('state')}=${param(filters.state)}`);
 if(filters.accountId!=='all')clauses.push(`${f('account_id')}=${param(filters.accountId)}::uuid`);
 if(filters.q)clauses.push(`position(lower(${param(filters.q)}) in lower(${f('sender')}||' '||${f('subject')}))>0`);
 if(filters.sender)clauses.push(`position(lower(${param(filters.sender)}) in lower(${f('sender')}))>0`);
 if(filters.category!=='all')clauses.push(`${f('category')}=${param(filters.category)}`);
 if(filters.recommendation!=='all')clauses.push(`${f('recommendation')}=${param(filters.recommendation)}`);
 if(filters.read!=='all')clauses.push(`${f('is_read')}=${param(filters.read==='read')}`);
 if(filters.attachments!=='all')clauses.push(`${f('has_attachments')}=${param(filters.attachments==='with')}`);
 const protectedSql=effectiveProtectionSql(alias);
 if(filters.protection!=='all')clauses.push(`${filters.protection==='unprotected'?'NOT ':''}${protectedSql}`);
 if(filters.source==='unclassified')clauses.push(`${f('analyzed_at')} IS NULL`);
 else if(filters.source!=='all')clauses.push(`coalesce(${f('decision_source')},${f('analysis_mode')},'')=${param(filters.source)}`);
 if(filters.dateFrom)clauses.push(`${f('received_at')}>=${param(filters.dateFrom)}::date`);
 if(filters.dateTo)clauses.push(`${f('received_at')}<${param(filters.dateTo)}::date+interval '1 day'`);
 if(filters.newsletter)clauses.push(`(${f('list_id')} IS NOT NULL OR ${f('newsletter_signal')} OR ${f('category')}='newsletter')`);
 return {sql:clauses.join(' AND '),values};
}
export const messageOrder=(sort:ReviewFilters['sort'])=>({newest:'m.received_at DESC,m.id',oldest:'m.received_at ASC,m.id',sender:'m.sender ASC,m.received_at DESC,m.id',size:'m.size DESC,m.id'})[sort];
export async function messagePage(userId:string,input:unknown):Promise<MessagePage> {
 const filters=reviewFilterSchema.parse(input),where=buildMessageWhere(filters);
 return tenant(userId,async db=>{
  const summary=(await db.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE recommendation='trash')::int AS trash,count(*) FILTER(WHERE recommendation='keep')::int AS keep,count(*) FILTER(WHERE recommendation='review')::int AS review,count(*) FILTER(WHERE list_id IS NOT NULL OR newsletter_signal OR category='newsletter')::int AS newsletters,count(DISTINCT sender)::int AS senders FROM messages m WHERE ${where.sql}`,where.values)).rows[0];
  const pages=Math.max(1,Math.ceil(summary.total/filters.pageSize)),page=Math.min(pages,filters.page);
  const items=(await db.query(`SELECT m.id,m.account_id,m.sender,m.subject,m.received_at,m.size,m.is_read,m.flagged,m.has_attachments,m.protected,m.protection_override,${effectiveProtectionSql()} AS effective_protected,m.list_id,m.newsletter_signal,m.category,m.recommendation,m.reason,m.version,m.state,m.analyzed_at,m.analysis_mode,m.decision_source,m.decision_confidence,m.unsubscribe_verified,m.unsubscribe_status FROM messages m WHERE ${where.sql} ORDER BY ${messageOrder(filters.sort)} LIMIT $${where.values.length+1} OFFSET $${where.values.length+2}`,[...where.values,filters.pageSize,(page-1)*filters.pageSize])).rows;
  return {items,total:summary.total,page,pageSize:filters.pageSize,pages,summary};
 });
}
export async function matchingMessages(db:PoolClient,filters:ReviewFilters,limit:number,ids?:string[]) {
 const where=buildMessageWhere(filters);
 if(ids){where.values.push(ids);where.sql+=` AND m.id=ANY($${where.values.length}::uuid[])`;}
 return (await db.query(`SELECT m.* FROM messages m WHERE ${where.sql} ORDER BY ${messageOrder(filters.sort)} LIMIT $${where.values.length+1}`,[...where.values,limit])).rows;
}
export async function manualDecision(userId:string,ids:string[],action:'keep'|'review'|'trash') {
 return tenant(userId,async db=>{
  const rows=(await db.query('SELECT * FROM messages WHERE id=ANY($1::uuid[]) FOR UPDATE',[ids])).rows;
  if(rows.length!==new Set(ids).size)throw new AppError(404,'Auswahl enthält nicht verfügbare Nachrichten.');
  const rules=new Set<string>((await db.query('SELECT sender FROM rules')).rows.map(r=>r.sender));
  if(action==='trash'&&rows.some(m=>m.state!=='active'||protectionReasons(m,rules).length))throw new AppError(409,'Geschützte Nachrichten können nicht als Aufräumvorschlag gesetzt werden.');
  for(const m of rows)if(m.recommendation!==action)await correctionFeedback(db,userId,m,action);
  for(const account of new Set<string>(rows.map(m=>m.account_id)))await suggestRules(db,userId,account);
  await db.query("UPDATE messages SET recommendation=$2,reason='Vom Nutzer manuell bewertet.',analyzed_at=now(),analysis_mode='manual',decision_source='manual',decision_confidence='high',version=version+1 WHERE id=ANY($1::uuid[])",[ids,action]);
  return {updated:rows.length};
 });
}
export function csvCell(value:unknown) {
 let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text=`'${text}`;
 return `"${text.replaceAll('"','""')}"`;
}
