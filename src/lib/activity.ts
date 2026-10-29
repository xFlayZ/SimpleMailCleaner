import {z} from 'zod';
import {tenant} from './db';
export const activityFilterSchema=z.object({q:z.string().max(300).default(''),kind:z.enum(['all','scan','review','trash','restore','unsubscribe','event']).default('all'),status:z.enum(['all','active','completed','attention','cancelled']).default('all'),sort:z.enum(['newest','oldest','status']).default('newest'),notes:z.boolean().default(false),page:z.coerce.number().int().min(1).default(1),pageSize:z.coerce.number().int().refine(n=>[25,50,100].includes(n)).default(25)});
export type ActivityItem={id:string;source:'scan'|'review'|'plan'|'event';kind:string;status:string;state:string;at:string;total:number;processed:number;failed:number;description:string;error:string|null;details:{model?:string;mode?:string;method?:string;cost?:number;estimated?:number;changed?:number;skipped?:number;batch?:{status:string;cleanup_status:string;remote_id:string;error:string|null}|null}};
export type ActivityPage={items:ActivityItem[];total:number;page:number;pages:number;pageSize:number;summary:{active:number;attention:number;completed:number}};
const cte=`WITH raw AS (
 SELECT s.id,'scan'::text AS source,'scan'::text AS kind,s.status,s.created_at AS at,s.total,s.processed,0::int AS failed,coalesce(a.email,'Getrenntes Postfach') AS description,s.error,jsonb_build_object('mode',s.mode,'skipped',s.skipped) AS details FROM scans s LEFT JOIN accounts a ON a.id=s.account_id AND a.user_id=s.user_id
 UNION ALL SELECT r.id,'review','review',r.status,r.snapshot_at,r.total,r.processed,0,CASE WHEN r.config->>'method'='local' THEN 'Lokale Regeln' WHEN r.config->>'method'='batch' THEN 'Asynchroner Anbieter-Batch' ELSE 'Gruppierte KI' END,r.error,jsonb_build_object('method',r.config->>'method','model',r.model,'changed',r.changed,'skipped',r.skipped,'cost',(SELECT coalesce(sum(coalesce(u.cost,u.reserved)),0) FROM usage_events u WHERE u.review_run_id=r.id),'estimated',(SELECT count(*) FROM usage_events u WHERE u.review_run_id=r.id AND u.cost IS NULL),'batch',(SELECT jsonb_build_object('status',b.status,'cleanup_status',b.cleanup_status,'remote_id',b.remote_id,'error',b.error) FROM ai_batches b WHERE b.run_id=r.id ORDER BY b.created_at DESC LIMIT 1)) FROM review_runs r WHERE r.status<>'preview'
 UNION ALL SELECT p.id,'plan',p.kind,p.status,p.created_at,x.total,x.processed,x.failed,CASE WHEN p.selection->>'scope'='newsletters' THEN 'Alle Newsletter' WHEN p.selection->>'scope'='sender' THEN 'Absender: '||(p.selection->>'sender') WHEN p.selection->>'scope'='older' THEN 'Vor dem '||(p.selection->>'before') ELSE 'Manuelle Nachrichtenauswahl' END,NULL,jsonb_build_object('skipped',0) FROM plans p CROSS JOIN LATERAL (SELECT count(*)::int AS total,count(*) FILTER(WHERE i.status<>'pending' AND i.status<>'executing')::int AS processed,count(*) FILTER(WHERE i.status IN ('failed','unknown'))::int AS failed FROM action_items i WHERE i.plan_id=p.id) x WHERE p.approved_at IS NOT NULL
 UNION ALL SELECT e.id,'event','event','completed',e.created_at,0,0,0,e.summary,NULL,'{}'::jsonb FROM events e
), activity AS (SELECT *,CASE WHEN status IN ('queued','running','approved','executing','waiting_batch','waiting_connector','pending','proposed') THEN 'active' WHEN status IN ('completed','succeeded') THEN 'completed' WHEN status='cancelled' THEN 'cancelled' ELSE 'attention' END AS state FROM raw)
`;
export async function activityPage(userId:string,input:unknown):Promise<ActivityPage>{
 const f=activityFilterSchema.parse(input),values:unknown[]=[],where:string[]=[];const param=(v:unknown)=>{values.push(v);return `$${values.length}`;};
 if(!f.notes&&f.kind!=='event')where.push("source<>'event'");
 if(f.kind!=='all')where.push(`kind=${param(f.kind)}`);
 if(f.status!=='all')where.push(`state=${param(f.status)}`);
 if(f.q)where.push(`position(lower(${param(f.q)}) in lower(description||' '||coalesce(error,'')||' '||coalesce(details->>'model','')))>0`);
 const clause=where.length?'WHERE '+where.join(' AND '):'';
 return tenant(userId,async db=>{
  const summary=(await db.query(cte+`SELECT count(*)::int AS total,count(*) FILTER(WHERE state='active')::int AS active,count(*) FILTER(WHERE state='attention')::int AS attention,count(*) FILTER(WHERE state='completed')::int AS completed FROM activity ${clause}`,values)).rows[0];
  const pages=Math.max(1,Math.ceil(summary.total/f.pageSize)),page=Math.min(f.page,pages),order=f.sort==='oldest'?'at ASC':f.sort==='status'?"CASE state WHEN 'attention' THEN 0 WHEN 'active' THEN 1 WHEN 'cancelled' THEN 2 ELSE 3 END,at DESC":'at DESC';
  const items=(await db.query(cte+`SELECT * FROM activity ${clause} ORDER BY ${order},source,id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,f.pageSize,(page-1)*f.pageSize])).rows;
  return {items,total:summary.total,page,pages,pageSize:f.pageSize,summary};
 });
}
export async function activityItems(userId:string,id:string,page:number,status:string){
 return tenant(userId,async db=>{
  const condition="i.plan_id=$1 AND ($2::text='all' OR i.status=$2)";
  const total=(await db.query(`SELECT count(*)::int AS n FROM action_items i WHERE ${condition}`,[id,status])).rows[0].n;
  const pages=Math.max(1,Math.ceil(total/50)),p=Math.min(pages,page);
  const items=(await db.query(`SELECT i.id,i.status,i.error,m.subject,m.sender FROM action_items i JOIN messages m ON m.id=i.message_id AND m.user_id=i.user_id WHERE ${condition} ORDER BY i.id LIMIT 50 OFFSET $3`,[id,status,(p-1)*50])).rows;
  return {items,total,pages,page:p,pageSize:50};
 });
}
