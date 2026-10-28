export type PolicyMessage={sender:string;subject:string;flagged:boolean;has_attachments:boolean;protected?:boolean};
export function protectionReasons(message:PolicyMessage,senders:Set<string>=new Set()) {
 const reasons:string[]=[];
 if(message.protected||senders.has(message.sender.toLowerCase()))reasons.push('Vom Nutzer geschützt');
 if(message.flagged)reasons.push('Markierte oder wichtige Nachricht');
 if(message.has_attachments)reasons.push('Enthält Anhänge');
 if(/\b(rechnung|invoice|vertrag|contract|zahlung|payment|bestellung|order|quittung|receipt|passwort|password|security|sicherheit|verification|verifizierung|mahnung|steuer|tax|kündigung|kuendigung)\b/i.test(message.subject))reasons.push('Mögliche Rechnung, Vertrags- oder Sicherheitsinformation');
 return reasons;
}
export function initialCategory(listId:string|null,subject:string) {
 if(/rechnung|invoice|vertrag|contract|zahlung|receipt|bestellung/i.test(subject))return 'important';
 return listId?'newsletter':'unclassified';
}
