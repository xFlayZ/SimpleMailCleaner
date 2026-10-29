'use client';
import {useEffect,useId,useRef} from 'react';
import {X,ChevronLeft,ChevronRight,ChevronsLeft,ChevronsRight} from 'lucide-react';
export async function request<T=Record<string,unknown>>(path:string,data?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch(`/api/${path}`,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),signal});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Anfrage fehlgeschlagen.');return result;
}
export const usd=(value:number)=>Number.isFinite(value)?new Intl.NumberFormat('de-DE',{style:'currency',currency:'USD',maximumFractionDigits:4}).format(value):'–';
export const number=(value:number)=>new Intl.NumberFormat('de-DE').format(value);
export const shortDate=(value:string|Date)=>new Date(value).toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'});
export function Sheet({title,description,onClose,children,wide=false}:{title:string;description?:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}){
 const ref=useRef<HTMLDialogElement>(null),id=useId();
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 return <dialog ref={ref} className={`sheet ${wide?'sheet-wide':''}`} aria-labelledby={id} onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}><div className="sheet-header"><div><h2 id={id}>{title}</h2>{description&&<p>{description}</p>}</div><button type="button" className="icon-button" aria-label="Schließen" onClick={onClose}><X size={20}/></button></div>{children}</dialog>;
}
export function DialogFrame({onClose,children,wide=false}:{onClose:()=>void;children:React.ReactNode;wide?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 return <dialog ref={ref} className={`modal ${wide?'wide':''}`} aria-labelledby="modal-title" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===ref.current)onClose();}}>{children}</dialog>;
}
export function Pager({page,pages,total,pageSize,onPage,onPageSize,fixedPageSize=false}:{page:number;pages:number;total:number;pageSize:number;onPage:(p:number)=>void;onPageSize:(n:number)=>void;fixedPageSize?:boolean}){
 return <div className="pager"><span>{total?number((page-1)*pageSize+1):0}–{number(Math.min(page*pageSize,total))} von {number(total)}</span>{fixedPageSize?<span>{pageSize} pro Seite</span>:<label>Pro Seite<select value={pageSize} onChange={e=>onPageSize(Number(e.target.value))}>{[25,50,100].map(n=><option key={n}>{n}</option>)}</select></label>}<div><button className="icon-button" aria-label="Erste Seite" disabled={page<=1} onClick={()=>onPage(1)}><ChevronsLeft size={17}/></button><button className="icon-button" aria-label="Vorherige Seite" disabled={page<=1} onClick={()=>onPage(page-1)}><ChevronLeft size={17}/></button><strong>{page} / {pages}</strong><button className="icon-button" aria-label="Nächste Seite" disabled={page>=pages} onClick={()=>onPage(page+1)}><ChevronRight size={17}/></button><button className="icon-button" aria-label="Letzte Seite" disabled={page>=pages} onClick={()=>onPage(pages)}><ChevronsRight size={17}/></button></div></div>;
}
