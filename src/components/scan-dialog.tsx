'use client';
import {useEffect,useState} from 'react';
import {Sparkles,Loader2,ShieldCheck,FileText,Mail,Inbox} from 'lucide-react';
import type {DashboardData} from '@/lib/demo';
import {scanModeNames,type ScanMode,type ScanEstimate} from '@/lib/scan-cost';
const money=(value:number)=>new Intl.NumberFormat('de-DE',{style:'currency',currency:'USD',maximumFractionDigits:4}).format(value);
export default function ScanDialog({data,initialAccountId,onStarted,onSettings}:{data:DashboardData;initialAccountId:string;onStarted:()=>Promise<void>;onSettings:()=>void}) {
 const [accountId,setAccountId]=useState(initialAccountId||data.accounts[0]?.id||'');
 const [mode,setMode]=useState<ScanMode>('metadata'),[days,setDays]=useState(90),[max,setMax]=useState(100);
 const [allDays,setAllDays]=useState(false),[allMessages,setAllMessages]=useState(false);
 const [consent,setConsent]=useState(false),[estimate,setEstimate]=useState<ScanEstimate|null>(null),[estimating,setEstimating]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const configured=data.settings.has_key&&data.settings.ai_consent&&Boolean(data.settings.model);
 useEffect(()=>{
  setEstimate(null);setError('');setEstimating(false);
  if(mode==='metadata'||!configured||!accountId||days<1||max<1)return;
  const controller=new AbortController();setEstimating(true);
  const timer=setTimeout(()=>{void fetch('/api/scans/estimate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId,mode,days,max}),signal:controller.signal}).then(async response=>{
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Kostenschätzung fehlgeschlagen.');
   if(!controller.signal.aborted)setEstimate(result);
  }).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setEstimating(false);});},350);
  return()=>{clearTimeout(timer);controller.abort();};
 },[accountId,mode,days,max,configured,data.settings.model,data.settings.key_version]);
 const chooseMode=(next:ScanMode)=>{setMode(next);setConsent(false);if(next==='ai')setMax(n=>Math.min(n,500));};
 const start=async()=>{
  setBusy(true);setError('');
  try {
   const response=await fetch('/api/scans',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accountId,mode,days:mode==='metadata'&&allDays?0:days,max:mode==='metadata'&&allMessages?0:max,confirmAi:consent,confirmContent:mode==='ai'&&consent})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'Scan konnte nicht gestartet werden.');await onStarted();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 };
 return <>
  <span className="modal-symbol"><Sparkles size={25}/></span><h2 id="modal-title">Postfach analysieren</h2>
  <p className="modal-description">Importiere zuerst kostenlos die Metadaten. Anschließend kannst du den Bestand mit Filtern, Regeln und gruppierter KI gezielt neu bewerten.</p>
  {error&&<div className="error-banner" role="alert">{error}</div>}
  <form onSubmit={e=>{e.preventDefault();void start();}}>
   <label>Postfach<select value={accountId} onChange={e=>setAccountId(e.target.value)}>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.email}</option>)}</select></label>
   <div className="scan-mode-picker" role="radiogroup" aria-label="Analyseart">
    <button type="button" role="radio" aria-checked={mode==='metadata'} className={mode==='metadata'?'chosen':''} onClick={()=>chooseMode('metadata')}><Inbox size={19}/><span><strong>Lokale Übersicht</strong><small>Empfohlen: kostenlos importieren und danach unter Aufräumen neu bewerten.</small></span><span className="pill neutral">0 USD</span></button>
    <button type="button" role="radio" aria-checked={mode==='ai'} className={mode==='ai'?'chosen':''} onClick={()=>chooseMode('ai')}><FileText size={19}/><span><strong>Separater KI-Inhaltsscan</strong><small>Übermittelt zusätzlich Textausschnitte. Umfangreicher, sensibler und meist teurer. Auf 500 Nachrichten begrenzt.</small></span></button>
   </div>
   <div className="form-grid"><label>Letzte Tage<input type="number" min="1" max="3650" required disabled={mode==='metadata'&&allDays} value={days} onChange={e=>setDays(Number(e.target.value))}/>{mode==='metadata'&&<span className="checkbox-label"><input type="checkbox" checked={allDays} onChange={e=>setAllDays(e.target.checked)}/>Alle Zeiträume</span>}</label><label>Max. Nachrichten<input type="number" min="1" max={mode==='ai'?500:20000} required disabled={mode==='metadata'&&allMessages} value={max} onChange={e=>setMax(Number(e.target.value))}/>{mode==='metadata'&&<span className="checkbox-label"><input type="checkbox" checked={allMessages} onChange={e=>setAllMessages(e.target.checked)}/>Alle Nachrichten</span>}</label></div>
   {mode==='metadata'?<div className="estimate-card"><strong>Keine KI-Kosten: 0 USD</strong><p>Erfasst Absender, Betreff, Datum und lokale Schutzsignale. Es wird keine externe KI-Bewertung erstellt. „Alle“ hebt die jeweilige Begrenzung auf; importiert wird der Posteingang. Große Bestände können länger dauern und lassen sich im Aktivitätsverlauf stoppen.</p></div>:<>
    {!configured?<div className="setup-note">Für KI-Bewertungen zuerst den eigenen OpenRouter-Schlüssel, das Modell und die Einwilligung in den Einstellungen hinterlegen.<button type="button" className="text-button" onClick={onSettings}>KI-Einstellungen öffnen →</button></div>:<div className="estimate-card" aria-live="polite">
     <small>GESCHÄTZTE INFERENZKOSTEN</small>
     {estimating?<p><Loader2 size={14} className="spin"/> Kostenschätzung wird geladen …</p>:estimate?<>
      <strong>{money(estimate.low)} – {money(estimate.high)}</strong>
      <p>{estimate.estimatedMessages.toLocaleString('de-DE')} mögliche KI-Bewertungen · ca. {estimate.calls.toLocaleString('de-DE')} Anfragen · {estimate.model}</p>
      {estimate.skipped>0&&<p>{estimate.skipped.toLocaleString('de-DE')} bereits unverändert bewertete oder geschützte Nachrichten im Index werden übersprungen.</p>}
      <p>{estimate.basis}</p>
      <div className="estimate-budget">Scanbudget {money(estimate.scanBudget)} · Monatsbudget noch {money(estimate.availableBudget)}</div>
      {(estimate.low>estimate.scanBudget||estimate.low>estimate.availableBudget)&&<p className="inline-error">Das Budget liegt unter der Schätzung. Der Scan kann vorzeitig stoppen; es wird nicht automatisch erhöht.</p>}
      <details><summary>Schätzmethode & Sicherheitsreserve</summary><p>Hochrechnung mit aktuellen Modellpreisen, kurzen Antworten und angenommenen Tokenlängen. Inhaltsscans hängen stark von der Textlänge ab.</p><p>Die technische Budgetreservierung ist eine vorsichtige Oberkante, keine erwartete Rechnung. Sie wird je Anfrage geprüft und soweit verfügbar durch den tatsächlichen Verbrauch ersetzt. Gebühren, Steuern und unbekannte Reasoning-Kosten sind nicht verlässlich vorhersagbar. Keine Kostengarantie.</p></details>
     </>:<p>Kostenschätzung nicht verfügbar.</p>}
    </div>}
    <label className="checkbox-label"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>{mode==='ai_headers'?'Ich bestätige die geschätzten Kosten und die Übermittlung von Absender, Betreff und Datum an OpenRouter und den Modellanbieter. Betreffzeilen können vertrauliche Informationen enthalten.':'Ich beauftrage ausdrücklich den separaten Inhaltsscan und bestätige die geschätzten Kosten. Zusätzlich werden entschlüsselte E-Mail-Textausschnitte an OpenRouter und den Modellanbieter übertragen; Anhänge werden nicht analysiert.'}</span></label>
   </>}
   <div className="privacy-inline"><ShieldCheck size={17}/><span>{mode==='ai_headers'?'Eine Bewertung ohne Nachrichtentext ist eine vorläufige Einschätzung. Die KI darf nicht behaupten, den Inhalt geprüft zu haben. Papierkorb-Aktionen brauchen weiterhin eine eigene Freigabe.':'Löschen und Abmelden bleiben getrennte, ausdrücklich freizugebende Aktionen.'}</span></div>
   <button className="primary-button full" disabled={busy||mode!=='metadata'&&(!configured||!estimate||estimating||!consent)}>{busy?<Loader2 size={16} className="spin"/>:<Sparkles size={16}/ >}{scanModeNames[mode]} starten</button>
  </form>
 </>;
}
