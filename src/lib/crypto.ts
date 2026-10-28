import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac, timingSafeEqual, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
function master() {
 const key = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'base64');
 if (key.length !== 32) throw new Error('ENCRYPTION_KEY muss 32 Bytes enthalten. npm run setup ausführen.');
 return key;
}
export function encrypt(value: unknown, owner: string): string {
 const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm',master(),iv);
 cipher.setAAD(Buffer.from(owner));
 const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
 return [iv,cipher.getAuthTag(),ciphertext].map(x=>x.toString('base64url')).join('.');
}
export function decrypt<T>(value: string, owner: string): T {
 const [iv,tag,data] = value.split('.').map(x=>Buffer.from(x,'base64url'));
 const cipher = createDecipheriv('aes-256-gcm',master(),iv);
 cipher.setAAD(Buffer.from(owner)); cipher.setAuthTag(tag);
 return JSON.parse(Buffer.concat([cipher.update(data),cipher.final()]).toString('utf8')) as T;
}
export async function passwordHash(password: string) {
 const salt = randomBytes(16).toString('hex');
 const key = await derive(password,salt,64) as Buffer;
 return `${salt}:${key.toString('hex')}`;
}
export async function passwordMatches(password: string, saved: string) {
 const [salt,hash] = saved.split(':');
 const key = await derive(password,salt,64) as Buffer;
 const expected = Buffer.from(hash,'hex');
 return key.length===expected.length && timingSafeEqual(key,expected);
}
export function deviceSignature(key: string, value: unknown) {
 return createHmac('sha256',Buffer.from(key,'base64')).update(JSON.stringify(value)).digest('base64url');
}
export function validSignature(key: string, value: unknown, signature: string) {
 const expected=Buffer.from(deviceSignature(key,value)), actual=Buffer.from(signature);
 return expected.length===actual.length && timingSafeEqual(expected,actual);
}
