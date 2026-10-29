import { simpleParser } from 'mailparser';
export const MAX_RAW=2_000_000;
export async function parseContent(raw:Buffer) {
 if(raw.length>MAX_RAW)throw new Error('Nachricht zu groß für Inhaltsanalyse.');
 const parsed=await simpleParser(raw,{skipHtmlToText:false,skipTextToHtml:true,skipImageLinks:true,maxHtmlLengthToParse:MAX_RAW});
 return {raw,text:(parsed.text||'').slice(0,12000)};
}
export function headerMap(headers: {name:string;value:string}[]) {
 return Object.fromEntries(headers.map(h=>[h.name.toLowerCase(),h.value]));
}
export function newsletterHeaderSignal(headers:Record<string,string>) {
 return Boolean(headers['list-id']||headers['list-unsubscribe']||/^(bulk|list)$/i.test(headers.precedence||''));
}
export function senderAddress(value:string) {
 return (value.match(/<([^<>]+)>/)?.[1] || value).trim().toLowerCase().slice(0,320);
}
