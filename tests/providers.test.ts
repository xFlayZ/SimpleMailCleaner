import { afterEach,describe,it,expect,vi } from 'vitest';
import { GmailAdapter } from '../src/lib/mail/gmail';
import { OutlookAdapter } from '../src/lib/mail/outlook';
afterEach(()=>vi.unstubAllGlobals());
describe('Anbieteraktionen',()=>{
 it('verwendet ausschließlich Gmail trash und erhält Labels für Restore',async()=>{
  const calls:{url:string;init:RequestInit}[]=[];
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{calls.push({url,init});return Response.json(url.includes('format=minimal')?{labelIds:['INBOX','UNREAD']}:{id:'m1'});}));
  const mail=new GmailAdapter('test-access');const result=await mail.trash('m1');expect(result.labels).toEqual(['INBOX','UNREAD']);await mail.restore(result);
  expect(calls.some(c=>c.url.endsWith('/trash')&&c.init.method==='POST')).toBe(true);expect(calls.some(c=>c.url.endsWith('/untrash'))).toBe(true);expect(calls.some(c=>c.init.method==='DELETE')).toBe(false);
 });
 it('verschiebt Outlook-Nachrichten in deleteditems und speichert den Originalordner',async()=>{
  const calls:{url:string;init:RequestInit}[]=[];
  vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{calls.push({url,init});return Response.json(url.includes('mailFolders/deleteditems')?{id:'trash'}:url.endsWith('/move')?{id:'moved-id'}:{id:'m1',parentFolderId:'original-folder'});}));
  const mail=new OutlookAdapter('test-access'),restore=await mail.trash('m1');expect(restore.folder).toBe('original-folder');expect(restore.remoteId).toBe('moved-id');await mail.restore(restore);
  const moves=calls.filter(c=>c.url.endsWith('/move'));expect(JSON.parse(moves[0].init.body as string)).toEqual({destinationId:'deleteditems'});expect(JSON.parse(moves[1].init.body as string)).toEqual({destinationId:'original-folder'});
  expect((moves[0].init.headers as Record<string,string>).Prefer).toContain('ImmutableId');
 });
 it('verwirft Graph-Paginierung zu fremden Hosts',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({value:[],'@odata.nextLink':'https://evil.example/capture'})));
  await expect(new OutlookAdapter('token').list(new Date(),20)).rejects.toThrow('Fortsetzungslink');
 });
});
