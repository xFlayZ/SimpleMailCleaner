import {z} from 'zod';
import {tenant} from './db';
export async function aggregateOverview(userId:string) {
 return tenant(userId,async db=>{
  const summary=(await db.query(`SELECT count(*)::int AS tracked,count(*) FILTER(WHERE state='active')::int AS active,count(*) FILTER(WHERE state='trashed')::int AS trashed,count(*) FILTER(WHERE state='active' AND recommendation='trash')::int AS suggestions,count(*) FILTER(WHERE state='active' AND (list_id IS NOT NULL OR newsletter_signal OR category='newsletter'))::int AS newsletters,count(DISTINCT sender) FILTER(WHERE state='active')::int AS senders,count(*) FILTER(WHERE state='active' AND analyzed_at IS NULL)::int AS unclassified,coalesce(sum(size) FILTER(WHERE state='active' AND recommendation='trash'),0)::float AS suggestedBytes FROM messages`)).rows[0];
  const senders=(await db.query("SELECT sender,count(*)::int AS count,count(*) FILTER(WHERE NOT is_read)::int AS unread FROM messages WHERE state='active' GROUP BY sender ORDER BY count(*) DESC,sender LIMIT 6")).rows;
  const reviews=(await db.query(`SELECT r.id,r.status,r.config,r.model,r.total,r.processed,r.changed,r.skipped,r.stats,r.estimated_low,r.estimated_high,(SELECT coalesce(sum(coalesce(u.cost,u.reserved)),0)::float FROM usage_events u WHERE u.review_run_id=r.id) AS cost,(SELECT count(*)::int FROM usage_events u WHERE u.review_run_id=r.id AND u.cost IS NULL) AS estimated,r.error,r.snapshot_at,r.completed_at,(SELECT jsonb_build_object('remote_id',b.remote_id,'status',b.status,'cleanup_status',b.cleanup_status,'error',b.error) FROM ai_batches b WHERE b.run_id=r.id ORDER BY b.created_at DESC LIMIT 1) AS batch FROM review_runs r WHERE r.status<>'preview' ORDER BY r.snapshot_at DESC LIMIT 30`)).rows;
  return {summary,topSenders:senders,reviews};
 });
}
export const groupFilterSchema=z.object({kind:z.enum(['senders','newsletters']).default('senders'),accountId:z.union([z.uuid(),z.literal('all')]).default('all'),q:z.string().max(300).default(''),page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().refine(v=>[25,50,100].includes(v)).default(25)});
export async function groupedMessages(userId:string,input:unknown) {
 const filters=groupFilterSchema.parse(input),values:unknown[]=[];const conditions=["m.state='active'"];
 const param=(v:unknown)=>{values.push(v);return `$${values.length}`;};
 if(filters.accountId!=='all')conditions.push(`m.account_id=${param(filters.accountId)}::uuid`);
 if(filters.q)conditions.push(`position(lower(${param(filters.q)}) in lower(m.sender))>0`);
 if(filters.kind==='newsletters')conditions.push("(m.list_id IS NOT NULL OR m.newsletter_signal OR m.category='newsletter')");
 const columns=filters.kind==='newsletters'?'m.account_id,m.sender,m.list_id':'m.account_id,m.sender';
 const select=filters.kind==='newsletters'?'m.list_id':'NULL::text AS list_id';
 return tenant(userId,async db=>{
  const grouped=`SELECT m.account_id,m.sender,${select},count(*)::int AS count,count(*) FILTER(WHERE NOT m.is_read)::int AS unread,count(*) FILTER(WHERE m.recommendation='trash')::int AS suggestions,min(m.id::text) FILTER(WHERE m.unsubscribe_verified AND m.unsubscribe_status<>'accepted') AS unsubscribe_id,bool_or(m.unsubscribe_status='accepted') AS unsubscribe_accepted FROM messages m WHERE ${conditions.join(' AND ')} GROUP BY ${columns}`;
  const total=(await db.query(`SELECT count(*)::int AS n FROM (${grouped}) groups`,values)).rows[0].n;
  const pages=Math.max(1,Math.ceil(total/filters.pageSize)),page=Math.min(pages,filters.page);
  const items=(await db.query(`${grouped} ORDER BY count(*) DESC,m.sender,m.account_id${filters.kind==='newsletters'?',m.list_id NULLS LAST':''} LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,filters.pageSize,(page-1)*filters.pageSize])).rows;
  return {items,total,pages,page,pageSize:filters.pageSize};
 });
}
