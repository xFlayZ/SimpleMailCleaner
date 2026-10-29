# Betriebsstand und Sicherheitsgrenzen

Diese erste Implementierung enthält produktive Schnittstellenpfade für alle fünf geforderten Anbieter. Sie ist für lokale Tests und kontrollierte Mehrnutzertests vorbereitet. Sie ist noch keine unabhängig geprüfte, öffentlich freigegebene SaaS-Version.

## Implementiert

- Next.js-Dashboard, Anmeldung mit scrypt-Passwörtern, serverseitige Sitzungen, Origin-Prüfung bei browserbasierten Mutationen und kontobezogene Anmeldebegrenzung.
- PostgreSQL-Schema, explizite Nutzertransaktionen unter einer eingeschränkten RLS-Rolle, zusammengesetzte Eigentümer-Fremdschlüssel.
- Authentifizierte AES-256-GCM-Verschlüsselung von API-Schlüsseln, OAuth-Tokens und IMAP-Passwörtern mit Eigentümerbindung.
- Gmail OAuth + Gmail API; Microsoft OAuth + Graph; feste T-Online-/Yahoo-IMAP-Profile; Proton-Bridge-Connector mit signierten, ablaufenden Aufträgen und lokalem Replay-Ledger.
- Metadatenimport bis 20.000 Nachrichten, konfigurierbare Neubewertung des vorhandenen Bestands bis 50.000 mit Regeln, Muster-Cache und optionaler KI; separater Inhaltsscan bis 500. Anbieter-Batch mit gesonderter Einwilligung ohne ZDR. Details in AUFRAEUMPIPELINE.md.
- Metadaten-Gruppierung, KI-Inhaltsklassifikation über OpenRouter, Schutzregeln, dynamischer Modellkatalog, Budgetreservierung.
- Feste, zeitlich begrenzte Pläne, explizite Freigabe, getrennte Aktionen für Papierkorb, Wiederherstellung und RFC-8058-Abmeldung.
- Vor Papierkorbaktionen erneute Prüfung aktueller Markierungen und Anhänge beim Anbieter.
- Persistente Queue, atomare Aufnahme, Kontosperren, Worker-Heartbeat, Unterbrechungsbehandlung, keine automatischen Wiederholungen unklarer Schreibvorgänge.
- Abmeldungen nur bei passender DKIM-Prüfung einschließlich signierter Header; HTTPS-Zielprüfung, gepinnte öffentliche IPv4-Adresse, keine Cookies, keine Redirects.
- Textvorschau ohne gerendertes Mail-HTML, externe Bilder oder Tracking.

## Bewusste aktuelle Grenzen

- Reale Anbieterfunktion und tatsächliche OAuth-Freigaben müssen mit eigenen Testkonten geprüft werden; die automatisierten Tests verwenden kontrollierte Antworten.
- Noch keine Gmail-History-/Graph-Delta-Synchronisierung, Webhooks, geplante wiederkehrende Scans oder frei wählbare Ordner. Aktuell werden explizite, begrenzte Scans des Posteingangs ausgeführt.
- Kein dauerhafter Mailbody-Speicher, keine Anhangsanalyse. Roh-MIME bis 2 MB wird für Textgewinnung/DKIM im Arbeitsspeicher verarbeitet; größere Nachrichten bleiben zur manuellen Prüfung. Proton-Antworten benötigen einen kurzlebigen verschlüsselten Transportpuffer.
- Kein automatischer Mailto-Abmeldeversand und keine Browserautomation für Abmeldeformulare. Ein normaler Abmeldelink wird im Originalpostfach manuell verwendet.
- Kein allgemeines endgültiges Löschen, kein Papierkorb-Leeren. Wiederherstellung hängt vom Anbieterzustand ab.
- Bei unklaren Mutationen bleibt die Nachricht gesperrt; kein automatischer Zustandsabgleich oder Self-Service zum Aufheben der Sperre. Ein neuer Scan allein hebt die Sperre nicht auf.
- Registrierung unterstützt keine E-Mail-Verifikation, MFA, Passwort-zurücksetzen oder automatische Konto-Wiederherstellung. Keine unbeaufsichtigte öffentliche Registrierung vor Ergänzung dieser Funktionen.
- Eine bestätigte Kontolöschung ist in der Anwendung verfügbar. Vor öffentlichem Betrieb müssen Aufbewahrungsfristen, Sicherungskopien und die vollständige Löschung aller abgeleiteten Daten weiter abgesichert und dokumentiert werden. Eine eigene Exportoberfläche ist nicht vorhanden.
- Kein automatischer Schlüsselrotations-Assistent und noch kein KMS/OS-Schlüsselspeicher-Backend. Konfigurationsdateien müssen mit OS-Berechtigungen geschützt werden.
- Metadaten, Begründungen und Wiederherstellungsreferenzen liegen im Datenbankschema im Klartext; verschlüsselte Datenträger/Backups und Zugriffskontrolle sind für den Betrieb erforderlich.

## Workspace-Verwaltung (Stand 29.10.2026)

- Feste App-Routen: `/dashboard`, `/mailbox`, `/newsletter`, `/senders`, `/cleanup`, `/activity`, `/settings` und `/login`; `/` leitet zum Dashboard.
- Das Postfach zeigt alle erfassten Nachrichten einschließlich lokalem Papierkorbstatus. Sammelauswahl in der Ansicht „Alle E-Mails“ schließt Papierkorb-Nachrichten aus; Wiederherstellung erfolgt über den Papierkorbfilter.
- Dashboard-Widgets lassen sich je Browser ausblenden und neu anordnen. Demo-Daten werden nur nach expliziter Aktivierung angezeigt.
- Aktivitätsverlauf pausiert/fortsetzt die nutzereigene Queue und das Polling von OpenRouter-Batches. Bereits laufende externe Aufrufe werden nicht abrupt beendet. Automatische Wiederholung gibt es nur für Metadatenimporte und lokale Regel-Neubewertungen; KI-Läufe brauchen eine neue Kostenvorschau und Schreibaktionen mit unklarem Anbieterstatus werden nicht erneut ausgeführt.
- Verlauf leeren entfernt beendete interne Einträge, jedoch keine aktiven Aufträge und keine Batch-Verweise, deren Ergebnis oder Remote-Löschung noch offen ist.
- Lokales Leeren eines Postfachbestands entfernt den indexierten Nachrichtenbestand, Bewertungen und zugehörige interne Vorgänge; das Providerkonto bleibt verbunden und Provider-E-Mails werden nicht verändert. Ein vollständiges Konto-Löschen ist nach Passwortbestätigung unwiderruflich und wird bei offenen Vorgängen oder ungeklärten Batch-Bereinigungen abgelehnt.
- Der Modellkatalog zeigt technische Eignung; ZDR-Routenverfügbarkeit wird beim echten Aufruf verbindlich erzwungen. Die UI stellt kein Gütesiegel oder garantierte Anbieterregion dar.
- Ein laufender externer Request kann nach Abbruch noch abgeschlossen werden. Nach einer letzten lokalen Prüfung besteht wie bei anderen verteilten Systemen ein kleines Zeitfenster vor dem Anbieteraufruf.

## Vor öffentlicher Bereitstellung

1. Eigene Testkonten aller fünf Anbieter end-to-end prüfen: Verbindung, Inhaltsanalyse, Markierungsschutz, Papierkorb, Restore, Widerruf, Ratenlimits und Timeouts. Unterstützte Serverfähigkeiten dokumentieren.
2. Google-OAuth-Verifikation und erforderliches Security Assessment abschließen; Microsoft-Tenantfreigaben klären.
3. Unabhängige Sicherheitsprüfung einschließlich Authentifizierung, privilegierter Systemdatenbankpfade, OAuth, Queue, SSRF/DKIM, Connector und Mandantentrennung.
4. Für SaaS minimale Datenbankrollen/Systemfunktionen statt breit privilegierter Verbindungsrolle, Secret-/Key-Management, Rotation und Betriebssystem-Schlüsselspeicher ergänzen.
5. MFA, Recovery, Verifikation, verteilte IP- und Nutzerquoten sowie Schutz vor Registrierungs- und Scanmissbrauch ergänzen. Die bestehende kontobezogene Loginbegrenzung verhindert keinen verteilten Registrierungsangriff.
6. Aufbewahrungsfristen, Export und vollständige Kontolöschung automatisieren; API-Cache- und Anbieterbedingungen verbindlich berücksichtigen. Der Worker entfernt abgelaufene Sessions, OAuth-Zustände und Connector-Transportpuffer. Für Nachrichtenindex und Auditdaten ist in dieser Version noch kein allgemeiner automatischer Löschlauf eingerichtet.
7. TLS-Reverse-Proxy, Security-Header inklusive noncebasierter Script-CSP, Backups, Monitoring ohne Mailinhalte, Alarmierung und Wiederherstellungstest einrichten. Die aktuelle Next.js-CSP erlaubt Inline-Skripte für das Framework.
8. Datenschutzinformationen und erforderliche Verträge zum tatsächlich gewählten Hosting-/KI-Datenfluss erstellen. ZDR ist keine Aussage über alle rechtlichen Verarbeitungs- und Aufbewahrungsausnahmen.

Keine Tokens, Abmelde-URLs, E-Mail-Texte oder Zugangsdaten in Logs übernehmen. Operator-Zugriff auf Postfachdaten auf das erforderliche Minimum begrenzen.
