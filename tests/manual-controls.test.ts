import {describe,it,expect} from 'vitest';
import {protectionReasons} from '../src/lib/policy';
import {cleanupConfigSchema} from '../src/lib/review-types';
import {planPipeline,criteriaFingerprint} from '../src/lib/cleanup-pipeline';
import {groupPrompts,estimateGroups} from '../src/lib/group-ai';
const config=cleanupConfigSchema.parse({method:'worker'});
const message={id:'m',account_id:'a',sender:'shop@example.invalid',subject:'10% Rabatt auf Bestellung',received_at:'2024-01-01',size:1,is_read:true,flagged:true,has_attachments:true,protected:true,list_id:null,newsletter_signal:false,category:'important',recommendation:'keep',reason:'',version:1,state:'active'};
describe('manual controls and instructions',()=>{
 it('requires a deliberate per-message exception to bypass protection',()=>{
  expect(protectionReasons(message,new Set([message.sender])).length).toBeGreaterThan(0);
  expect(protectionReasons({...message,protection_override:true},new Set([message.sender]))).toEqual([]);
  expect(protectionReasons({...message,protection_override:false},new Set([message.sender])).length).toBeGreaterThan(0);
 });
 it('includes the instruction in cache identity and the separate user message',()=>{
  const custom={...config,userInstruction:'10% Rabatt als Werbung und Vorschlag bewerten.'};
  expect(criteriaFingerprint(custom)).not.toBe(criteriaFingerprint(config));
  const plan=planPipeline([{...message,protection_override:true}],custom,new Set());expect(plan.groups).toHaveLength(1);
  expect(groupPrompts(plan.groups,custom)[1].content).toContain(custom.userInstruction);
 });
 it('routes locally obvious advertising to AI when a custom instruction is present',()=>{
  const m={...message,subject:'10% Rabatt',category:'promotion',protected:false,flagged:false,has_attachments:false};
  expect(planPipeline([m],config,new Set()).stats.localTrash).toBe(1);
  expect(planPipeline([m],{...config,userInstruction:'Diese Angebote prüfen.'},new Set()).groups).toHaveLength(1);
 });
 it('does not let an instruction silently lift protection or ignore selected age and unread criteria',()=>{
  const custom={...config,userInstruction:'Alles als Werbung bewerten.'};
  expect(planPipeline([message],custom,new Set()).groups).toHaveLength(0);
  expect(planPipeline([{...message,protection_override:true,is_read:false}],custom,new Set()).groups).toHaveLength(0);
 });
 it('accounts for instruction tokens in the estimate',()=>{
  const plan=planPipeline([{...message,protection_override:true}],{...config,userInstruction:'Prüfen'},new Set());
  const model={id:'fixture',name:'fixture',context_length:32000,pricing:{prompt:'0.000001',completion:'0.000001'}};
  expect(estimateGroups(plan.groups,{...config,userInstruction:'Zusatzanweisung '.repeat(80)},model).high).toBeGreaterThan(estimateGroups(plan.groups,config,model).high);
  expect(()=>cleanupConfigSchema.parse({userInstruction:'x'.repeat(2001)})).toThrow();
 });
});
