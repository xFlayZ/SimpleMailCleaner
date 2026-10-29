import { AppError } from './errors';
export async function readLimited(response:Response,limit=5_000_000) {
 if(Number(response.headers.get('content-length')||0)>limit) {await response.body?.cancel();throw new AppError(422,'Nachricht oder Antwort überschreitet das Größenlimit.');}
 const reader=response.body?.getReader(); if(!reader) return Buffer.alloc(0);
 const parts:Uint8Array[]=[];let size=0;
 try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new AppError(422,'Antwort überschreitet das Größenlimit.');parts.push(value);}}
 finally {await reader.cancel().catch(()=>{});}
 return Buffer.concat(parts);
}
export async function jsonRequest(url:string,init:RequestInit={},limit=5_000_000) {
 const response=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!response.ok) {
  if(response.status===404&&url.startsWith('https://openrouter.ai/api/v1/')){
   const payload=await response.json().catch(()=>null) as {error?:{message?:string}}|null;
   if(/no endpoints|no available (?:provider|endpoint)|no provider routes/i.test(payload?.error?.message||''))throw new AppError(502,'OpenRouter findet keine passende Modellroute. Datenschutzfilter (ZDR/Datensammlung) oder Modellparameter schließen verfügbare Anbieter aus. Modellroute prüfen; Datenschutz wird nicht gelockert.');
   throw new AppError(502,'OpenRouter antwortet mit HTTP 404. Modell-ID und Anbieterroute prüfen.');
  }
  await response.body?.cancel();
  if(response.status===429)throw new AppError(429,'Anbieter-Ratenlimit erreicht. Später erneut starten.');
  if(response.status===401||response.status===403)throw new AppError(409,'Anbieterzugang abgelaufen oder Berechtigung fehlt. Konto neu verbinden.');
  throw new AppError(502,`Anbieter antwortet mit HTTP ${response.status}.`);
 }
 return JSON.parse((await readLimited(response,limit)).toString('utf8'));
}
