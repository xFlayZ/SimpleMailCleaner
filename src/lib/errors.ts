export class AppError extends Error {
 constructor(public status: number, message: string) { super(message); }
}
export function requireValue<T>(value: T | undefined | null, message='Nicht gefunden.'): T {
 if (value===null || value===undefined) throw new AppError(404,message);
 return value;
}
export function publicError(error: unknown) {
 if(error instanceof AppError) return error.message;
 const {code,name}=errorDiagnostic(error);
 if(['EACCES','EPERM'].includes(code||''))return 'Lokale Zugriffsberechtigung blockiert die Verbindung. Worker außerhalb der eingeschränkten Umgebung starten.';
 if(['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT'].includes(code||'')||['TimeoutError','AbortError'].includes(name))return 'Zeitüberschreitung beim Verbindungsaufbau oder Anbieterabruf. Später erneut versuchen.';
 if(['ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','UND_ERR_SOCKET'].includes(code||''))return `Netzwerkverbindung fehlgeschlagen (${code}). Erreichbarkeit, DNS und Worker-Verbindung prüfen.`;
 if(['42P01','42703'].includes(code||''))return 'Datenbankschema ist nicht aktuell. Datenbankmigrationen ausführen und Web/Worker neu starten.';
 if(['28P01','42501'].includes(code||''))return 'Datenbankzugang oder Datenbankberechtigung fehlt. Serverkonfiguration prüfen.';
 if(error instanceof SyntaxError)return 'Anbieter- oder Datenantwort konnte nicht gelesen werden. Vorgang erneut prüfen.';
 return 'Vorgang fehlgeschlagen. Verbindung, Konfiguration und Anbieterstatus prüfen.';
}
/** Diagnostic fields only: never serialize error messages, URLs, headers or credentials. */
export function errorDiagnostic(error:unknown):{name:string;code?:string;status?:number}{
 const e=error as {name?:unknown;code?:unknown;status?:unknown;cause?:{code?:unknown}}|null;
 const raw=e?.cause?.code||e?.code;
 return {name:typeof e?.name==='string'&&/^[a-zA-Z]+Error$/.test(e.name)?e.name:'Error',code:typeof raw==='string'&&/^[a-zA-Z0-9_]{2,60}$/.test(raw)?raw:undefined,status:typeof e?.status==='number'?e.status:undefined};
}
