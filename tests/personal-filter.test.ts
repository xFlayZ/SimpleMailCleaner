import {describe,it,expect} from 'vitest';
import {personalConfig,personalDecision,trainingSelection,type PersonalRule} from '../src/lib/personal-filter';
import {planPipeline} from '../src/lib/cleanup-pipeline';
import {cleanupConfigSchema,type IndexedMessage} from '../src/lib/review-types';
const message=(patch:Partial<IndexedMessage>={}):IndexedMessage=>({id:'1',account_id:'a',sender:'shop@example.com',subject:'Rabatt diese Woche',category:'promotion',recommendation:'review',received_at:'2024-01-01',is_read:true,flagged:false,protected:false,has_attachments:false,size:1,list_id:null,newsletter_signal:false,reason:'',version:1,state:'active',...patch});
const rule=(patch:Partial<PersonalRule>={}):PersonalRule=>({id:'r',account_id:'a',name:'Rabatte',enabled:true,priority:10,config:personalConfig.parse({sender:'shop@example.com',category:'promotion',terms:['rabatt'],decision:'remove'}),...patch});
describe('personal classification safeguards',()=>{
 it('classifies matching advertising locally before AI',()=>{const p=planPipeline([message()],cleanupConfigSchema.parse({method:'worker',minAgeDays:0}),new Set(),Date.now(),[rule()]);expect(p.groups).toHaveLength(0);expect(p.local[0].decision.action).toBe('trash');});
 it.each([{subject:'Rechnung Rabatt'},{has_attachments:true},{flagged:true},{protected:true}])('preserves protective signals %j',patch=>expect(personalDecision(message(patch),[rule()],new Set())).toBeNull());
 it('does not generalize a sender alone',()=>expect(personalDecision(message({subject:'Liefertermin',category:'notification'}),[rule()],new Set())).toBeNull());
 it('ignores disabled and other-account rules',()=>{expect(personalDecision(message(),[rule({enabled:false})],new Set())).toBeNull();expect(personalDecision(message(),[rule({account_id:'b'})],new Set())).toBeNull();});
 it('sends contradictory matches to review',()=>expect(personalDecision(message(),[rule(),rule({id:'second',config:{...rule().config,decision:'keep'}})],new Set())?.action).toBe('review'));
 it('honors explicit exceptions',()=>expect(personalDecision(message({subject:'Rabatt Versandbestätigung'}),[rule({config:{...rule().config,exceptions:['versand']}})],new Set())).toBeNull());
 it('represents archiving as a review recommendation',()=>expect(personalDecision(message(),[rule({config:{...rule().config,decision:'archive'}})],new Set())?.action).toBe('review'));
 it('preserves exclusion criteria over personal rules',()=>expect(planPipeline([message()],cleanupConfigSchema.parse({excludeTerms:['rabatt']}),new Set(),Date.now(),[rule()]).local[0].decision.action).toBe('keep'));
 it('mixes decision groups and senders without duplicates',()=>{const ids=trainingSelection(Array.from({length:30},(_,i)=>message({id:String(i),sender:`${i%5}@example.com`,recommendation:['review','keep','trash'][i%3]})),20);expect(new Set(ids).size).toBe(20);expect(ids.length).toBe(20);});
});
