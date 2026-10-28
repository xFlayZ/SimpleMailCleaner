# Durchgeführte Prüfungen

## Ergänzung: getrennte Analysearten und geringere KI-Kosten

Die aktuelle Erweiterung wurde mit 39 Unit-/Adaptertests, 10 zusätzlichen Scan-Integrationsprüfungen und 6 HTTP-Prüfungen der neuen Analyse-Endpunkte überprüft. Diese bestätigen insbesondere: keine Body-Abfrage bei lokaler oder KI-Schnellanalyse, Pakete mit maximal 20 Nachrichten, übersprungene unveränderte Bewertungen, einzelne Neubeurteilung nach Betreffänderung, getrennte Inhaltseinwilligung und unabhängig gespeicherte Schnell-/Inhaltsbewertungen. Die bestehenden 24 Datenbankprüfungen bestehen weiterhin. Die Vorabschätzung für 12.000 Nachrichten wird anhand eines ausdrücklich angenommenen Tokenpreises getestet; sie ist kein Preisversprechen.

Stand: 28.10.2026, lokale Windows-Entwicklungsumgebung mit Node.js 22 und isoliertem PostgreSQL 18 auf Loopback-Port 55432. Keine echten E-Mail-Konten oder OpenRouter-Schlüssel verwendet.

## Erfolgreich geprüft

- Produktionsbuild mit Next.js 16 und TypeScript.
- 34 Unit-/Adaptertests: Eigentümerbindung und Manipulationserkennung verschlüsselter Schlüssel, Passworthashes, Connector-Signaturen, Schutzregeln, validierte KI-Antworten, Kostenreservierung, interne/reservierte Abmeldeziele, UID-basierte IMAP-Referenzen und Verbot eines COPY/DELETE-Fallbacks.
- Darin drei Tests mit tatsächlich erzeugten RSA-DKIM-Signaturen: gültige RFC-8058-Abmeldung, fehlende Signaturabdeckung des POST-Headers und manipulierte Abmelde-URL.
- 24 PostgreSQL-Integrationsprüfungen: RLS-Nutzertrennung, Eigentümer-Fremdschlüssel, feste Auswahl trotz später eintreffender Nachricht, fremde/abgelaufene/doppelte Freigaben, Schutzregel nach Freigabe, aktuelle Anbieter-Markierung, erfolgreicher Papierkorb/Restore mit simuliertem Adapter, unklare Aktion und Scan-Deduplizierung.
- 11 HTTP-API-Smoke-Prüfungen gegen den gestarteten Produktionsserver: HTML-Dashboard und Anleitung, fehlende Anmeldung, Origin-/CSRF-Prüfung, Registrierung, sichere Sitzungscookies, Eingabevalidierung, fehlende OAuth-Konfiguration, Logout und erneutes Login.
- npm-Sicherheitsprüfung der Laufzeitabhängigkeiten nach Aktualisierung von mailauth: keine gemeldeten bekannten Schwachstellen.

## Noch nicht extern verifiziert

- Echte OAuth-Zustimmung, Token-Erneuerung und End-to-End-Mailaktionen bei Gmail und Outlook.
- Tatsächliche IMAP-Fähigkeiten und Papierkorb-/Restore-Verhalten konkreter T-Online-, Yahoo- und Proton-Bridge-Konten.
- Lokaler Proton-Connector mit realer Bridge und deren Zertifikat.
- Echte OpenRouter-Modellverfügbarkeit, Rechnung und Datenschutzroute mit Nutzerschlüssel.
- Endgültiger Abmeldeerfolg bei einem externen Newsletterdienst.
- Docker-Compose-Gesamtstart: Docker Desktop war in dieser Umgebung nicht gestartet. Die native PostgreSQL-/Node-Variante wurde verwendet.
- Visuelle Browserprüfung: Der In-App-Browser konnte keine Webview anbinden; der native Browserzugriff wurde nicht freigegeben und ist abgelaufen. HTML- und API-Antworten wurden technisch geprüft, aber kein visueller Screenshot- oder Mobilbrowser-Test bestätigt.

Die automatisierten Prüfergebnisse ersetzen weder reale Anbieter-Tests noch eine unabhängige Sicherheitsprüfung vor öffentlichem Betrieb. Aktuelle Funktionsgrenzen und nötige Betriebsmaßnahmen stehen in BETRIEB.md.
