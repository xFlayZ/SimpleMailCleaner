import type { Model } from './ai';
export type ScanMode='metadata'|'ai_headers'|'ai';
export const HEADER_BATCH_SIZE=20;
export const scanModeNames:Record<ScanMode,string>={metadata:'Lokale Übersicht ohne KI',ai_headers:'KI-Schnellanalyse: Betreff & Absender',ai:'Separater KI-Inhaltsscan'};
export type ScanEstimate={mode:ScanMode;model:string;requested:number;estimatedMessages:number;knownMessages:number;skipped:number;calls:number;low:number;high:number;reservation:number;scanBudget:number;monthlyBudget:number;availableBudget:number;priceAt:string;basis:string};
/** Planning range, not a tokenizer or an invoice. Reservation is shown separately. */
export function estimateScanCost(model:Model,count:number,mode:ScanMode,metadataBytes=400) {
 if(mode==='metadata'||count===0)return {calls:0,low:0,high:0,reservation:0};
 const calls=mode==='ai_headers'?Math.ceil(count/HEADER_BATCH_SIZE):count;
 const inputLow=mode==='ai_headers'?count*Math.ceil(metadataBytes/4)+calls*300:count*1000;
 const inputHigh=mode==='ai_headers'?count*Math.ceil(metadataBytes/2)+calls*500:count*5000;
 const outputLow=count*(mode==='ai_headers'?65:120),outputHigh=count*(mode==='ai_headers'?120:350);
 const price=(input:number,output:number)=>input*Number(model.pricing.prompt)+output*Number(model.pricing.completion)+calls*Number(model.pricing.request||0);
 const reserveInput=mode==='ai_headers'?count*Math.max(metadataBytes,1600)+calls*2500:count*52000;
 const reserveOutput=mode==='ai_headers'?count*160+calls*200:count*700;
 return {calls,low:price(inputLow,outputLow),high:price(inputHigh,outputHigh),reservation:price(reserveInput,reserveOutput)*1.25};
}
