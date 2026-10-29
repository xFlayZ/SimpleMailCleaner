import {afterEach,describe,it,expect,vi} from 'vitest';
import {GmailAdapter} from '../src/lib/mail/gmail';
import {OutlookAdapter} from '../src/lib/mail/outlook';
import {AppError,publicError,errorDiagnostic} from '../src/lib/errors';
import {scanInputSchema} from '../src/lib/scan-input';
afterEach(()=>vi.unstubAllGlobals());
describe('provider metadata import',()=>{
 it('accepts independent unlimited metadata bounds but rejects unlimited AI scans',()=>{
  const base={accountId:'00000000-0000-4000-8000-000000000001',mode:'metadata',days:0,max:0};
  expect(scanInputSchema.parse(base).max).toBe(0);
  expect(scanInputSchema.parse({...base,days:90}).days).toBe(90);
  expect(scanInputSchema.parse({...base,max:100}).max).toBe(100);
  expect(()=>scanInputSchema.parse({...base,mode:'ai'})).toThrow();
  expect(()=>scanInputSchema.parse({...base,mode:'ai_headers'})).toThrow();
 });
 it('paginates all Gmail messages without a date or total count limit',async()=>{
  const urls:string[]=[];
  vi.stubGlobal('fetch',async(url:string)=>{urls.push(url);if(url.includes('format=metadata'))return Response.json({id:'fixture',internalDate:'1704067200000',payload:{headers:[]}});return Response.json({messages:[{id:'fixture'}],...(!url.includes('pageToken')?{nextPageToken:'next'}:{})});});
  expect(await new GmailAdapter('fixture').list(new Date(0),0)).toHaveLength(2);
  const pages=urls.filter(u=>!u.includes('format=metadata'));expect(pages).toHaveLength(2);for(const url of pages){expect(new URL(url).searchParams.get('q')).toBe('in:inbox');expect(new URL(url).searchParams.get('maxResults')).toBe('100');}
 });
 it('paginates all Outlook messages without a date or total count limit',async()=>{
  const urls:string[]=[];
  vi.stubGlobal('fetch',async(url:string)=>{urls.push(url);return Response.json({value:[{id:'fixture',receivedDateTime:'2024-01-01'}],...(urls.length===1?{'@odata.nextLink':'https://graph.microsoft.com/v1.0/next'}:{})});});
  expect(await new OutlookAdapter('fixture').list(new Date(0),0)).toHaveLength(2);expect(new URL(urls[0]).searchParams.has('$filter')).toBe(false);expect(new URL(urls[0]).searchParams.get('$top')).toBe('100');
 });
 it('fetches Gmail metadata with bounded concurrency and reports progress',async()=>{
  let active=0,peak=0;const urls:string[]=[],progress:number[]=[];
  vi.stubGlobal('fetch',async(url:string)=>{urls.push(url);if(!url.includes('format=metadata'))return Response.json({messages:Array.from({length:12},(_,i)=>({id:String(i)}))});active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,1));active--;return Response.json({id:url.match(/messages\/(\d+)/)?.[1],internalDate:'1704067200000',payload:{headers:[]},labelIds:[]});});
  const result=await new GmailAdapter('fixture').list(new Date('2024-01-01'),12,{progress:async n=>{progress.push(n);}});
  expect(result).toHaveLength(12);expect(peak).toBe(5);expect(progress).toEqual([5,10,12]);expect(urls.filter(u=>u.includes('format=metadata'))).toHaveLength(12);expect(urls.every(u=>!u.includes('format=raw'))).toBe(true);
 });
 it('cancels Gmail during fetching rather than after the full mailbox',async()=>{
  let fetched=0;
  vi.stubGlobal('fetch',async(url:string)=>{if(!url.includes('format=metadata'))return Response.json({messages:Array.from({length:20},(_,i)=>({id:String(i)}))});fetched++;return Response.json({internalDate:'1704067200000',payload:{headers:[]}});});
  await expect(new GmailAdapter('fixture').list(new Date(),20,{check:async()=>{if(fetched>=5)throw new AppError(409,'Scan abgebrochen.');}})).rejects.toThrow('Scan abgebrochen');expect(fetched).toBe(5);
 });
 it('reports Outlook pages and checks cancellation between them',async()=>{
  let pages=0,checks=0;const progress:number[]=[];
  vi.stubGlobal('fetch',async()=>{pages++;return Response.json({value:[{id:String(pages),receivedDateTime:'2024-01-01',internetMessageHeaders:[]}],...(pages===1?{'@odata.nextLink':'https://graph.microsoft.com/v1.0/next'}:{})});});
  expect(await new OutlookAdapter('fixture').list(new Date(),2,{check:async()=>{checks++;},progress:async n=>{progress.push(n);}})).toHaveLength(2);expect(checks).toBe(2);expect(progress).toEqual([1,2]);
 });
 it('returns explicit timeout/network diagnostics without sensitive exception text',()=>{
  const error=Object.assign(new TypeError('secret URL or credentials'),{cause:{code:'ECONNRESET'}});
  expect(publicError(error)).toContain('ECONNRESET');expect(JSON.stringify(errorDiagnostic(error))).not.toContain('secret');expect(publicError(Object.assign(new Error(),{code:'42703'}))).toContain('migration');expect(publicError(new DOMException('secret','TimeoutError'))).toContain('Zeitüberschreitung');
 });
});
