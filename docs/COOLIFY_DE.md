# SimpleMailCleaner mit Coolify installieren

Diese Anleitung ist absichtlich Schritt für Schritt geschrieben. Du brauchst einen Server mit Coolify, eine Domain und dieses GitHub-Projekt. Coolify baut vier Teile: Webseite, Hintergrundarbeiter, Datenbank und Datenbank-Setup. Nur die Webseite bekommt eine öffentliche Adresse.

> **Wichtig:** SimpleMailCleaner kann echte E-Mails in den Papierkorb verschieben. Starte zuerst mit einem Testkonto. Lies vor echten Postfächern [Betrieb und Grenzen](BETRIEB.md).

## 1. Projekt in Coolify anlegen

1. Melde dich in Coolify an.
2. Wähle dein Projekt und deine Umgebung (meist `production`).
3. Klicke **Add Resource → Public Repository**.
4. Füge `https://github.com/xFlayZ/SimpleMailCleaner` ein und wähle den Branch `main`.
5. Wähle **Docker Compose** als Build-Methode.
6. Trage als Compose-Datei `compose.coolify.yaml` ein und speichere.

Coolify zeigt nun die Dienste `db`, `migrate`, `web` und `worker`. Die Datenbank und der Worker bekommen keine öffentliche Domain.

## 2. Drei geheime Werte vorbereiten

Auf deinem eigenen Computer (nicht im GitHub-Repository) öffnest du ein Terminal. Erzeuge zwei zufällige Geheimnisse:

```bash
openssl rand -hex 24
openssl rand -base64 32
```

Der erste Befehl gibt das Datenbankpasswort aus. Der zweite gibt den Schlüssel aus, der gespeicherte Anbieter- und KI-Zugangsdaten schützt. Bewahre beide sicher in einem Passwortmanager auf. Teile sie niemandem mit. Bei Verlust des Verschlüsselungsschlüssels können gespeicherte Zugangsdaten nicht mehr gelesen werden.

## 3. Variablen in Coolify eintragen

Öffne **Environment Variables** des Coolify-Projekts und füge diese Werte hinzu. Bei `APP_URL` deine echte HTTPS-Adresse einsetzen, zum Beispiel `https://mail.example.de`:

```dotenv
APP_URL=https://mail.example.de
POSTGRES_PASSWORD=HIER_DAS_ERSTE_GEHEIMNIS
ENCRYPTION_KEY=HIER_DAS_ZWEITE_GEHEIMNIS
REGISTRATION_OPEN=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_TENANT=common
PAUSE_WRITES=false
```

Setze Geheimnisse in Coolify als **Secret/Is Secret**, wenn diese Auswahl angezeigt wird. Lass die OAuth-Werte leer, wenn du den Anbieter noch nicht einrichtest. `REGISTRATION_OPEN=false` lässt nicht beliebige Personen Konten anlegen. Das erste Konto kann trotzdem erstellt werden; danach ist die Registrierung geschlossen.

## 4. Domain mit der Webseite verbinden

1. Öffne in Coolify den Dienst **web** und seine **Domains**.
2. Füge deine Domain mit HTTPS hinzu, zum Beispiel `https://mail.example.de`.
3. Wähle den internen Port `3000`.
4. Speichere. Coolify stellt TLS/HTTPS bereit, wenn DNS und Server korrekt eingerichtet sind.

Die Adresse muss exakt dieselbe sein wie `APP_URL`. Die Datenbank (`db`) darf **keine** Domain bekommen und Port 5432 darf nicht öffentlich gemacht werden.

## 5. Starten

Klicke **Deploy**. Beim ersten Start lädt Coolify PostgreSQL, baut die Anwendung, wartet bis die Datenbank bereit ist und führt anschließend die Migration aus. Danach starten Webseite und Worker. Die PostgreSQL-Daten bleiben im Docker-Volume `postgres`, auch wenn du die Anwendung neu baust.

Öffne anschließend `https://deine-domain`. Erstelle dein Konto. Wenn etwas nicht startet, schau in Coolify bei **Deployment Logs** und danach bei **Runtime Logs** zuerst auf `migrate`, dann `web` oder `worker`.

## 6. Google- und Microsoft-Anmeldung (optional)

Für Gmail und Outlook brauchst du jeweils eine OAuth-App beim Anbieter:

- Google: Erstelle OAuth-Zugangsdaten vom Typ **Web application** und trage als Weiterleitungsadresse `https://DEINE-DOMAIN/api/oauth/google/callback` ein. Kopiere Client-ID und Client-Secret in `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET`.
- Microsoft: Registriere eine Anwendung und trage `https://DEINE-DOMAIN/api/oauth/outlook/callback` als Web-Weiterleitungsadresse ein. Hinterlege die Client-ID, das Secret und bei Bedarf den Tenant in `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` und `MICROSOFT_TENANT`.

Ändere Variablen in Coolify und klicke danach **Redeploy**. OAuth-Anbieter können eine Prüfung oder Admin-Zustimmung verlangen. Verwende nur die in der [Einrichtungsanleitung](EINRICHTUNG.md) beschriebenen minimalen Berechtigungen.

T-Online und Yahoo verwenden IMAP-Zugangsdaten/App-Passwörter. Proton benötigt Proton Mail Bridge und den lokalen Connector; siehe [Einrichtungsanleitung](EINRICHTUNG.md). Stelle Bridge oder PostgreSQL niemals öffentlich ins Internet.

## 7. OpenRouter einrichten

Jede Person trägt ihren eigenen OpenRouter-API-Schlüssel nach der Anmeldung in **Einstellungen → KI & OpenRouter** ein. Die App speichert ihn verschlüsselt pro Benutzer. Wähle dort ein Modell und prüfe vor einem Lauf die Kostenschätzung. Schlüssel nicht als gemeinsame Coolify-Variable eintragen.

## 8. Updates, Sicherung und Not-Aus

- Updates: erstelle ein PostgreSQL-Backup, wähle dann in Coolify **Redeploy** für den neuen `main`-Stand.
- Sicherung: sichere PostgreSQL regelmäßig verschlüsselt und getrennt vom Server. Teste gelegentlich eine Wiederherstellung.
- Verschlüsselungsschlüssel: sichere `ENCRYPTION_KEY` separat und dauerhaft. Ändere ihn nicht, solange gespeicherte Geheimnisse damit verschlüsselt sind.
- Not-Aus für neue Schreibvorgänge: setze `PAUSE_WRITES=true` und redeploye. Bereits beim E-Mail-Anbieter abgeschickte Aktionen können nicht zurückgeholt werden.
- Löschen der Coolify-Ressource mit Volume kann alle lokalen Daten endgültig löschen. Lösche das Volume `postgres` nicht, wenn du die Daten behalten möchtest.

Weitere Informationen: [Betrieb und Grenzen](BETRIEB.md), [Datenschutz und Analysearten](AUFRAEUMPIPELINE.md), [Anbietereinrichtung](EINRICHTUNG.md).
