import { describe,it,expect,beforeEach,vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encrypt,decrypt,passwordHash,passwordMatches,deviceSignature,validSignature } from '../src/lib/crypto';
import { protectionReasons } from '../src/lib/policy';
import { publicIPv4,unsubscribeTarget,verifiedUnsubscribe } from '../src/lib/unsubscribe';
import { analysisSchema,estimate,modelReason,completionParameters } from '../src/lib/ai';
import { decodeRef,encodeRef,ImapAdapter } from '../src/lib/mail/imap';
describe('Verschlüsselung und Zugang',()=>{
 beforeEach(()=>{process.env.ENCRYPTION_KEY=randomBytes(32).toString('base64');});
 it('bindet verschlüsselte Schlüssel an den Eigentümer und erkennt Manipulation',()=>{
  const box=encrypt('secret-key','alice');expect(decrypt(box,'alice')).toBe('secret-key');
  expect(()=>decrypt(box,'bob')).toThrow();expect(()=>decrypt(box.slice(0,-3)+'abc','alice')).toThrow();
 });
 it('speichert gesalzene Passworthashes und prüft sicher',async()=>{
  const hash=await passwordHash('a-long-random-passphrase');expect(await passwordMatches('a-long-random-passphrase',hash)).toBe(true);expect(await passwordMatches('wrong',hash)).toBe(false);expect(await passwordHash('a-long-random-passphrase')).not.toBe(hash);
 });
 it('signiert exakt den unveränderten Connectorauftrag',()=>{
  const key=randomBytes(32).toString('base64'),payload={id:'one',kind:'trash',expiresAt:'2026-01-01'};
  const sig=deviceSignature(key,payload);expect(validSignature(key,payload,sig)).toBe(true);expect(validSignature(key,{...payload,id:'two'},sig)).toBe(false);expect(validSignature(key,payload,'bad')).toBe(false);
 });
});
describe('Schutzregeln und KI',()=>{
 it('nimmt Rechnungen, Flaggen, Anhänge und Nutzerregeln aus Sammelaktionen',()=>{
  const mail={subject:'Rechnung zu deiner Bestellung',sender:'shop@example.com',flagged:true,has_attachments:true};
  expect(protectionReasons(mail,new Set(['shop@example.com']))).toHaveLength(4);
  expect(protectionReasons({...mail,subject:'Neu im Shop',flagged:false,has_attachments:false})).toEqual([]);
 });
 it('akzeptiert keine erfundenen Aktionen oder überlange Modellantworten',()=>{
  expect(()=>analysisSchema.parse({category:'newsletter',action:'delete_forever',reason:'test',riskFlags:[]})).toThrow();
  expect(()=>analysisSchema.parse({category:'newsletter',action:'trash',reason:'x'.repeat(601),riskFlags:[]})).toThrow();
 });
 it('berechnet eine konservative Reservierung inklusive Anfragekosten',()=>{
  const m={id:'test',name:'test',context_length:32000,pricing:{prompt:'0.000001',completion:'0.000002',request:'0.01'},architecture:{input_modalities:['text'],output_modalities:['text']},supported_parameters:['response_format']};
  expect(estimate(m,1000)).toBeCloseTo((.003+.0014+.01)*1.25);expect(modelReason(m)).toBeNull();expect(modelReason({...m,supported_parameters:[]})).toBeTruthy();
  expect(modelReason({...m,id:'google/gemini-2.5-flash-lite'})).toContain('abgekündigt');
  expect(completionParameters('openai/gpt-6-luna',80)).toEqual({max_completion_tokens:80});
  expect(completionParameters('google/gemini-3.1-flash-lite',80)).toEqual({max_tokens:80,temperature:0});
 });
});
describe('Abmeldeziele und Authentizität',()=>{
 it.each(['127.0.0.1','10.0.1.2','169.254.169.254','172.16.1.1','192.168.2.1','100.64.1.2','0.0.0.0','224.1.2.3','198.18.1.2','192.0.0.1','203.0.113.1','::1','999.1.2.3'])('blockiert reserviertes Ziel %s',ip=>expect(publicIPv4(ip)).toBe(false));
 it('erlaubt öffentliche IPv4-Adressen',()=>expect(publicIPv4('8.8.8.8')).toBe(true));
 it.each(['http://example.com/u','https://user:pass@example.com/u','https://example.com:8443/u','https://localhost/u','file:///etc/passwd'])('blockiert unsichere URL %s',url=>expect(()=>unsubscribeTarget(url)).toThrow());
 it('führt niemals aufgrund unbestätigter List-Unsubscribe-Header eine Abmeldung durch',async()=>{
  const raw=Buffer.from('From: list@example.com\r\nList-Unsubscribe: <https://example.com/u>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n\r\nhello');
  expect(await verifiedUnsubscribe(raw)).toBeNull();
 });
});
describe('IMAP-Zielsicherheit',()=>{
 it('bindet Nachrichten an UIDVALIDITY und Ordner statt Sequenznummer',()=>{
  const ref=encodeRef('INBOX','9001',42);expect(decodeRef(ref)).toEqual({folder:'INBOX',validity:'9001',uid:42});expect(()=>decodeRef(Buffer.from('{"uid":0}').toString('base64url'))).toThrow();
 });
 it('verweigert COPY/DELETE-Fallback ohne echtes MOVE',async()=>{
  const mail=new ImapAdapter({host:'localhost',port:993,secure:true,user:'x',password:'x'});
  const move=vi.fn();
  Object.assign(mail,{client:{list:async()=>[{specialUse:'\\Trash',path:'Trash'}],getMailboxLock:async()=>({release:vi.fn()}),mailbox:{uidValidity:9n},capabilities:new Set(['UIDPLUS']),messageMove:move}});
  await expect(mail.trash(encodeRef('INBOX','9',1))).rejects.toThrow('UID-MOVE');expect(move).not.toHaveBeenCalled();
 });
});
