import { describe,it,expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { dkimSign } from 'mailauth/lib/dkim/sign.js';
import { verifiedUnsubscribe } from '../src/lib/unsubscribe';
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const privateKey=keys.privateKey.export({type:'pkcs8',format:'pem'});
const publicKey=keys.publicKey.export({type:'spki',format:'der'}).toString('base64');
const raw=Buffer.from(`From: Newsletter <newsletter@news.example.com>\r\nTo: reader@example.net\r\nSubject: Weekly news\r\nDate: ${new Date().toUTCString()}\r\nList-Unsubscribe: <https://news.example.com/unsubscribe?id=opaque>\r\nList-Unsubscribe-Post: List-Unsubscribe=One-Click\r\n\r\nNewsletter content.\r\n`);
const resolver=async(name:string)=>{
 if(name!=='test._domainkey.news.example.com')throw new Error('Unexpected DNS lookup');
 return [[`v=DKIM1; k=rsa; p=${publicKey}`]];
};
async function signed(headers:string[]){
 const result=await dkimSign(raw,{headerList:headers,signatureData:[{signingDomain:'news.example.com',selector:'test',privateKey}],strict:true});
 return Buffer.concat([Buffer.from(result.signatures),raw]);
}
describe('RFC-8058 mit echter kryptografischer DKIM-Prüfung',()=>{
 it('akzeptiert authentifizierte Abmeldungen mit beiden signierten Headern',async()=>{
  const message=await signed(['From','To','Subject','Date','List-Unsubscribe','List-Unsubscribe-Post']);
  expect(await verifiedUnsubscribe(message,{resolver})).toBe('https://news.example.com/unsubscribe?id=opaque');
 });
 it('verweigert gültige DKIM-Signaturen ohne Abdeckung des POST-Headers',async()=>{
  const message=await signed(['From','To','Subject','Date','List-Unsubscribe']);
  expect(await verifiedUnsubscribe(message,{resolver})).toBeNull();
 });
 it('verweigert nachträglich manipulierte Abmeldeziele',async()=>{
  const message=await signed(['From','To','Subject','Date','List-Unsubscribe','List-Unsubscribe-Post']);
  expect(await verifiedUnsubscribe(Buffer.from(message.toString().replace('id=opaque','id=attacker')),{resolver})).toBeNull();
 });
});
