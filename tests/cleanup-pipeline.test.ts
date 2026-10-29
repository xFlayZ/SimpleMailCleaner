import {describe,it,expect} from 'vitest';
import {localDecision,planPipeline,constrainDecision,criteriaFingerprint} from '../src/lib/cleanup-pipeline';
import {cleanupConfigSchema,reviewFilterSchema,type IndexedMessage} from '../src/lib/review-types';
import {parseGroupResults,estimateGroups,groupRequestBody} from '../src/lib/group-ai';
import {buildMessageWhere,csvCell} from '../src/lib/message-query';
const now=Date.parse('2026-10-28T12:00:00Z'),config=cleanupConfigSchema.parse({method:'worker'});
const mail=(patch:Partial<IndexedMessage>={}):IndexedMessage=>({id:'a',account_id:'account-a',sender:'updates@example.invalid',subject:'Weekly digest 123',received_at:'2025-01-01',size:1,is_read:true,flagged:false,has_attachments:false,protected:false,list_id:null,newsletter_signal:false,category:'unclassified',recommendation:'review',reason:'',version:1,state:'active',...patch});
describe('three-stage cleanup',()=>{
 it.each([{flagged:true},{has_attachments:true},{protected:true},{subject:'Rechnung 123'},{subject:'Re: Wochenbericht'},{subject:'OTP login code'},{is_read:false},{received_at:'2026-10-27'}])('keeps protected or excluded messages: %j',patch=>expect(localDecision(mail(patch),config,new Set(),10,now)?.action).toBe('keep'));
 it('uses explicit protection lists and exclusion terms',()=>{
  expect(localDecision(mail(),config,new Set(['updates@example.invalid']),10,now)?.action).toBe('keep');
  expect(localDecision(mail(),{...config,excludeTerms:['digest']},new Set(),10,now)?.action).toBe('keep');
 });
 it('does not treat recurrence alone as permission to trash',()=>expect(localDecision(mail(),config,new Set(),12000,now)).toBeNull());
 it('recognizes list headers without downloading bodies',()=>expect(localDecision(mail({newsletter_signal:true}),config,new Set(),1,now)?.action).toBe('trash'));
 it('requires both selected category and high confidence',()=>{
  const d={category:'promotion',action:'trash' as const,reason:'Werbung',confidence:'medium' as const};
  expect(constrainDecision(d,config).action).toBe('review');
  expect(constrainDecision({...d,confidence:'high'}, {...config,promotions:false}).action).toBe('review');
 });
 it('reduces 12000 recurring subjects to one compact pattern',()=>{
  const result=planPipeline(Array.from({length:12000},(_,i)=>mail({id:String(i),subject:`Weekly digest ${i}`})),config,new Set(),now);
  expect(result.groups).toHaveLength(1);expect(result.groups[0].samples).toHaveLength(3);
  expect(JSON.stringify(groupRequestBody(result.groups,config)).length).toBeLessThan(2500);
  const estimate=estimateGroups(result.groups,config,{id:'fixture',name:'fixture',context_length:32000,pricing:{prompt:'0.0000001',completion:'0.0000004'}});
  expect(estimate.requests).toBe(1);expect(estimate.high).toBeLessThan(.01);
 });
 it('keeps different senders, accounts and subject patterns apart',()=>expect(planPipeline([mail(),mail({id:'b',account_id:'b'}),mail({id:'c',sender:'other@example.invalid'}),mail({id:'d',subject:'Your status'})],config,new Set(),now).groups).toHaveLength(4));
 it('invalidates cached criteria when categories or exclusion terms change',()=>expect(criteriaFingerprint(config)).not.toBe(criteriaFingerprint({...config,newsletters:false})));
 it('validates complete unique response references, regardless of ordering',()=>{
  expect(parseGroupResults({items:[[1,'unclear','review','low','Offen'],[0,'newsletter','trash','high','Werbung']]},2)[0].action).toBe('trash');
  expect(()=>parseGroupResults({items:[[0,'newsletter','trash','high','Werbung'],[0,'unclear','review','low','Offen']]},2)).toThrow();
  expect(()=>parseGroupResults({items:[[0,'newsletter','trash','high','Werbung']]},2)).toThrow();
 });
 it('parameterizes hostile filter values and validates dates',()=>{
  const query=buildMessageWhere(reviewFilterSchema.parse({q:"' OR true --"}));expect(query.sql).not.toContain("' OR true");expect(query.values).toContain("' OR true --");
  expect(()=>reviewFilterSchema.parse({dateFrom:'2026-99-99'})).toThrow();
 });
 it.each(['=SUM(A1)',' +cmd','@formula','-1'])('neutralizes CSV formula prefix %s',v=>expect(csvCell(v)).toMatch(/^"'/));
});
