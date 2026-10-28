declare module 'mailauth/lib/dkim/verify.js' {
 export function dkimVerify(raw:Buffer,options?:Record<string,unknown>):Promise<{
  results:{status:{result:string;aligned?:string|false};signingHeaders:{keys:string;headers:string[]};signatureTimeValid:boolean;algo:string;signingDomain:string}[]
 }>;
}
