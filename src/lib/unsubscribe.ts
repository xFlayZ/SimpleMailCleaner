import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { dkimVerify } from 'mailauth/lib/dkim/verify.js';
import { AppError } from './errors';
export function publicIPv4(ip:string) {
 const parts=ip.split('.').map(Number);
 if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
 const [a,b,c]=parts;
 return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||b===51&&c===100))||(a===203&&b===0&&c===113));
}
export function unsubscribeTarget(value:string) {
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||url.hash||url.hostname.endsWith('.local')||url.hostname==='localhost')throw new AppError(422,'Unsicheres Abmeldeziel.');
 return url;
}
export async function verifiedUnsubscribe(raw:Buffer,verificationOptions?:Record<string,unknown>):Promise<string|null> {
 const block=raw.toString('utf8',0,Math.min(raw.length,150000)).split(/\r?\n\r?\n/)[0].replace(/\r?\n[ \t]+/g,' ');
 const headers=block.split(/\r?\n/);
 const lists=headers.filter(h=>/^list-unsubscribe:/i.test(h));
 const posts=headers.filter(h=>/^list-unsubscribe-post:/i.test(h));
 if(lists.length!==1||posts.length!==1||!/^list-unsubscribe-post:\s*List-Unsubscribe=One-Click\s*$/i.test(posts[0]))return null;
 const targets=[...lists[0].matchAll(/<(https:\/\/[^<>\s]+)>/gi)].map(m=>m[1]);
 if(targets.length!==1)return null;
 try{unsubscribeTarget(targets[0]);}catch{return null;}
 const verified=await dkimVerify(raw,{...verificationOptions,strict:true});
 const valid=verified.results.some(r=>{
  const keys=(r.signingHeaders?.keys||'').toLowerCase().split(':').map(x=>x.trim());
  return r.status.result==='pass'&&Boolean(r.status.aligned)&&r.signatureTimeValid!==false&&r.algo?.endsWith('sha256')&&keys.includes('list-unsubscribe')&&keys.includes('list-unsubscribe-post');
 });
 return valid?targets[0]:null;
}
export async function sendUnsubscribe(target:string) {
 const url=unsubscribeTarget(target);
 // Pin the already-validated IPv4 address to this TLS connection. No second DNS lookup.
 const answers=await lookup(url.hostname,{all:true,family:4});
 if(!answers.length||answers.some(a=>!publicIPv4(a.address)))throw new AppError(422,'Abmeldeziel ist kein öffentliches Internetziel.');
 const address=answers[0].address;
 await new Promise<void>((resolve,reject)=>{
  const body='List-Unsubscribe=One-Click';
  const req=request(url,{method:'POST',agent:false,family:4,lookup:(_host,_options,callback)=>callback(null,address,4),headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body),'User-Agent':'SimpleMailCleaner/0.1'},timeout:15000},res=>{
   const code=res.statusCode||0;res.destroy();
   if(code>=200&&code<300)resolve();else reject(new AppError(409,`Abmelde-Endpunkt antwortet mit HTTP ${code}. Keine automatische Wiederholung.`));
  });
  req.on('timeout',()=>req.destroy(new Error('timeout')));req.on('error',reject);req.end(body);
 });
}
