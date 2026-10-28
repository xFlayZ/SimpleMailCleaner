export const providerNames:Record<string,string>={gmail:'Gmail',outlook:'Outlook',tonline:'T-Online',yahoo:'Yahoo',proton:'Proton Mail'};
export const categoryNames:Record<string,string>={newsletter:'Newsletter',promotion:'Werbung',notification:'Benachrichtigung',personal:'Persönlich',important:'Wichtige Unterlagen',security:'Sicherheit',unclear:'Unklar',unclassified:'Ungeprüft'};
export const statusNames:Record<string,string>={queued:'In Warteschlange',running:'Scan läuft',completed:'Abgeschlossen',failed:'Fehlgeschlagen',proposed:'Prüfung offen',approved:'Freigegeben',executing:'Wird ausgeführt',succeeded:'Erfolgreich',partial:'Teilweise erfolgreich',unknown:'Ergebnis unklar',cancelled:'Abgebrochen',pending:'Ausstehend',interrupted:'Unterbrochen'};
const senders=[['Studio Notes','hello@studionotes.example','newsletter','Design-Inspiration für deine Woche'],['Nordlicht Shop','angebote@nordlicht.example','promotion','Dein Wochenende, unsere Lieblingsstücke'],['The Daily Read','news@dailyread.example','newsletter','Die Geschichten hinter den Schlagzeilen'],['Cloudspace','updates@cloudspace.example','notification','Dein wöchentlicher Aktivitätsbericht'],['Reisezeit','inspiration@reisezeit.example','newsletter','Ein kleiner Ausflug aus dem Alltag'],['Nordlicht Shop','rechnung@nordlicht.example','important','Rechnung zu deiner Bestellung']];
export const demoData={
 accounts:[{id:'demo-account',provider:'gmail',email:'alex.beispiel@gmail.com',status:'connected',last_scan_at:new Date().toISOString()}],
 messages:Array.from({length:48},(_,i)=>{const s=senders[i%senders.length];return {id:`demo-${i}`,account_id:'demo-account',sender:s[1],subject:s[3],received_at:new Date(Date.now()-(i+4)*86400000).toISOString(),size:28000+i*1400,is_read:i%3!==0,flagged:i%6===5,has_attachments:i%6===5,list_id:i%6===5?null:s[1],category:s[2],recommendation:i%6===5?'keep':i%4===0?'review':'trash',reason:i%6===5?'Rechnung mit Anhang – zur Aufbewahrung empfohlen.':'Wiederkehrender Inhalt ohne erkennbaren persönlichen Handlungsbedarf. Vor dem Verschieben prüfen.',protected:i%6===5,state:'active',version:1,analyzed_at:new Date().toISOString(),unsubscribe_verified:i%6!==5,unsubscribe_status:'none'};}),
 scans:[],plans:[],events:[{id:'demo-event',kind:'scan',summary:'Beispielanalyse abgeschlossen. Diese Daten sind fiktiv.',created_at:new Date().toISOString()}],
 settings:{model:'',has_key:false,key_version:1,ai_consent:false,scan_budget:1,monthly_budget:10},rules:[] as string[],usage:{cost:0,estimated:0},devices:[],configured:{google:false,microsoft:false},writesPaused:false
};
export type DashboardData={
 accounts:{id:string;provider:string;email:string;status:string;last_scan_at:string|null}[];
 messages:(typeof demoData.messages[number]&{analysis_mode?:string;header_analysis?:{reason:string}|null;content_analysis?:{reason:string}|null})[];
 scans:{id:string;account_id:string;mode:string;status:string;processed:number;total:number;skipped?:number;error?:string;created_at:string}[];
 plans:{id:string;kind:string;status:string;count:number;created_at:string}[];
 events:{id:string;kind:string;summary:string;created_at:string}[];
 settings:typeof demoData.settings;rules:string[];usage:{cost:number;estimated:number};
 devices:{account_id:string;last_seen:string|null}[];configured:{google:boolean;microsoft:boolean};writesPaused:boolean;
};
