import {z} from 'zod';
import type {IndexedMessage,Decision} from './review-types';
import {protectionReasons} from './policy';
export const personalConfig=z.object({
 sender:z.string().trim().min(3).max(320), category:z.string().min(1).max(40),
 terms:z.array(z.string().trim().min(2).max(80)).min(1).max(12),
 minAgeDays:z.number().int().min(0).max(3650).default(0),
 exceptions:z.array(z.string().min(2).max(80)).max(30).default(['rechnung','invoice','bestellung','order','versand','shipping','security','sicherheit','vertrag']),
 decision:z.enum(['keep','archive','remove'])
});
export type PersonalConfig=z.infer<typeof personalConfig>;
export type PersonalRule={id:string;account_id:string;name:string;config:PersonalConfig;enabled:boolean;priority:number};
export function features(m:IndexedMessage){return {sender:m.sender.toLowerCase(),category:m.category,terms:[...new Set(m.subject.toLowerCase().match(/[\p{L}]{4,}/gu)||[])].filter(t=>!['eine','einer','deine','dieser','their','your','with','from','diese','haben','unser'].includes(t)).slice(0,12)};}
export function inspectPersonalMatch(m:IndexedMessage,c:PersonalConfig,now=Date.now()){
 const subject=m.subject.toLowerCase(),matchingTerms=c.terms.filter(t=>subject.includes(t.toLowerCase())),exceptionMatches=c.exceptions.filter(t=>subject.includes(t.toLowerCase())),ageDays=Math.max(0,(now-new Date(m.received_at).getTime())/86400000);
 return {senderMatches:m.sender.toLowerCase()===c.sender.toLowerCase(),categoryMatches:m.category===c.category,matchingTerms,hasTerm:matchingTerms.length>0,exceptionMatches,ageDays,ageMatches:ageDays>=c.minAgeDays};
}
export function matchesPersonal(m:IndexedMessage,c:PersonalConfig,now=Date.now()){
 const x=inspectPersonalMatch(m,c,now);
 return x.senderMatches&&x.categoryMatches&&x.hasTerm&&!x.exceptionMatches.length&&x.ageMatches;
}
export function personalDecision(m:IndexedMessage,rules:PersonalRule[],protectedSenders:Set<string>,now=Date.now()):Decision|null{
 if(protectionReasons(m,protectedSenders).length)return null;
 const hits=rules.filter(r=>r.enabled&&r.account_id===m.account_id&&matchesPersonal(m,r.config,now));
 if(!hits.length)return null;
 if(new Set(hits.map(r=>r.config.decision)).size>1)return {category:m.category,action:'review',confidence:'low',reason:'Widersprüchliche persönliche Regeln: manuelle Prüfung erforderlich.'};
 const hit=[...hits].sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id))[0];
 return {category:m.category,action:hit.config.decision==='remove'?'trash':hit.config.decision==='archive'?'review':'keep',confidence:'high',reason:`Persönliche Regel ${hit.id}: ${hit.name}${hit.config.decision==='archive'?' · Archivieren empfohlen (keine Anbieteraktion).':''}`};
}
export function trainingSelection(messages:IndexedMessage[],size:number){
 const buckets=[messages.filter(m=>m.recommendation==='review'),messages.filter(m=>m.recommendation==='keep'),messages.filter(m=>m.recommendation==='trash'),messages.filter(m=>m.recommendation!=='review')];
 const selected:IndexedMessage[]=[],ids=new Set<string>(),senders=new Map<string,number>();
 const diversity=(m:IndexedMessage)=>[m.sender,'category:'+m.category,'pattern:'+m.subject.toLowerCase().replace(/\d+/g,'#'),'age:'+Math.floor(Math.log2(1+Math.max(0,(Date.now()-new Date(m.received_at).getTime())/86400000)))];
 const score=(m:IndexedMessage)=>diversity(m).reduce((n,key)=>n+(senders.get(key)||0),0);
 for(let i=0;selected.length<size&&i<messages.length*4;i++){
  const bucket=buckets[i%4];bucket.sort((a,b)=>score(a)-score(b)||a.id.localeCompare(b.id));
  const next=bucket.find(m=>!ids.has(m.id));if(!next)continue;selected.push(next);ids.add(next.id);for(const key of diversity(next))senders.set(key,(senders.get(key)||0)+1);
 }
 return selected.map(m=>m.id);
}
