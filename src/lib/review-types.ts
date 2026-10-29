import { z } from 'zod';
export const reviewFilterSchema=z.object({
 accountId:z.union([z.uuid(),z.literal('all')]).default('all'),
 state:z.enum(['active','trashed','all']).default('active'),q:z.string().max(300).default(''),
 category:z.string().max(40).default('all'),recommendation:z.enum(['all','trash','review','keep']).default('all'),
 read:z.enum(['all','read','unread']).default('all'),attachments:z.enum(['all','with','without']).default('all'),
 protection:z.enum(['all','protected','unprotected']).default('all'),
 source:z.enum(['all','unclassified','rules','ai','manual','cache']).default('all'),
 dateFrom:z.iso.date().or(z.literal('')).default(''),
 dateTo:z.iso.date().or(z.literal('')).default(''),
 sender:z.string().max(320).default(''),newsletter:z.boolean().default(false),
 sort:z.enum(['newest','oldest','sender','size']).default('newest'),
 page:z.coerce.number().int().min(1).max(100000).default(1),
 pageSize:z.coerce.number().int().refine(v=>[25,50,100].includes(v)).default(50)
});
export type ReviewFilters=z.infer<typeof reviewFilterSchema>;
export const cleanupConfigSchema=z.object({
 method:z.enum(['local','worker','batch']).default('local'),
 analysisMode:z.enum(['grouped','full_ai','hybrid']).default('grouped'),
 preset:z.enum(['careful','balanced','thorough','custom']).default('balanced'),
 minAgeDays:z.number().int().min(0).max(3650).default(90),
 includeUnread:z.boolean().default(false),
 newsletters:z.boolean().default(true),promotions:z.boolean().default(true),notifications:z.boolean().default(false),
 groupPatterns:z.boolean().default(true),reuseCache:z.boolean().default(true),
 minGroupSize:z.number().int().min(2).max(100).default(3),
 groupsPerRequest:z.number().int().min(5).max(80).default(40),
 includeTerms:z.array(z.string().min(1).max(100)).max(20).default([]),
 excludeTerms:z.array(z.string().min(1).max(100)).max(20).default([]),
 userInstruction:z.string().trim().max(2000).default(''),
 model:z.string().max(200).default(''),
 budget:z.number().min(.01).max(100).default(1),
 maxMessages:z.number().int().min(0).max(50000).default(20000)
}).refine(v=>v.method!=='local'||v.analysisMode==='grouped',{message:'Voll-KI und Hybrid erfordern einen KI-Verarbeitungsweg.',path:['analysisMode']});
export type CleanupConfig=z.infer<typeof cleanupConfigSchema>;
export const defaultCleanupConfig=cleanupConfigSchema.parse({});
export type IndexedMessage={
 id:string;account_id:string;sender:string;subject:string;received_at:string|Date;
 size:number;is_read:boolean;flagged:boolean;has_attachments:boolean;protected:boolean;
 list_id:string|null;newsletter_signal:boolean;category:string;recommendation:string;
 reason:string;version:number;state:string;analysis_mode?:string|null;decision_source?:string|null;
 protection_override?:boolean;effective_protected?:boolean;
 unsubscribe_verified?:boolean;unsubscribe_status?:string;
};
export type Decision={category:string;action:'keep'|'review'|'trash';reason:string;confidence:'high'|'medium'|'low'};
export type PatternGroup={
 id:string;sender:string;pattern:string;members:IndexedMessage[];
 samples:string[];newsletter:boolean;fingerprint:string;localDecision?:Decision|null;
};
export type PipelineStats={total:number;protected:number;localDecisions:number;localTrash:number;groups:number;aiGroups:number;cachedGroups:number;aiMessages:number;requests:number};
export type ReviewPreview={id:string;expiresAt:string;stats:PipelineStats;estimate:{low:number;high:number;reservation:number;currency:string;model:string;batch:boolean};sample:{subject:string;sender:string;action:string;reason:string}[];method:string;analysisMode:'grouped'|'full_ai'|'hybrid'};
export type MessagePage={items:(IndexedMessage&{analyzed_at?:string;analysis_mode?:string|null;decision_confidence?:string})[];total:number;page:number;pageSize:number;pages:number;summary:{trash:number;keep:number;review:number;newsletters:number;senders:number}};
export type ReviewRunView={id:string;status:string;config:CleanupConfig;model:string|null;total:number;processed:number;changed:number;skipped:number;stats:PipelineStats;estimated_low:number|string;estimated_high:number|string;cost?:number;estimated?:number;error:string|null;snapshot_at:string;completed_at:string|null;batch?:{remote_id:string|null;status:string;cleanup_status:string;error:string|null}|null};
