# SimpleMailCleaner

[![License: MIT](https://img.shields.io/badge/License-MIT-2f6b50.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-222222.svg)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17%2B-4169E1.svg)](https://www.postgresql.org/)

**Open-Source-Dashboard zum KI-gestützten Aufräumen deiner E-Mail-Postfächer – unter der MIT-Lizenz.**

Newsletter erkennen, wiederkehrende Absender verstehen und unnötige Nachrichten gezielt aussortieren. Die KI liefert Empfehlungen; erst nach deiner ausdrücklichen Freigabe werden Nachrichten in den Papierkorb verschoben oder unterstützte Newsletter-Abmeldungen ausgeführt.

Die Oberfläche und Dokumentation sind auf Deutsch. Die Anwendung lässt sich **ohne Docker** oder mit Docker Compose selbst betreiben. Jeder Nutzer verwendet seinen eigenen OpenRouter-API-Schlüssel.

> **Entwicklungsstand:** frühe, lauffähige Version für lokale und kontrollierte Mehrnutzertests. Die Anbieteradapter sind implementiert; echte Kontotests, Anbieterfreigaben und eine unabhängige Sicherheitsprüfung stehen noch aus. Diese Version ist noch keine öffentlich freigegebene SaaS-Lösung. Siehe [Betriebsstand und Grenzen](docs/BETRIEB.md).

## Funktionen

- Dashboard mit Newsletter- und Absendergruppen, Suchfunktion und Nachrichtenprüfung.
- Drei getrennte Analysearten mit Kostenschätzung vor KI-Aufrufen.
- Dynamischer OpenRouter-Modellkatalog mit Input-/Outputpreisen.
- Eigene, verschlüsselt gespeicherte API-Schlüssel und Budgets pro Nutzer.
- Geschützte Absender sowie Schutzsignale für markierte Nachrichten, Anhänge und wichtige Unterlagen.
- Feste, zeitlich begrenzte Freigaben für konkrete Nachrichten statt pauschaler Löschaufträge.
- Papierkorb und Wiederherstellung; keine endgültige Löschung durch die Anwendung.
- Technisch verifizierte One-Click-Abmeldungen nach RFC 8058 mit gesonderter Freigabe.
- Aktivitätsverlauf, Hintergrundverarbeitung und Behandlung unklarer Ausführungsergebnisse.
- Deutlich markierte Vorschau mit fiktiven Daten, solange kein Anwendungskonto angemeldet ist.

## Analysearten und Kosten

| Analyse | An die KI übermittelte Daten | Umfang |
| --- | --- | --- |
| Lokale Übersicht | Keine | Bis zu 20.000 Nachrichten; 0 USD KI-Kosten |
| KI-Schnellanalyse | Absender, Betreff, Datum und interne Nachrichtenreferenz | Bis zu 20.000 Nachrichten; Pakete mit bis zu 20 Einzelbewertungen |
| Separater KI-Inhaltsscan | Zusätzlich bereinigte Textausschnitte | Bis zu 500 Nachrichten; zusätzliche Einwilligung erforderlich |

Die Schnellanalyse ist die vorausgewählte KI-Option. Sie lädt keine Nachrichtentexte oder Anhänge. Unveränderte frühere Bewertungen werden wiederverwendet. Die Prüfungsliste kennzeichnet, worauf eine Empfehlung beruht; eine Bewertung ohne Inhalt ist keine vollständige Inhaltsprüfung.

Kosten werden anhand des gewählten Modells, aktueller Tokenpreise und des Scanumfangs geschätzt. Eine Schätzung ist keine Abrechnungsgarantie. Die Anwendung erhöht Budgets nicht automatisch. Auch Betreffzeilen und Absender können sensible Daten enthalten.

[Details zu Analysearten, Datenschutz und Kostenschätzung](docs/ANALYSEARTEN.md)

## E-Mail-Anbieter

| Anbieter | Implementierter Zugang | Voraussetzungen / Grenzen |
| --- | --- | --- |
| T-Online | IMAP über TLS | Separates Passwort für E-Mail-Programme |
| Outlook / Microsoft 365 | Microsoft Graph und OAuth | Eigener Microsoft-OAuth-Client; ggf. Tenant-Freigabe |
| Yahoo | IMAP über TLS | App-Passwort; kein Yahoo-OAuth-Flow in dieser Version |
| Gmail | Gmail API und OAuth | Eigener Google-OAuth-Client; öffentliche Nutzung kann Verifikation und Sicherheitsprüfung erfordern |
| Proton Mail | Lokale Proton Mail Bridge mit Connector | Kostenpflichtiger Proton-Tarif, laufende Bridge und lokaler Connector |

IMAP-Papierkorbaktionen benötigen einen eindeutig erkannten Papierkorb sowie MOVE-/UIDPLUS-Unterstützung. Unsichere COPY/DELETE-Ersatzpfade werden nicht verwendet. Ein implementierter Adapter ist keine Zertifizierung durch den jeweiligen Anbieter.

Die automatische Newsletter-Abmeldung funktioniert nur mit erfolgreich verifizierten One-Click-Headern. Formulare, Logins und andere Verfahren werden im Originalpostfach manuell bearbeitet. Eine vom Endpunkt angenommene Anfrage garantiert keine dauerhafte Abmeldung.

## Schnellstart ohne Docker

Voraussetzungen: **Node.js 22.14+**, npm und **PostgreSQL 17+**.

```bash
git clone https://github.com/xFlayZ/SimpleMailCleaner.git
cd SimpleMailCleaner
npm ci
npm run setup
```

1. Eine eigene PostgreSQL-Datenbank anlegen.
2. `DATABASE_URL` in der erzeugten `.env` konfigurieren. Die Migration benötigt Rechte zum Anlegen der Tabellen und der eingeschränkten Rolle `smc_tenant`.
3. Für lokalen Betrieb `APP_URL=http://localhost:3000` verwenden.
4. Schema und Produktionsbuild erstellen:

```bash
npm run db:migrate
npm run build
npm run start
```

Den Hintergrunddienst in einem **zweiten Terminal** starten:

```bash
npm run worker
```

Anwendung unter **[localhost:3000](http://localhost:3000)** öffnen. „Eigenen Arbeitsplatz einrichten“ wählen und registrieren. Die erste Registrierung ist erlaubt; weitere Nutzer benötigen `REGISTRATION_OPEN=true`. Anwendungspasswort und E-Mail-Anbieterzugang sind voneinander unabhängig.

Für die Entwicklung kann `npm run dev` statt Build/Start verwendet werden. Der Worker wird weiterhin separat benötigt.

## Schnellstart mit Docker

Voraussetzungen: Git, Node.js 22.14+ und ein laufendes Docker mit Compose.

```bash
git clone https://github.com/xFlayZ/SimpleMailCleaner.git
cd SimpleMailCleaner
npm ci
npm run setup
docker compose up --build -d
```

Compose startet PostgreSQL, Schema-Migration, Webanwendung und Worker. Web und Datenbank sind standardmäßig nur über Loopback erreichbar. Öffentliche Bereitstellung erfordert einen passenden TLS-Reverse-Proxy und weitere Betriebsvorbereitung.

```bash
docker compose logs -f web worker
docker compose stop
```

`npm run setup` erzeugt zufällige lokale Geheimnisse und überschreibt keine vorhandene `.env`. Umgebungsdateien, lokale Datenbanken und Connector-Zustände gehören **nicht** ins Repository.

## Anbieter und KI einrichten

Die [vollständige Einrichtungsanleitung](docs/EINRICHTUNG.md) beschreibt:

- Google-Cloud-Projekt, Gmail API, OAuth-Zustimmung, Testnutzer und Redirect-URL.
- Microsoft-App-Registrierung, delegierte Berechtigungen und Redirect-URL.
- T-Online-E-Mail-Passwort und Yahoo-App-Passwort.
- Proton Bridge, Zertifikatsprüfung und lokale Connector-Kopplung.
- OpenRouter-Schlüssel, Modellwahl, Budgets und getrennte Scan-Einwilligungen.

Die Anleitung ist nach dem Start auch unter `/guide` in der Anwendung verfügbar. Beispielkonfigurationen stehen in [.env.example](.env.example) und [.env.connector.example](.env.connector.example). Niemals echte Schlüssel in diese Beispieldateien eintragen.

## Architektur

```text
Browser → Next.js Web/API → PostgreSQL
                              ↑
                    persistente Aufträge
                              ↓
                       Node.js-Worker
                    ├─ Gmail API / Graph / IMAP
                    ├─ OpenRouter
                    └─ verifizierte One-Click-Abmeldung

Proton Bridge ← lokaler Connector → authentifizierte Serververbindung
```

PostgreSQL speichert Nutzer, verschlüsselte Zugangsdaten, Metadaten, Bewertungen und Freigaben. Nutzerbezogene Transaktionen laufen unter einer eingeschränkten RLS-Rolle. Der Worker übernimmt lang laufende Aufgaben. E-Mail-Texte werden nicht als dauerhafte Mailkopien gespeichert; der Proton-Transport verwendet einen kurzlebigen verschlüsselten Puffer.

## Entwicklung und Tests

```bash
npm test
npm run build
npm run typecheck
```

Für Integrationsprüfungen eine **separate, migrierte Testdatenbank** konfigurieren. Sie erzeugen zufällig benannte Testnutzer und entfernen diese anschließend. Keinen laufenden Worker gegen dieselbe Testdatenbank verwenden.

```bash
npm run test:integration
npm run test:scans
```

Die HTTP-Prüfungen benötigen zusätzlich einen laufenden Webserver:

```bash
npm run test:api       # benötigt eine Testdatenbank ohne vorhandene Nutzer
npm run test:scan-api
```

[Prüfprotokoll und noch ausstehende externe Tests](docs/PRUEFUNG.md)

## Sicherheit und Datenschutz

- Keine Schreibaktion allein aufgrund einer KI-Antwort.
- Kein endgültiges Löschen und kein automatisches Leeren des Papierkorbs.
- OpenRouter-Anfragen verlangen ZDR-Routing und den Ausschluss von Datensammlung. Fehlt eine passende Route, wird dies nicht still gelockert.
- API-Schlüssel und Anbieterzugänge werden authentifiziert verschlüsselt und an den jeweiligen Nutzer gebunden.
- Unsichere Abmeldeziele und nicht ausreichend authentifizierte Header werden abgelehnt.
- Unklare Schreibvorgänge werden nicht blind wiederholt.

Für öffentlichen Betrieb fehlen unter anderem unabhängige Sicherheitsprüfung, vollständige Recovery-/MFA-Prozesse, weitere Betriebshärtung und erforderliche Anbieterfreigaben. [Betriebsdokumentation lesen](docs/BETRIEB.md). Sicherheitslücken bitte gemäß [SECURITY.md](SECURITY.md) melden; keine Zugangsdaten oder echten E-Mail-Inhalte in öffentliche Issues aufnehmen.

## Mitwirken

Issues und Pull Requests sind willkommen. Siehe [CONTRIBUTING.md](CONTRIBUTING.md). Besonders hilfreich sind reproduzierbare Fehlerberichte mit synthetischen Daten, Tests der Anbieteradapter und Verbesserungen an Datenschutz, Zugänglichkeit und Dokumentation.

## Lizenz

SimpleMailCleaner ist **Open Source unter der [MIT-Lizenz](LICENSE)**. Nutzung, Änderung, Weitergabe und kommerzielle Verwendung sind unter deren Bedingungen erlaubt. Die Software wird ohne Gewährleistung bereitgestellt. Abhängigkeiten behalten ihre jeweiligen eigenen Lizenzen.

Das Projekt wurde eigenständig umgesetzt. [Inbox Zero](https://github.com/elie222/inbox-zero) diente als Produktinspiration; dessen Code, Prompts und Assets wurden nicht übernommen.
