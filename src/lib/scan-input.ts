import {z} from 'zod';
/** Zero means no limit, exclusively for metadata imports. Persisted unchanged for retries. */
export const scanInputSchema=z.object({accountId:z.uuid(),mode:z.enum(['metadata','ai_headers','ai']),days:z.number().int().min(0).max(3650),max:z.number().int().min(0).max(20000),confirmAi:z.boolean().default(false),confirmContent:z.boolean().default(false)})
 .refine(d=>d.mode==='metadata'||d.days>0&&d.max>0,{message:'„Alle“ ist nur für den Metadatenimport verfügbar.'})
 .refine(d=>d.mode!=='ai'||d.max<=500,{message:'Inhaltsscan auf 500 Nachrichten begrenzt.'});
