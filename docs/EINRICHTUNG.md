# Einrichtung und manuelle Schritte

Stand: 28.10.2026. Alle fünf Zugangswege sind im Anwendungscode vorhanden. OAuth-Clients, externe Kontozugänge und Anbieterfreigaben musst du selbst einrichten. Zugangsdaten niemals in Git einchecken oder in einen Chat kopieren.

## 1. Grundinstallation

Voraussetzungen: Node.js 22.14 oder neuer, npm und Docker Desktop mit Linux-Containern. Alternativ PostgreSQL 17+ und zwei Node.js-Prozesse für Web und Worker.

```powershell
npm install
npm run setup
```

Der Setup-Befehl legt `.env` mit zufälligem Datenbankpasswort und Verschlüsselungsschlüssel an, falls diese Datei noch nicht existiert. Vorhandene Einstellungen werden nicht überschrieben. `.env` ist aus Git und Docker-Build-Kontext ausgeschlossen. Unter Windows Dateiberechtigungen für `.env` und `.env.connector` zusätzlich über die Betriebssystemrechte auf das eigene Benutzerkonto begrenzen; POSIX-Dateimodi allein reichen dort nicht.

Docker Desktop starten:

```powershell
docker compose up --build -d
docker compose logs -f worker
```

Die Datenbank wird automatisch migriert. Anwendung unter http://localhost:3000 öffnen. „Eigenen Arbeitsplatz einrichten“ und anschließend „Registrieren“ wählen. Das Anwendungspasswort ist unabhängig vom E-Mail-Passwort und benötigt mindestens 12 Zeichen.

Weitere Nutzer sind standardmäßig deaktiviert. Für einen kontrollierten Mehrnutzertest `REGISTRATION_OPEN=true` in `.env` setzen und Web/Worker neu erstellen. Vor öffentlicher Registrierung die Betriebsdokumentation lesen.

Für native Entwicklung: eigene PostgreSQL-Datenbank anlegen, `DATABASE_URL` in `.env` setzen und `npm run db:migrate`, `npm run dev` sowie in einem zweiten Terminal `npm run worker` ausführen. Next.js lädt `.env`; die Skripte nutzen ausdrücklich dieselbe Datei. Die Migration benötigt Rechte zum Anlegen der Tabellen und der eingeschränkten Rolle `smc_tenant`. Die Verbindungsrolle muss diese Rolle annehmen dürfen. Der mitgelieferte Compose-Aufbau nutzt eine administrative Verbindungsrolle; jede nutzerbezogene Transaktion wechselt dennoch explizit in die per RLS eingeschränkte Rolle. Für einen öffentlichen Betrieb diese privilegierten Systempfade gesondert prüfen.

## 2. Google / Gmail OAuth

Offizielle Grundlagen: https://developers.google.com/identity/protocols/oauth2/web-server und https://developers.google.com/workspace/gmail/api/auth/scopes

1. In der Google Cloud Console ein eigenes Projekt anlegen oder auswählen.
2. Unter „APIs & Services“ die Gmail API aktivieren.
3. Im Bereich Google Auth Platform / OAuth-Zustimmungsbildschirm Branding, Supportadresse und Zielgruppe konfigurieren. Für private Gmail-Adressen ist in der Regel eine externe Zielgruppe nötig.
4. Im Testmodus die eigenen Gmail-Adressen als Testnutzer hinzufügen.
5. Unter Datenzugriff ausschließlich den benötigten Gmail-Scope hinzufügen: `https://www.googleapis.com/auth/gmail.modify`.
6. OAuth-Client vom Typ „Webanwendung“ anlegen.
7. Als autorisierte Weiterleitungs-URI exakt eintragen: `http://localhost:3000/api/oauth/gmail/callback`.
8. Für eine gehostete Instanz eine eigene URI ergänzen, etwa `https://mail.example.org/api/oauth/gmail/callback`. Produktions- und Testclients möglichst trennen.
9. Client-ID und Client-Secret in `.env` als `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` speichern. `APP_URL` muss mit der tatsächlich verwendeten Basisadresse übereinstimmen; kein abschließender Schrägstrich.
10. Web und Worker neu starten beziehungsweise Container neu erstellen.
11. In der Anwendung „Postfach hinzufügen → Gmail → Mit Gmail verbinden“ wählen und dem Zugriff zustimmen.

OAuth verwendet State, einen sitzungsgebundenen Einmalvorgang, PKCE und Offline-Zugriff. Google kann im Testmodus eingeschränkte Refresh-Token-Laufzeiten anwenden. Bei Ablauf erneut verbinden. Wenn kein Refresh-Token geliefert wird, die bestehende App-Zustimmung im Google-Konto widerrufen und erneut verbinden.

Für öffentliche Nutzung mit Gmail-Daten ist vor Launch die Google-Verifikation zu klären. `gmail.modify` ist ein eingeschränkter Scope; serverseitiger Zugriff und Weitergabe an KI-Anbieter können ein unabhängiges Security Assessment erfordern. Testmodus ist keine öffentliche Produktionsfreigabe. Datenschutzseite, verifizierte Domain, Berechtigungsbegründung, Demonstration des Datenflusses und Limited-Use-Konformität vorbereiten. Maßgeblich sind die konkreten Google-Anforderungen und mögliche Ausnahmen:

- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://developers.google.com/workspace/workspace-api-user-data-developer-policy

## 3. Outlook / Microsoft 365 OAuth

Offizielle Grundlage: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow

1. Im Microsoft Entra Admin Center „App registrations → New registration“ öffnen.
2. Für Outlook.com und Microsoft-365-Konten „Accounts in any organizational directory and personal Microsoft accounts“ als unterstützte Kontotypen wählen.
3. Plattform „Web“ und Redirect-URI `http://localhost:3000/api/oauth/outlook/callback` eintragen. Für Hosting die entsprechende HTTPS-URI ergänzen.
4. Unter API permissions Microsoft Graph, ausschließlich delegierte Berechtigungen, `Mail.ReadWrite` und `User.Read` hinzufügen. Offline-Zugriff wird im OAuth-Flow über `offline_access` angefordert.
5. Unter Certificates & secrets ein Client-Secret erstellen. Den Secret-WERT kopieren, nicht seine ID. Ablaufdatum dokumentieren.
6. In `.env` `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` und `MICROSOFT_TENANT=common` setzen.
7. Web und Worker neu starten, dann in der Anwendung Outlook verbinden.

Geschäftliche Tenants können Administratorzustimmung oder eine freigegebene Anwendung verlangen. Keine Application-Mail-Berechtigungen und keinen organisationsweiten Postfachzugriff aktivieren. Für reine Firmeninstallationen kann ein konkreter Tenant statt `common` verwendet werden; dazu passende Kontotypen wählen.

## 4. T-Online

1. Im Telekom E-Mail Center ein separates „Passwort für E-Mail-Programme“ festlegen. Es ist nicht das normale Telekom-Loginpasswort.
2. In der Anwendung T-Online auswählen, vollständige E-Mail-Adresse und dieses Passwort eingeben.
3. Die Anwendung verbindet fest mit `secureimap.t-online.de`, Port 993, TLS mit Zertifikatsprüfung.
4. Erst einen kleinen Metadatenscan starten.

Für Aufräumen muss der Server den Papierkorb über SPECIAL-USE melden sowie MOVE und UIDPLUS anbieten. Fehlt eine dieser Voraussetzungen, verweigert die Anwendung die Verschiebung. Kein unsicherer COPY/DELETE-Ersatzpfad.

Quelle: https://www.telekom.de/hilfe/apps-dienste/e-mail/posteingang-postausgang-server

## 5. Yahoo

1. In der Yahoo-Kontosicherheit ein App-Passwort für SimpleMailCleaner generieren, sofern für das Konto verfügbar.
2. In der Anwendung Yahoo auswählen und vollständige Adresse plus App-Passwort eingeben.
3. Die Anwendung verwendet `imap.mail.yahoo.com`, Port 993 mit TLS.

Das normale Kontopasswort wird nicht als Ersatz empfohlen. Falls Yahoo kein App-Passwort zulässt, ist dieser Verbindungsweg für das betreffende Konto nicht nutzbar. Ein Yahoo-OAuth-Flow ist in dieser Version nicht implementiert. Für Papierkorb und Wiederherstellung gelten dieselben IMAP-Fähigkeitsprüfungen wie bei T-Online.

Quelle: https://uk.help.yahoo.com/kb/SLN3697.html

## 6. Proton Mail Bridge und lokaler Connector

Offizielle Grundlage: https://proton.me/support/imap-smtp-and-pop3-setup

Voraussetzungen: kostenpflichtiger Proton-Mail-Tarif, lokal installierte und angemeldete Proton Mail Bridge sowie Node.js auf diesem Gerät. Proton Free bietet diesen Bridge-Zugang nicht. Die Bridge wird nicht öffentlich ins Internet freigegeben.

1. Bridge installieren, anmelden und die IMAP-Verbindungsdetails öffnen.
2. In der Anwendung Proton Mail mit derselben Adresse hinzufügen, die Bridge als IMAP-Benutzername anzeigt. Der Connector prüft die Kontozuordnung exakt; abweichende Aliasadressen nicht verwenden.
3. Einmalig angezeigten Connector-Token und Geräteschlüssel sicher lokal übernehmen.
4. `.env.connector.example` nach `.env.connector` kopieren.
5. Folgende Werte setzen:

```text
SERVER_URL=http://localhost:3000
CONNECTOR_TOKEN=<einmalig angezeigter Token>
CONNECTOR_DEVICE_KEY=<einmalig angezeigter Geräteschlüssel>
BRIDGE_HOST=127.0.0.1
BRIDGE_PORT=1143
BRIDGE_SECURE=false
BRIDGE_USER=<IMAP-Benutzername aus Bridge>
BRIDGE_PASSWORD=<generiertes Bridge-Passwort>
BRIDGE_CA_FILE=C:/sicherer/pfad/bridge-cert.pem
BRIDGE_SERVERNAME=localhost
```

6. Bridge-Zertifikat über die Bridge-Einstellungen exportieren und den PEM-Pfad eintragen. Der Servername muss zum Zertifikat passen. Port und TLS-Modus anhand der tatsächlichen Bridge-Einstellungen wählen. Bei STARTTLS `BRIDGE_SECURE=false`; STARTTLS wird dann ausdrücklich verlangt. Bei direktem TLS `true`.
7. Im Projektordner lokal `npm run connector` starten. Für spätere Nutzung muss der Connector weiterlaufen.
8. In den Einstellungen wird nach dem ersten Poll „Connector online“ angezeigt. Anschließend kleinen Scan starten.

Für einen SaaS-Server muss `SERVER_URL` eine gültige HTTPS-Adresse sein. Der Connector baut ausschließlich ausgehende Verbindungen auf. Der Server benötigt keinen Zugriff auf das lokale Netzwerk. Pro gekoppeltem Proton-Konto eine eigene Connector-Konfiguration verwenden.

Keine Einstellung wie `NODE_TLS_REJECT_UNAUTHORIZED=0` verwenden. Die Zertifikatsprüfung bleibt aktiv. Das Proton-Hauptpasswort gehört weder in den Server noch in `.env.connector`; ausschließlich das von Bridge erzeugte IMAP-Passwort nutzen.

Der Geräteschlüssel authentifiziert zeitlich begrenzte Aufträge. Schreibaufträge werden lokal vor der Ausführung in `.connector/ledger.json` vermerkt. Nach einem Absturz wird ein begonnener Auftrag nicht noch einmal ausgeführt. Diese Datei daher nicht zwischen Wiederholungsversuchen löschen. `.env.connector` und Ledger über Betriebssystemrechte schützen. Die Version nutzt geschützte Konfigurationsdateien, noch keinen integrierten OS-Schlüsselspeicher.

Bei Verbindungsproblemen: Bridge gestartet? Benutzername identisch? Zertifikat/Servername korrekt? Connector-Token noch gültig? Konto wurde getrennt? Fehlender MOVE-/UIDPLUS-Support wird sicher abgelehnt. Ein eigener Connector ist kein offiziell von Proton zertifizierter Client.

Wichtig: Für eine aktivierte KI-Analyse verlassen entschlüsselte Textausschnitte auch bei Proton dein Gerät. Connector-Transportantworten werden auf dem Server kurzzeitig verschlüsselt zwischengespeichert und nach Abholung beziehungsweise Ablauf entfernt.

## 7. OpenRouter und Modellwahl

1. Eigenes OpenRouter-Konto anlegen und API-Schlüssel erstellen. Möglichst einen nur für diese Anwendung verwendeten Schlüssel mit eigenem Kreditlimit nutzen.
2. In SimpleMailCleaner „Einstellungen → KI & OpenRouter“ öffnen.
3. API-Schlüssel eintragen; er wird beim Speichern geprüft und verschlüsselt an den angemeldeten Nutzer gebunden.
4. Modellkatalog laden, Suchfeld verwenden und Modell auswählen. Die Liste zeigt Input-/Outputkosten in USD pro Million Tokens. Nicht für Text-/JSON-Ausgabe geeignete Modelle sind sichtbar, aber deaktiviert.
5. Scan- und Monatsbudget setzen. Einwilligung zur externen Verarbeitung lesen und aktivieren.
6. Speichern. Ein späteres Schlüsselupdate ersetzt nur den eigenen Schlüssel und invalidiert wartende Anfragen mit alter Schlüsselversion.

Jeder KI-Aufruf fordert `provider.zdr=true` und `provider.data_collection=deny` an. Gibt es keine geeignete Route, scheitert der Aufruf; diese Regeln werden nicht still gelockert. Ob der gewählte Schlüssel eine bestimmte Route nutzen darf, entscheidet OpenRouter. Modellpreise ändern sich; der Katalog wird regelmäßig aktualisiert und vor einem KI-Scan neu geladen. Die Oberfläche stellt keine feste Kosten-pro-E-Mail-Zusage dar.

Kosten werden vor Aufrufen konservativ reserviert und, soweit zurückgemeldet, mit den tatsächlichen Inferenzkosten ersetzt. Reservierungen nach unklarem Ausgang bleiben bestehen. Externe Verwendung desselben Schlüssels, Steuern und Kreditkaufgebühren werden nicht in der App erfasst. Das App-Budget ist keine Garantie für die Abrechnung bei OpenRouter.

Quellen:

- https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties
- https://openrouter.ai/docs/guides/privacy/data-collection
- https://openrouter.ai/pricing

## 8. Erster sicherer Durchlauf

Aktueller Scandialog: Neben der lokalen Übersicht gibt es eine sparsame KI-Schnellanalyse nur mit Absender, Betreff und Datum. Der Inhaltsscan ist eine getrennte Option mit zusätzlicher Einwilligung. Die Schnellanalyse ist die empfohlene KI-Startoption. Sie zeigt vorab eine eigene Kostenspanne, bündelt bis zu 20 Nachrichten pro Anfrage und überspringt unveränderte frühere Bewertungen. Details und Rechenbeispiele stehen in ANALYSEARTEN.md. One-Click-Abmeldeangebote werden weiterhin erst anhand von Roh-Nachrichten sicher verifiziert, nicht aus KI-Metadaten geraten.

1. Nur ein eigenes Testkonto verbinden, zunächst einen Metadatenscan mit beispielsweise 20 Nachrichten und 30 Tagen starten.
2. Worker laufen lassen und Fortschritt im Aktivitätsverlauf prüfen.
3. Absendergruppen ansehen und wichtige Absender schützen.
4. KI konfigurieren und einen kleinen KI-Inhaltsscan starten. Dabei werden auch verifizierte One-Click-Abmeldeangebote ermittelt.
5. Einzelne Vorschläge samt Textvorschau prüfen.
6. Eine kleine feste Auswahl freigeben. Freigaben laufen nach 15 Minuten ab, auch wenn der Worker verzögert startet.
7. Ergebnis im echten Anbieterpostfach kontrollieren. Anschließend in der App den Papierkorbfilter öffnen und Wiederherstellung prüfen.
8. Eine vertrauenswürdige Liste separat abmelden. „Anfrage angenommen“ ist keine garantierte dauerhafte Abmeldung. Bei Formularen/Login/CAPTCHA den Abmeldelink im Originalpostfach manuell verwenden.

Falls eine Aktion „Ergebnis unklar“ meldet: direkt beim Anbieter nachsehen. Nicht dieselbe Aktion blind erneut anstoßen. Die App sperrt betroffene Nachrichten gegen erneute Freigabe; automatische Reconciliation und eine bedienbare manuelle Entsperrung sind noch nicht enthalten.

## 9. Hosting und Neustart

`APP_URL` auf die endgültige HTTPS-Adresse setzen und OAuth-Redirects anpassen. Web und Worker brauchen PostgreSQL-Zugang; Worker zusätzlich ausgehendes HTTPS und TCP/993. Ein ausschließlich kurzlebiges Serverless-Deployment reicht für IMAP und langlebige Worker nicht aus.

Compose bindet Web und Datenbank nur an Loopback. Für öffentliches Hosting einen Reverse Proxy mit TLS, geeigneten Zugriffsschutz und die Maßnahmen aus BETRIEB.md vorschalten. Geheimnisse außerhalb von Git sichern. Verlust von ENCRYPTION_KEY macht gespeicherte Anbieter- und OpenRouter-Schlüssel unlesbar.

```powershell
docker compose up --build -d
docker compose logs --tail 100 web worker
docker compose stop
```

`PAUSE_WRITES=true` und Neustart des Workers stoppt die Aufnahme weiterer schreibender Aktionen. Bereits beim Anbieter eingegangene Anfragen lassen sich nicht zurückholen. Konto trennen entfernt lokale Kontodaten und widerruft Connector-Zugang; OAuth-Zustimmung zusätzlich beim Anbieter widerrufen.
