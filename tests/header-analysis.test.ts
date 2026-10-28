import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {buildHeaderPrompt,validateHeaderResults,headerFingerprint} from '../src/lib/ai';
import {estimateScanCost} from '../src/lib/scan-cost';
const model={id:'test',name:'test',context_length:100000,pricing:{prompt:'0.000001',completion:'0.000005',request:'0'}};
describe('KI-Schnellanalyse ohne Inhalt',()=>{
 it('überträgt ausschließlich erlaubte Metadaten, auch wenn das Eingabeobjekt einen Body enthält',()=>{
  const input={id:randomUUID(),sender:'news@example.com',subject:'Weekly news',receivedAt:'2026-10-28T00:00:00.000Z',text:'SECRET BODY',raw:'SECRET ATTACHMENT'};
  const serialized=JSON.stringify(buildHeaderPrompt([input]));expect(serialized).not.toContain('SECRET');
  expect(serialized).toContain('news@example.com');expect(serialized).toContain('Weekly news');
 });
 it('begrenzt Betrefflängen und macht Kürzungen sichtbar',()=>{
  const prompt=buildHeaderPrompt([{id:randomUUID(),sender:'a@example.com',subject:'x'.repeat(800),receivedAt:'2026-10-28'}]);
  const sent=JSON.parse(prompt[1].content);expect(sent.items[0].subject).toHaveLength(400);expect(sent.items[0].truncated).toBe(true);
 });
 it('verwirft fremde, doppelte und fehlende Nachrichtenreferenzen',()=>{
  const id=randomUUID(),other=randomUUID(),r={id,category:'newsletter',action:'trash',reason:'Werbung anhand Betreff',riskFlags:[]};
  expect(()=>validateHeaderResults({items:[r,r]},[id,other])).toThrow();
  expect(()=>validateHeaderResults({items:[{...r,id:other}]},[id])).toThrow();
  expect(()=>validateHeaderResults({items:[r]},[id,other])).toThrow();
  expect(validateHeaderResults({items:[r]},[id])).toHaveLength(1);
 });
 it('macht den Cache abhängig von Absender, Betreff, Datum und Modell',()=>{
  const mail={sender:'a@example.com',subject:'Weekly news',receivedAt:'2026-10-28'};
  const original=headerFingerprint(mail,'m1');expect(headerFingerprint({...mail},'m1')).toBe(original);
  expect(headerFingerprint({...mail,subject:'Invoice'},'m1')).not.toBe(original);expect(headerFingerprint(mail,'m2')).not.toBe(original);
 });
 it('zeigt für 12.000 Nachrichten eine deutlich kleinere Planungsspanne als beim Inhaltsscan',()=>{
  const headers=estimateScanCost(model,12000,'ai_headers'),body=estimateScanCost(model,12000,'ai');
  expect(headers.calls).toBe(600);expect(headers.high).toBeLessThan(body.high/3);
  expect(headers.low).toBeCloseTo(5.28);expect(headers.high).toBeCloseTo(9.9);
  expect(estimateScanCost(model,12000,'metadata').high).toBe(0);
  expect(estimateScanCost(model,0,'ai_headers').calls).toBe(0);
 });
});
