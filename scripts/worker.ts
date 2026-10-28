import { workOnce,recoverStaleJobs } from '../src/lib/jobs';
import { pool } from '../src/lib/db';
let stop=false;process.on('SIGINT',()=>{stop=true;});process.on('SIGTERM',()=>{stop=true;});
console.log('SimpleMailCleaner Worker gestartet.');
let maintenance=0;
while(!stop) {
 try {
  if(Date.now()-maintenance>60000){await recoverStaleJobs();maintenance=Date.now();}
  if(!await workOnce())await new Promise(resolve=>setTimeout(resolve,1500));
 }catch{console.error('Worker: Datenbank nicht erreichbar oder Auftrag fehlgeschlagen; erneuter Verbindungsversuch.');await new Promise(resolve=>setTimeout(resolve,5000));}
}
await pool.end();
