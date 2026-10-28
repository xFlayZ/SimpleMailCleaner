import { readFile } from 'node:fs/promises';
export const dynamic='force-static';
export default async function Guide(){
 const source=await readFile('docs/EINRICHTUNG.md','utf8');
 const sections=source.replace(/^# .+\r?\n/,'').split(/(?=^## )/m);
 return <div className="guide-page"><a href="/">← Zum Dashboard</a><h1>Einrichtung & Anbieterzugänge</h1><p>Die vollständige Anleitung gehört zum Projekt und enthält alle manuellen Schritte.</p>{sections.map((section,index)=>{
  const [heading,...lines]=section.split('\n');
  if(!heading.startsWith('## '))return <pre key={index}>{section}</pre>;
  const title=heading.slice(3),id=title.includes('Proton')?'proton':`schritt-${index}`;
  return <section id={id} key={index}><h2>{title}</h2><pre>{lines.join('\n')}</pre></section>;
 })}</div>;
}
