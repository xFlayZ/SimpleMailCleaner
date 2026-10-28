export class AppError extends Error {
 constructor(public status: number, message: string) { super(message); }
}
export function requireValue<T>(value: T | undefined | null, message='Nicht gefunden.'): T {
 if (value===null || value===undefined) throw new AppError(404,message);
 return value;
}
export function publicError(error: unknown) {
 if(error instanceof AppError) return error.message;
 return 'Vorgang fehlgeschlagen. Verbindung, Konfiguration und Anbieterstatus prüfen.';
}
