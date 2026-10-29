import {personalDecision,type PersonalRule} from './personal-filter';
import {digest} from './crypto';
import {protectionReasons} from './policy';
import type {CleanupConfig,Decision,IndexedMessage,PatternGroup,PipelineStats} from './review-types';

const promotionPattern=/\b(newsletter|angebot(?:e)?|rabatt|sale|deal(?:s)?|gutschein|coupon|black friday|aktion|wochenangebot|sparen|discount|limited offer|% off|neue kollektion|new collection)\b/i;
const personalReply=/^(?:(?:re|aw|antwort|fw|fwd|wg)\s*:\s*)/i;
const securityPattern=/\b(2fa|otp|einmalcode|anmeldecode|verification code|login code|sign[ -]?in|anmeldung|passwort|password|security alert)\b/i;
const includes=(value:string,terms:string[])=>terms.some(term=>value.toLocaleLowerCase('de').includes(term.trim().toLocaleLowerCase('de')));
export function subjectPattern(subject:string) {
 return subject.normalize('NFKC').toLowerCase().replace(/https?:\/\/\S+/g,'[link]')
  .replace(/\b\d{1,4}[-./:]\d{1,2}(?:[-./:]\d{1,4})?\b/g,'[datum]')
  .replace(/\b[a-f0-9]{12,}\b/gi,'[id]').replace(/\d+/g,'#').replace(/\s+/g,' ').trim().slice(0,300);
}
export function detectedCategory(message:IndexedMessage,repeatCount:number,minGroupSize:number) {
 if(message.list_id||message.newsletter_signal)return 'newsletter';
 if(promotionPattern.test(message.subject)&&repeatCount>=minGroupSize)return 'newsletter';
 if(promotionPattern.test(message.subject))return 'promotion';
 return message.category==='unclassified'?'unclear':message.category;
}
export function criteriaKeepDecision(message:IndexedMessage,config:CleanupConfig,repeatCount=1,now=Date.now()):Decision|null {
 const category=detectedCategory(message,repeatCount,config.minGroupSize),keep=(reason:string):Decision=>({category,action:'keep',reason,confidence:'high'});
 if(config.excludeTerms.length&&includes(`${message.sender} ${message.subject}`,config.excludeTerms))return keep('Trifft auf einen ausgeschlossenen Begriff zu.');
 if(!config.includeUnread&&!message.is_read)return keep('Ungelesene Nachricht gemäß Auswahl behalten.');
 const age=Math.max(0,(now-new Date(message.received_at).getTime())/86400000);
 if(age<config.minAgeDays)return keep(`Jünger als die eingestellten ${config.minAgeDays} Tage.`);
 if(config.includeTerms.length&&!includes(`${message.sender} ${message.subject}`,config.includeTerms))return keep('Keiner der gewünschten Begriffe trifft zu.');
 return null;
}
export function protectionKeepDecision(message:IndexedMessage,config:CleanupConfig,protectedSenders:Set<string>,repeatCount=1):Decision|null {
 const category=detectedCategory(message,repeatCount,config.minGroupSize),keep=(reason:string):Decision=>({category,action:'keep',reason,confidence:'high'});
 const reasons=protectionReasons(message,protectedSenders);
 if(reasons.length)return keep(reasons.join('; '));
 if(!message.protection_override&&['important','personal','security'].includes(message.category))return {...keep('Wichtige, persönliche oder sicherheitsbezogene Kategorie geschützt.'),category:message.category};
 if(!message.protection_override&&securityPattern.test(message.subject))return {...keep('Sicherheits- oder Zugangsinformation geschützt.'),category:'security'};
 if(!message.protection_override&&personalReply.test(message.subject))return {...keep('Antwort oder weitergeleitete Konversation geschützt.'),category:'personal'};
 return null;
}
export function hardKeepDecision(message:IndexedMessage,config:CleanupConfig,protectedSenders:Set<string>,repeatCount=1,now=Date.now()):Decision|null {
 return criteriaKeepDecision(message,config,repeatCount,now)||protectionKeepDecision(message,config,protectedSenders,repeatCount);
}
export function localDecision(message:IndexedMessage,config:CleanupConfig,protectedSenders:Set<string>,repeatCount:number,now=Date.now()):Decision|null {
 const category=detectedCategory(message,repeatCount,config.minGroupSize);
 const hard=hardKeepDecision(message,config,protectedSenders,repeatCount,now);if(hard)return hard;
 if(config.userInstruction&&config.method!=='local')return null;
 const newsletter=Boolean(message.list_id||message.newsletter_signal||(promotionPattern.test(message.subject)&&repeatCount>=config.minGroupSize));
 if(newsletter&&config.newsletters)return {category:'newsletter',action:'trash',reason:'Listen-/Werbemerkmale und Alter entsprechen deinen bestätigten Kriterien.',confidence:'high'};
 if(promotionPattern.test(message.subject)&&config.promotions)return {category:'promotion',action:'trash',reason:'Werbebetreff und Alter entsprechen deinen bestätigten Kriterien.',confidence:'high'};
 if(config.notifications&&message.category==='notification')return {category:'notification',action:'trash',reason:'Bekannte Benachrichtigung entspricht deinen bestätigten Kriterien.',confidence:'high'};
 return null;
}
export function constrainDecision(decision:Decision,config:CleanupConfig):Decision {
 if(['important','personal','security'].includes(decision.category))return {...decision,action:'keep'};
 const allowed=decision.category==='newsletter'?config.newsletters:decision.category==='promotion'?config.promotions:decision.category==='notification'?config.notifications:false;
 if(decision.action==='trash'&&(!allowed||decision.confidence!=='high'))return {...decision,action:'review',reason:allowed?'KI-Zuordnung nicht eindeutig; Einzelprüfung empfohlen.':'Kategorie ist nicht für Aufräumvorschläge freigegeben.'};
 return decision;
}
export function criteriaFingerprint(config:CleanupConfig) {
 return digest(JSON.stringify({v:4,analysisMode:config.analysisMode,userInstruction:config.userInstruction||'',minAgeDays:config.minAgeDays,includeUnread:config.includeUnread,newsletters:config.newsletters,promotions:config.promotions,notifications:config.notifications,includeTerms:[...config.includeTerms].sort(),excludeTerms:[...config.excludeTerms].sort()}));
}
export function planPipeline(messages:IndexedMessage[],config:CleanupConfig,protectedSenders:Set<string>,now=Date.now(),personalRules:PersonalRule[]=[]) {
 const counts=new Map<string,number>();for(const m of messages)counts.set(m.sender,(counts.get(m.sender)||0)+1);
 const local:{message:IndexedMessage;decision:Decision}[]=[],groups=new Map<string,PatternGroup>();
 for(const message of messages) {
  const repeatCount=counts.get(message.sender)||1,criteria=criteriaKeepDecision(message,config,repeatCount,now);
  if(criteria){local.push({message,decision:criteria});continue;}
  const protectedDecision=protectionKeepDecision(message,config,protectedSenders,repeatCount),personal=personalDecision(message,personalRules,protectedSenders,now);
  if(config.analysisMode==='grouped'){
   const base=localDecision(message,config,protectedSenders,repeatCount,now),decision=base?.action==='keep'?base:personal||base;
   if(decision){local.push({message,decision});continue;}
  }else if(personal){local.push({message,decision:personal});continue;}
  const base=protectedDecision||localDecision(message,config,protectedSenders,repeatCount,now);
  const pattern=subjectPattern(message.subject);
  const groupByPattern=config.analysisMode!=='full_ai'&&config.groupPatterns;
  const localKey=config.analysisMode==='hybrid'?JSON.stringify(base||{action:'review',reason:'Kein eindeutiger lokaler Treffer.'}):'';
  const key=groupByPattern?`${message.account_id}|${message.sender}|${message.list_id||''}|${pattern}|${localKey}`:message.id;
  const group=groups.get(key)||{id:digest(key).slice(0,24),sender:message.sender,pattern,members:[],samples:[],newsletter:Boolean(message.list_id||message.newsletter_signal),fingerprint:'',localDecision:config.analysisMode==='hybrid'?base||{category:message.category,action:'review',confidence:'low',reason:'Kein eindeutiger lokaler Treffer; manuelle Prüfung empfohlen.'}:null};
  group.members.push(message);groups.set(key,group);
 }
 const pending=[...groups.values()];
 for(const group of pending){
  const unique=[...new Set(group.members.map(m=>m.subject.slice(0,180)))].sort();
  group.samples=unique.length<=3?unique:[unique[0],unique[Math.floor(unique.length/2)],unique[unique.length-1]];
  group.fingerprint=digest(JSON.stringify({v:3,sender:group.sender,pattern:group.pattern,samples:group.samples,newsletter:group.newsletter,localDecision:group.localDecision,criteria:criteriaFingerprint(config)}));
 }
 const stats:PipelineStats={total:messages.length,protected:local.filter(l=>l.decision.action==='keep').length,localDecisions:local.length,localTrash:local.filter(l=>l.decision.action==='trash').length,groups:pending.length,aiGroups:config.method==='local'?0:pending.length,cachedGroups:0,aiMessages:config.method==='local'?0:pending.reduce((sum,g)=>sum+g.members.length,0),requests:config.method==='local'?0:Math.ceil(pending.length/config.groupsPerRequest)};
 return {local,groups:pending,stats};
}
export function compactGroupInput(groups:PatternGroup[],now=Date.now()) {
 return groups.map((g,i)=>({i,f:g.sender.slice(0,320),s:g.samples,n:g.members.length,l:g.newsletter,a:[Math.floor(Math.min(...g.members.map(m=>Math.max(0,(now-new Date(m.received_at).getTime())/86400000)))),Math.floor(Math.max(...g.members.map(m=>Math.max(0,(now-new Date(m.received_at).getTime())/86400000))))],...(g.localDecision?{d:{category:g.localDecision.category,action:g.localDecision.action,reason:g.localDecision.reason}}:{})}));
}
