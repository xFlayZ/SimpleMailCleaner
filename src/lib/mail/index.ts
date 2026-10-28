import { decrypt } from '../crypto';
import { GmailAdapter } from './gmail';
import { OutlookAdapter } from './outlook';
import { ImapAdapter } from './imap';
import { accessToken } from './oauth';
import { ProtonAdapter } from '../connector';
import type { Account,MailAdapter } from './types';
export async function adapter(account:Account):Promise<MailAdapter> {
 if(account.provider==='gmail')return new GmailAdapter(await accessToken(account));
 if(account.provider==='outlook')return new OutlookAdapter(await accessToken(account));
 if(account.provider==='proton')return new ProtonAdapter(account);
 const secret=decrypt<{password:string}>(account.secret!,account.user_id);
 return new ImapAdapter({host:account.provider==='tonline'?'secureimap.t-online.de':'imap.mail.yahoo.com',port:993,secure:true,user:account.email,password:secret.password}).connect();
}
