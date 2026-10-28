import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
if (existsSync('.env')) { console.log('.env existiert bereits; keine Änderungen.'); process.exit(0); }
const password = randomBytes(24).toString('hex');
let source = readFileSync('.env.example', 'utf8')
  .replace('CHANGE_ME', password)
  .replace(/^ENCRYPTION_KEY=.*$/m, `ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`);
source += `\nPOSTGRES_PASSWORD=${password}\n`;
writeFileSync('.env', source, { mode: 0o600 });
console.log('.env mit neuen lokalen Geheimnissen erstellt. OAuth-Zugangsdaten gemäß docs/EINRICHTUNG.md ergänzen.');
