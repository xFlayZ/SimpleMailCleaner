import { readFile,mkdir,writeFile,rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { validSignature } from '../src/lib/crypto';
import { ImapAdapter,type ImapConfig } from '../src/lib/mail/imap';
import { jsonRequest } from '../src/lib/http';
import type { RestoreData } from '../src/lib/mail/types';
const base=new URL(process.env.SERVER_URL||'http://localhost:3000');
if(base.protocol!=='https:' && !['localhost','127.0.0.1','[::1]'].includes(base.hostname))throw new Error('Connector benötigt HTTPS außerhalb von localhost.');
const bearer=process.env.CONNECTOR_TOKEN,key=process.env.CONNECTOR_DEVICE_KEY;
if(!bearer||!key||Buffer.from(key,'base64').length!==32)throw new Error('CONNECTOR_TOKEN und CONNECTOR_DEVICE_KEY fehlen.');
const host=process.env.BRIDGE_HOST||'127.0.0.1';
if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('Bridge muss lokal erreichbar sein.');
const config:ImapConfig={host,port:Number(process.env.BRIDGE_PORT||1143),secure:process.env.BRIDGE_SECURE==='true',user:process.env.BRIDGE_USER||'',password:process.env.BRIDGE_PASSWORD||'',servername:process.env.BRIDGE_SERVERNAME||'localhost',ca:process.env.BRIDGE_CA_FILE?await readFile(process.env.BRIDGE_CA_FILE,'utf8'):undefined};
if(!config.user||!config.password)throw new Error('Bridge-Zugang fehlt.');
const directory=resolve('.connector');await mkdir(directory,{recursive:true,mode:0o700});
// Durable replay ledger: after a crash, started writes are never executed again.
const ledgerPath=resolve(directory,'ledger.json');
let ledger:Record<string,{status:string;result?:unknown}>={};
try{ledger=JSON.parse(await readFile(ledgerPath,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
async function save(){await writeFile(`${ledgerPath}.tmp`,JSON.stringify(ledger),{mode:0o600});await rename(`${ledgerPath}.tmp`,ledgerPath);}
const envelopeSchema=z.object({id:z.uuid(),kind:z.enum(['list','content','guard','trash','restore']),expiresAt:z.iso.datetime(),payload:z.object({email:z.email(),args:z.unknown()})});
let stopping=false;process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
console.log('Proton-Connector gestartet. Bridge und TLS-Zertifikat werden pro Auftrag geprüft.');
while(!stopping) {
 try {
  const job=await jsonRequest(new URL('/api/connector/poll',base).href,{headers:{Authorization:`Bearer ${bearer}`}});
  if(job) {
   if(!validSignature(key,job.envelope,job.signature))throw new Error('Ungültige Auftragssignatur.');
   const task=envelopeSchema.parse(job.envelope);
   if(new Date(task.expiresAt).getTime()<Date.now()||new Date(task.expiresAt).getTime()>Date.now()+120000)throw new Error('Ungültige Auftragslaufzeit.');
   if(task.payload.email.toLowerCase()!==config.user.toLowerCase())throw new Error('Auftrag gehört zu einem anderen Bridge-Konto.');
   const mutation=['trash','restore'].includes(task.kind);
   let result:unknown;
   if(ledger[task.id])result=ledger[task.id].result||{ok:false,error:'unknown'};
   else {
    if(mutation){ledger[task.id]={status:'started'};await save();}
    let mail:ImapAdapter|undefined;
    try {
     mail=await new ImapAdapter(config).connect();let data:unknown;
     if(task.kind==='list'){const a=z.object({since:z.iso.datetime(),max:z.number().int().min(1).max(20000)}).parse(task.payload.args);data=await mail.list(new Date(a.since),a.max);}
     else if(task.kind==='content'){const a=z.object({remoteId:z.string().max(4000)}).parse(task.payload.args);const c=await mail.content(a.remoteId);data={text:c.text,raw:c.raw.toString('base64')};}
     else if(task.kind==='guard'){const a=z.object({remoteId:z.string().max(4000)}).parse(task.payload.args);data=await mail.guard(a.remoteId);}
     else if(task.kind==='trash'){const a=z.object({remoteId:z.string().max(4000)}).parse(task.payload.args);data=await mail.trash(a.remoteId);}
     else {const a=z.object({remoteId:z.string().max(4000),folder:z.string().max(1000),originalId:z.string().optional()}).parse(task.payload.args);data=await mail.restore(a as RestoreData);}
     result={ok:true,data};
    }catch{result={ok:false,error:mutation?'unknown':'bridge_error'};}
    finally{await mail?.close();}
    if(mutation){ledger[task.id]={status:'done',result};await save();}
   }
   await jsonRequest(new URL(`/api/connector/tasks/${task.id}`,base).href,{method:'POST',headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},body:JSON.stringify(result)},4_000_000);
  }
 }catch{console.error('Connector-Verbindung/Auftrag fehlgeschlagen. Zugang, Bridge und Server prüfen. Keine automatische Wiederholung von Schreibaktionen.');}
 await new Promise(resolve=>setTimeout(resolve,2000));
}
