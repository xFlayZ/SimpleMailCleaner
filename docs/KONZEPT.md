# SimpleMailCleaner – Produkt- und Architekturkonzept

Stand: 28.10.2026. Planungsstand, noch keine Implementierung.

## 1. Ziel und Leitentscheidungen

Eine deutschsprachige Dashboard-Anwendung hilft Nutzern, ihre Postfächer zu verstehen, Newsletter abzubestellen und unnötige Nachrichten nach ausdrücklicher Freigabe in den Papierkorb zu verschieben. Unterstützt werden sollen T-Online, Outlook, Yahoo, Gmail und Proton Mail. Self-Hosting und öffentlicher Mehrnutzerbetrieb werden von Beginn an berücksichtigt; beide nutzen denselben Kern.

Festgelegte Anforderungen:

- Next.js für die Webanwendung, PostgreSQL für persistente Daten.
- KI-Zugriff ausschließlich über OpenRouter mit einem vom jeweiligen Nutzer hinterlegten Schlüssel.
- Modellauswahl in den Einstellungen mit dynamischem Katalog und Kostenanzeige.
- Erst analysieren und empfehlen, anschließend durch den Nutzer prüfen und freigeben.
- Abmeldungen tatsächlich ausführen, soweit ein unterstützter und sicherer Mechanismus existiert.
- Inbox Zero dient als Produktinspiration; eigenständige Implementierung und eigene Sicherheitsentscheidungen.

Vorgeschlagene Produktregeln:

- Im MVP ausschließlich Papierkorb statt endgültiger Löschung; kein automatisches Leeren des Papierkorbs.
- Abmelden und Nachrichten verschieben sind zwei unabhängig freizugebende Aktionen.
- Wiederkehrender Absender bedeutet weder automatisch Newsletter noch automatisch löschbar.
- Schutzregeln und Nutzerentscheidungen haben Vorrang vor KI-Empfehlungen.
- Neue Nachrichten werden nie nachträglich in eine bestehende Freigabe aufgenommen.
- Scans und Empfehlungen dürfen automatisch aktualisiert werden; schreibende Aktionen benötigen jedes Mal eine konkrete Freigabe.

## 2. Nutzerablauf und Dashboard

### Onboarding

1. Anwendungskonto erstellen; App-Anmeldung und Postfachanbindung sind getrennte Vorgänge.
2. Postfach verknüpfen. Benötigte Berechtigungen und unterstützte Aktionen erläutern.
3. Scanbereich festlegen: Ordner, Zeitraum, maximale Nachrichtenanzahl. Vorschlag: zunächst Posteingang und letzte 90 Tage; erweiterbar.
4. Erste lokale Analyse der Metadaten starten. Dafür ist noch kein OpenRouter-Schlüssel erforderlich.
5. Eigenen OpenRouter-Schlüssel hinterlegen, Modell auswählen und Datenübermittlung erklären. KI-Analyse erst nach ausdrücklicher Aktivierung.
6. Kostenschätzung und Budget bestätigen, anschließend Inhaltsscan starten.

### Navigation

| Bereich | Inhalt |
| --- | --- |
| Übersicht | Kontostatus, Scanfortschritt, Newsletter, häufige Absender, offene Empfehlungen, KI-Kosten |
| Newsletter | Listen, Frequenz, Nachrichtenanzahl, Abmeldeverfahren, Empfehlung und Abmeldestatus |
| Absender | Wiederkehrende Absender, Kategorien, Ausnahmen und Schutzregeln |
| Prüfen & aufräumen | Nachrichtenliste, Begründungen, Auswahl, Vorschau und Freigabe |
| Aktivitätsverlauf | Freigaben, Ausführungen, Teilfehler und mögliche Wiederherstellung |
| Einstellungen | Postfächer, Schlüssel, Modell, Budget, Datenschutz, Aufbewahrung, Sicherheit |

Eine Empfehlung zeigt beispielsweise: „38 ältere Werbenachrichten dieser Liste gefunden; 31 zum Verschieben vorgeschlagen, 7 wegen möglicher Bestellinformationen zur Einzelprüfung zurückgestellt.“ Aufklappen zeigt die konkreten Nachrichten mit Datum, Betreff, Kategorie, Begründung und Schutzsignalen. Keine pauschale Freigabe anhand der Absenderdomain.

Gruppenselektion ist möglich, aber vor Ausführung werden die feste Nachrichtenanzahl, das Konto und Ausnahmen angezeigt. „Diese Liste behalten“, „Diesen Absender schützen“ und „Falsch eingeordnet“ verbessern die persönlichen Regeln. Keine globale Modellschulung mit Postfachdaten.

Anzeigen zur Größe sind Schätzwerte. In den Papierkorb verschobene Nachrichten sind nicht gleichbedeutend mit tatsächlich freigegebenem Speicherplatz.

## 3. Anbieter und reale Unterstützungsgrenzen

| Anbieter | Geplanter Zugang | Aktionen / Besonderheiten |
| --- | --- | --- |
| Gmail | Gmail API und OAuth 2.0 | Nachrichtenanalyse und explizites `trash`/`untrash`; für Aufräumen `gmail.modify`, kein Vollzugriff zur endgültigen Löschung |
| Outlook / Microsoft 365 | Microsoft Graph mit delegiertem OAuth | Lesen und Move nach `deleteditems`; `Mail.ReadWrite`; geschäftliche Tenants können zusätzliche Admin-Zustimmung verlangen |
| T-Online | IMAP über TLS, `secureimap.t-online.de:993` | Separates Passwort für E-Mail-Programme; Papierkorb und Serverfähigkeiten beim Verbinden ermitteln |
| Yahoo | IMAP über TLS, `imap.mail.yahoo.com:993`, App-Passwort | Dokumentierter Basisweg; OAuth erst nach separater Prüfung der App-Zulassung als Komfortoption |
| Proton Mail | Proton Mail Bridge und lokaler Connector | Kostenpflichtiger Proton-Tarif; Bridge läuft beim Nutzer oder in dessen eigener geeigneter Umgebung |

Die technischen Grundlagen sind in den offiziellen Dokumentationen für [Gmail-Berechtigungen](https://developers.google.com/workspace/gmail/api/auth/scopes), [Gmail-Papierkorb](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/trash), [Microsoft Move](https://learn.microsoft.com/en-us/graph/api/message-move?view=graph-rest-1.0), [T-Online](https://www.telekom.de/hilfe/apps-dienste/e-mail/posteingang-postausgang-server), [Yahoo IMAP](https://uk.help.yahoo.com/kb/SLN3697.html) und [Proton Bridge](https://proton.me/support/imap-smtp-and-pop3-setup) beschrieben.

### Proton als eigener Integrationspfad

Eine gehostete Webanwendung erreicht die Bridge auf dem Rechner des Nutzers nicht direkt. Vorgesehen ist ein kleiner lokaler Connector, der ausgehend eine authentifizierte TLS-Verbindung zur Anwendung aufbaut und lokal die Bridge anspricht. Keine öffentlich erreichbaren Bridge-Ports und keine Übermittlung des Proton-Hauptpassworts an den SaaS-Server.

Der Connector wird über ein kurzlebiges Pairing gekoppelt, an Nutzer und Konto gebunden und kann widerrufen werden. Geräteschlüssel liegen im Betriebssystem-Schlüsselspeicher. Aktionen enthalten Ablaufzeit, feste Zielnachrichten und eine signierte Freigabe. Zertifikate der Bridge werden explizit sicher eingerichtet; keine globale Deaktivierung der TLS-Prüfung. Offline-Geräte zeigen einen sichtbaren Wartestatus.

Auch bei Proton verlassen zur KI-Bewertung ausgewählte entschlüsselte Inhalte die lokale Umgebung. Das muss vor Aktivierung ausdrücklich sichtbar sein. Ein eigener Connector ist ein zusätzlich zu validierender Client; die allgemeine IMAP-Kompatibilität der Bridge ist keine Supportgarantie von Proton.

### Synchronisierung und Fähigkeiten

Jeder Adapter meldet Fähigkeiten wie `readMetadata`, `readBody`, `moveToTrash`, `restore` und optional `sendUnsubscribeMail`. Nicht verfügbare Aktionen werden deaktiviert und erklärt.

- Gmail: initiale Paginierung, danach inkrementelle Synchronisierung mit Wiederanlauf bei ungültigem Cursor.
- Graph: Delta-Synchronisierung pro Ordner; [offizielle Beschreibung](https://learn.microsoft.com/en-us/graph/delta-query-messages).
- IMAP: Konto, Ordner, UIDVALIDITY und UID bilden die Nachrichtenreferenz; Sequenznummern sind keine stabilen IDs. Fähigkeiten, SPECIAL-USE-Ordner und MOVE prüfen. Bei UIDVALIDITY-Wechsel neu abgleichen.
- IMAP-Aufräumen im MVP nur mit sicher validiertem Verschiebepfad. Kein allgemeines EXPUNGE und kein ungetesteter COPY/DELETE-Fallback, der andere gelöschte Nachrichten erfassen könnte.
- Labels und Ordner müssen anbieterspezifisch erhalten bleiben; eine Gmail-Nachricht kann mehrere Labels haben und darf nicht mehrfach als unabhängige Nachricht gezählt werden.
- Ratenlimits, Backoff, Kontosperren gegen konkurrierende Änderungen und Fortsetzung nach Abbruch gehören zum Kern.

## 4. Analyse und KI-Bewertung

### Stufe A: Regeln und Metadaten

Header und Metadaten auswerten: Absenderadresse, List-ID, List-Unsubscribe, Datum, Ordner/Labels, Größe, Lesestatus soweit verfügbar, Markierungen und Thread-Beziehungen. Newsletter eher anhand der Listenidentität gruppieren; reine Domain-Gruppierung könnte Werbung und Rechnungen desselben Unternehmens vermischen.

Ermitteln: häufige Absender, Empfangsfrequenz, Altersverteilung, wiederkehrende Betreffmuster und mögliche Listen. Metadaten sind selbst personenbezogene Daten und werden entsprechend geschützt. Wiederholte Vollscans vermeiden.

### Stufe B: KI für geeignete Inhalte

Zunächst repräsentative Stichproben zur Gruppenkategorisierung; daraus entsteht noch keine pauschale Löschfreigabe. Für konkrete Aufräumvorschläge wird jede Zielnachricht entweder individuell bewertet oder nach einer ausdrücklich definierten, nachvollziehbaren Nutzerregel erfasst. Nicht geprüfte Nachrichten bleiben erkennbar ungeprüft.

Minimierte Texte statt kompletter MIME-Nachrichten übertragen: bereinigter Betreff und erforderlicher Textausschnitt, bei Bedarf mehr Kontext. HTML, Tracking, Binäranhänge und eingebettete Bilder nicht an die KI geben. Adressen soweit möglich durch lokale Referenzen ersetzen. Kürzungen sichtbar machen; bei unzureichendem Kontext zur Prüfung zurückstellen.

Vorgeschlagenes validiertes Ergebnis:

```text
message_ref, category, recommended_action,
reason_codes, short_explanation, risk_flags,
needs_human_review, evidence_refs
```

Kategorien: Newsletter, Werbung, Benachrichtigung, persönliche Nachricht, Rechnung/Vertrag, Sicherheit, unklar. Aktionen: behalten, manuell prüfen, Papierkorb vorschlagen. Abmeldeempfehlungen werden separat an Listen geführt.

Rechnungen, Verträge, Sicherheitsmeldungen, persönliche Konversationen sowie markierte oder vom Nutzer geschützte Nachrichten werden standardmäßig aus Sammelaktionen herausgenommen. Anhänge gelten als Prüfhinweis, nicht automatisch als Löschgrund. Lesestatus ist ein schwaches Signal; „gelesen“ bedeutet nicht „unwichtig“.

Das Modell hat keine Mail-, Browser- oder Ausführungstools. E-Mail-Texte sind untrusted input. Schemafehler, unbekannte Nachrichtenreferenzen und widersprüchliche Ergebnisse führen zu keiner ausführbaren Empfehlung. Eine Selbsteinschätzung des Modells wird nicht als verlässliche Wahrscheinlichkeit angezeigt.

### Qualitätssicherung

Vor realem Betrieb einen manuell annotierten, synthetischen oder ausdrücklich bereitgestellten Testkorpus verwenden. Insbesondere falsch empfohlene wichtige Nachrichten, gemischte Absender, Prompt-Injection und verschiedene Sprachen prüfen. Die Fehlerrate bei wichtigen Nachrichten ist relevanter als möglichst viele Löschvorschläge. Ein Modellwechsel kann erneute Qualitätstests erfordern; vorhandene Freigaben werden dadurch nicht erweitert.

## 5. Tatsächliche Newsletter-Abmeldung

Priorität der Verfahren:

1. RFC-8058-One-Click über HTTPS POST bei gültigen, ausreichend authentifizierten Headern. Der Standard verlangt Nutzerzustimmung und DKIM-Abdeckung der betreffenden Header: [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html).
2. `mailto:`-Abmeldung: unterstützter, fest vorgegebener Versand mit separat erklärter Sendeberechtigung bzw. SMTP-Zugang. Empfänger, Betreff und Inhalt prüfen; kein allgemeiner Mailversand durch KI. Optional nach dem ersten MVP.
3. Normale Abmelde-Webseite: Nutzer zu einer geprüften Adresse führen. Formulare, Login oder CAPTCHA erfordern gegebenenfalls manuelle Schritte. Kein Versprechen vollständiger Automatisierung.

Die KI erzeugt weder Ziel-URLs noch HTTP-Anweisungen. Ein deterministischer Dienst liest das Verfahren aus der Nachricht. Unglaubwürdige oder nicht ausreichend authentifizierte Abmeldeangebote werden nicht automatisch ausgeführt. Bei mutmaßlichem Spam kann die Empfehlung „nicht reagieren“ lauten.

Ein isolierter HTTP-Client schützt gegen SSRF: HTTPS, keine privaten/Loopback/Link-local-Adressen oder Cloud-Metadatenziele, DNS-Prüfung auch beim Verbindungsaufbau, keine Cookies oder Zugangsdaten, enge Zeit-/Größenlimits. RFC-8058-POSTs folgen keinen Redirects. Signierte Abmelde-URLs werden als vertrauliche Daten behandelt und nicht geloggt.

Status: vorgeschlagen → freigegeben → Anfrage gesendet → vom Endpunkt angenommen / fehlgeschlagen / Ergebnis unklar / manuell erforderlich. Eine HTTP-2xx-Antwort beweist keine dauerhafte Abmeldung. Bestätigungsmails oder spätere Zustellbeobachtungen liefern weitere Hinweise; ausbleibende Nachrichten sind kein sicherer Nachweis. Abmeldungen besitzen keine allgemeine Rückgängig-Funktion.

## 6. Freigabe und sichere Ausführung

Die KI erzeugt Empfehlungen. Ein eigener Dienst erstellt daraus einen unveränderlichen Aktionsplan. Der Nutzer gibt exakt diesen Plan frei.

Freigaben enthalten Nutzer, Konto, Aktionstyp, konkrete Nachrichten-/Listenreferenzen, Planversion/Hash, Anzahl und Ablaufzeit. Eine Gruppenauswahl wird vor Freigabe in feste Zielobjekte aufgelöst. Später eingehende E-Mails sind ausgeschlossen. Veränderte Schutzregeln, neue relevante Nachrichtenzustände oder abgelaufene Pläne führen zu erneuter Prüfung.

Zustandsfolge: `proposed → approved → queued → executing → succeeded | partial | failed | unknown | cancelled`. Jede einzelne Aktion hat zusätzlich ihren eigenen Zustand. Freigabe und Einplanung erfolgen atomar, beispielsweise über eine transaktionale Outbox.

Unmittelbar vor Ausführung prüft der Worker erneut Identität, Kontozugehörigkeit, Freigabegültigkeit, Zielzustand und Schutzregeln. Nutzeridentität niemals ungeprüft aus Browser- oder Jobparametern übernehmen. Datenbankberechtigungen und Anwendungskontrollen verhindern Zugriffe zwischen Nutzern.

Externe Mailaktionen sind nicht atomar mit PostgreSQL und bieten nicht überall Idempotency-Keys. Deshalb: interne Idempotenzschlüssel, Sperren und Abgleich des Anbieterzustands nach Timeouts. Nicht blind wiederholen, wenn ein Request möglicherweise erfolgreich war. Teilfehler pro Nachricht anzeigen. Bereits ausgeführte Aktionen bleiben protokolliert; Abbruch stoppt verbleibende Aktionen.

Wiederherstellung speichert soweit erforderlich Originalordner, Labels und zurückgegebene neue IDs. Sie ist nur möglich, solange die Nachricht noch beim Anbieter existiert. Anbieter können den Papierkorb unabhängig von uns automatisch leeren; deshalb keine garantierte Wiederherstellungsfrist versprechen.

## 7. Architektur und Betrieb

Vorschlag: modularer Monolith mit getrennt betriebenem Worker; zunächst keine Microservice-Landschaft.

```text
Browser → Next.js Web/API → PostgreSQL
                    ↓            ↑
              persistente Jobs → Worker
                                 ├─ Gmail / Graph / IMAP
                                 ├─ OpenRouter
                                 └─ isolierter Abmeldedienst

Proton Bridge ← lokaler Connector → authentifizierte Serververbindung
```

| Baustein | Vorschlag / Zweck |
| --- | --- |
| Web/API | Next.js, TypeScript, serverseitige Autorisierung |
| UI | Tailwind und zugängliche Komponenten, responsive Tabellen und Detailansicht |
| Daten | PostgreSQL, Prisma für Schema und Migrationen; RLS über eigene SQL-Migrationen |
| Jobs | PostgreSQL-basierte Queue, z. B. pg-boss; langlebiger Node.js-Worker |
| KI | Serveradapter zu OpenRouter, strukturierte Antworten mit Schema-Validierung |
| Mail | Getrennte Gmail-, Graph- und IMAP-Adapter |
| Betrieb | Docker Compose für Self-Hosting; getrennte Web-/Worker-Prozesse für SaaS |

[pg-boss](https://github.com/timgit/pg-boss) ist eine mögliche PostgreSQL-basierte Queue. Eine Queue allein garantiert keine einmalige Ausführung externer Mailaktionen. Redis ist im ersten Entwurf nicht erforderlich. Konkrete Bibliotheksversionen werden beim Implementierungsstart auf Wartung, Kompatibilität und Sicherheit geprüft.

Scan und IMAP-Verbindungen gehören in langlebige Worker, nicht in zeitlich begrenzte HTTP-Requests. Hosting muss ausgehendes TCP für IMAP und ausreichend lange Prozesse erlauben. Next.js kann separat gehostet werden, benötigt aber immer den Workerpfad.

Self-Hosting erhält dasselbe Datenmodell und dieselben Sicherheitsprüfungen, eigene OAuth-Client-Konfiguration, Secret-Konfiguration und Backup-Anleitung. SaaS ergänzt Registrierung, Nutzerisolierung, Quoten, Missbrauchsschutz, Supportprozesse und zentrale Betriebsüberwachung. Öffentliche Registrierung erst nach Erfüllung der Freigabekriterien aktivieren.

## 8. Datenmodell und Geheimnisse

| Entität | Wesentliche Inhalte |
| --- | --- |
| users / sessions | Nutzer und Anwendungssitzungen |
| mail_accounts / credentials | Eigentümer, Anbieter, Fähigkeiten, verschlüsselte Tokens/App-Passwörter |
| folders / sync_cursors | Ordner-/Labelreferenzen, Synchronisierungsstände |
| message_index | Minimale Metadaten und stabile Anbieterreferenzen, keine dauerhafte Vollkopie |
| sender_groups / mailing_lists | Gruppierungen, Listenidentität und Statistiken |
| scan_runs / analyses | Scanbereich, Status, Modell-/Promptversion, Klassifikation |
| recommendations | Ziele, Begründung, Schutzsignale und Prüfstatus |
| action_plans / approvals / action_items | Feste Auswahl, Freigabe und Einzelausführung |
| unsubscribe_attempts | Verfahren, Ergebnis und nötige manuelle Schritte |
| user_rules | Geschützte Absender, Ausnahmen und persönliche Korrekturen |
| user_ai_settings / encrypted_secrets | Persönliches Modell, genau ein aktiver OpenRouter-Schlüssel, Budget |
| model_catalog / usage_events | Öffentliche Modelldaten, Preisstände, Tokenverbrauch und Kosten |
| connector_devices / audit_events | Gerätekopplung und inhaltsarme Aktionshistorie |

Jede nutzerbezogene Entität hat eine verifizierte Eigentümerzuordnung. Zusammengesetzte Fremdschlüssel verhindern konto- oder nutzerübergreifende Referenzen. Row Level Security dient als zusätzliche Schutzschicht; Web- und Workerrollen dürfen sie nicht pauschal umgehen. Nutzerkontext innerhalb einer Transaktion setzen, damit Connection-Pooling keine Identität weiterreicht. Hintergrundjobs unterliegen denselben Eigentumsprüfungen.

OpenRouter-Schlüssel, Refresh-Tokens und App-Passwörter werden anwendungsseitig authentifiziert verschlüsselt gespeichert, etwa über Envelope Encryption. Der Hauptschlüssel liegt außerhalb der Datenbank; SaaS verwendet einen Secret-/Key-Management-Dienst, Self-Hosting separat bereitgestellte Secrets mit dokumentierter Rotation. Verschlüsselte Backups schützen keinen gemeinsam abgelegten Entschlüsselungsschlüssel.

Nach dem Speichern zeigt die Oberfläche nur einen maskierten Status. Schlüssel werden weder zurückgegeben noch in localStorage abgelegt oder geloggt. Schlüsselwechsel stoppt beziehungsweise invalidiert wartende KI-Jobs der alten Schlüsselversion. Kein Rückfall auf einen fremden Nutzerschlüssel oder einen gemeinsamen Betreiber-Key.

Aufbewahrungsentwurf: Rohtexte nur während des benötigten Analysevorgangs im Arbeitsspeicher; keine Mailinhalte in Job-Payloads. Ein optionaler verschlüsselter Kurzzeitcache erhält eine explizite TTL. Metadaten/Analysen werden zweckgebunden befristet gehalten und bei Kontotrennung gelöscht. Konkrete TTLs sind vor Implementierung mit den Anbieterbedingungen abzugleichen; API-Cache-Vorgaben haben Vorrang. Auditdaten bleiben minimal und ebenfalls befristet. Löschläufe und Backup-Auslauf sind Bestandteil des Löschkonzepts.

## 9. OpenRouter: Modellkatalog, Kosten und Datenschutz

Der Katalog kommt dynamisch aus der [Models API](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties). Sämtliche Seiten abrufen; öffentliche Modelldaten kurz cachen, beispielsweise eine Stunde. Aktualisierungszeit anzeigen und vor einem Scan erneut validieren.

Das Dropdown erhält Suchfunktion und zeigt Name/ID, Input- und Outputpreis in USD je 1 Mio. Tokens, Kontextfenster, Text-/Strukturausgabe-Fähigkeiten und Datenschutzkompatibilität. Alle im Katalog gelieferten Modelle bleiben auffindbar; ungeeignete oder unter den gewählten Datenschutzregeln nicht nutzbare Modelle sind mit Begründung deaktiviert. Tatsächliche Verfügbarkeit mit dem Nutzerschlüssel muss separat geprüft werden. Bei entfernten Modellen keine stille Ersetzung.

Kostenanzeige: API-Tokenpreise korrekt in die Anzeigeeinheit umrechnen; zusätzliche Preisfelder, Cache- und Reasoning-Abrechnung soweit vorhanden berücksichtigen. Keine feste Aussage „Preis pro E-Mail“. Vorab eine Bandbreite aus Umfang, Tokenabschätzung und Ausgabelimit anzeigen. Danach gemeldeten Verbrauch und tatsächliche Requestkosten erfassen; falls nicht verfügbar, Werte als Schätzung kennzeichnen. Preisstand und Modell je Lauf speichern.

Budget pro Scan und Monat, begrenzte Parallelität und Reservierung des maximal geplanten Verbrauchs verhindern starke Überschreitungen durch gleichzeitig laufende Jobs. Ein App-Budget ist keine Abrechnungsgarantie des Anbieters; ergänzende Schlüsselgrenzen bei OpenRouter empfehlen. Fremdaufrufe desselben Schlüssels sind nicht in unserem App-Verbrauch enthalten. Plattformgebühren/Steuern getrennt von Modell-Inferenzkosten erklären: [OpenRouter Pricing](https://openrouter.ai/pricing).

KI-Anfragen nutzen standardmäßig `provider.zdr: true` und `provider.data_collection: "deny"`, soweit verfügbar und mit dem Konto nutzbar. Keine geeignete Route bedeutet Abbruch statt stiller Lockerung. Die Regeln gelten auch bei Provider-Fallbacks. Keine Trainingsfreigabe oder Promptprotokollierung durch die Anwendung.

Diese Steuerung ist keine pauschale Zusage, dass überhaupt keine Verarbeitung oder gesetzlich bedingte Speicherung stattfindet. OpenRouter beschreibt eigene Verarbeitung, Metadaten und Ausnahmen in der [Datensammlungsdokumentation](https://openrouter.ai/docs/guides/privacy/data-collection). Datenregion, Vertragsbedingungen und Unterauftragnehmer müssen gesondert geprüft werden; ein EU-Server unserer App macht externe KI-Verarbeitung nicht automatisch EU-intern. Die genauen Voraussetzungen für regionale Routen werden vor Freigabe anhand des konkreten Tarifs geprüft.

## 10. Sicherheits- und Veröffentlichungsgrenzen

- Mail-HTML nur bereinigt und isoliert darstellen; externe Bilder und Tracking standardmäßig blockieren.
- CSRF-Schutz, sichere Cookies, Sitzungsrotation, OAuth-State/PKCE soweit unterstützt, Widerruf und zusätzliche Bestätigung bei sensiblen Kontoeinstellungen.
- Größenlimits und Parserisolation für MIME; Anhänge im MVP nicht analysieren oder ausführen.
- Verbindungsziele aus Providerprofilen; generische IMAP-Hosts erst mit eigener SSRF-/Netzwerkprüfung anbieten.
- Logs ohne Betreff, Nachrichtentext, Zugangsdaten oder Abmelde-Token; keine Inhalte in Fehler-Tracking/Analytics.
- Quoten pro Nutzer und Konto; Scanabbruch und globaler Stopp schreibender Aktionen im Betrieb.
- Getestete Wiederherstellung verschlüsselter Backups und eingeschränkter administrativer Zugriff.

Für Gmail sind selbst lesende Metadatenbereiche eingeschränkt. Ein öffentlicher Serverbetrieb mit Speicherung/Übertragung eingeschränkter Daten erfordert grundsätzlich OAuth-Verifikation und ein Security Assessment, soweit keine Ausnahme greift. Das ist ein eigener Launchpfad mit externer Abhängigkeit: [Google-Verifikation](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

Die Übermittlung an OpenRouter und nachgelagerte Anbieter muss dem erklärten Nutzerzweck, der Zustimmung und Googles Limited-Use-Anforderungen entsprechen. Keine Nutzung für allgemeines Modelltraining. Konkreten Datenfluss und Speicherung vor Launch prüfen: [Google Workspace User Data Policy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).

Für öffentlichen Betrieb sind außerdem ein dokumentiertes Datenschutz-/Löschkonzept und die erforderlichen Verträge/Informationen für Hosting und KI-Verarbeitung auszuarbeiten. Ob und welche zusätzlichen rechtlichen Prüfungen erforderlich sind, wird anhand des tatsächlichen Betriebs geklärt; diese Planung ist keine rechtliche Freigabe.

## 11. Eigenständigkeit gegenüber Inbox Zero

Das [Referenzprojekt](https://github.com/elie222/inbox-zero) zeigt unter anderem Newsletter-Abmeldung, Sammelarchivierung und E-Mail-Analysen. Diese Produktideen dienen als Vergleich für den Nutzungsablauf. Keine Übernahme von Quellcode, Prompts, Assets oder projektspezifischen Implementierungen.

Die derzeitige [Lizenzdatei](https://github.com/elie222/inbox-zero/blob/main/LICENSE) nennt AGPLv3 mit zusätzlichen kommerziellen und Enterprise-Bedingungen. Daraus wird hier keine rechtliche Detailbewertung abgeleitet. Der eigenständige Ansatz vermeidet eine Abhängigkeit von diesem Code. Eine bloße Neuimplementierung macht das Produkt noch nicht sicher; entscheidend sind Zugriffstrennung, Datenminimierung, Tests und überprüfbare Freigaben.

## 12. Umsetzungsetappen und Abnahmekriterien

### Etappe 0: Machbarkeit und Sicherheitsentwurf

Kleine technische Versuche mit eigenen Testpostfächern: T-Online/Yahoo-IMAP inklusive sicherem MOVE und Wiederherstellung, Gmail-/Graph-Berechtigungen, OpenRouter-Modellkatalog und Datenschutzrouting, Proton Bridge samt Connector-Pairing. Dazu Datenflussdiagramm und Bedrohungsmodell. SaaS-Google-Verifikation früh anstoßen. Ergebnis: überprüfte Anbietermatrix und konkretisierte Aufwandsschätzung.

### Etappe 1: Anwendungskern und erste vollständige Integration

Next.js, Anmeldung, PostgreSQL, Mandantentrennung, Secrets, Worker, Scanfortschritt und Testdaten. T-Online als vorgeschlagene erste vertikale Integration, da IMAP für mehrere Zielanbieter wiederverwendbar ist. Metadatengruppierung zunächst vollständig lesend; beide Betriebsformen in der Konfiguration berücksichtigen.

### Etappe 2: KI und Aufräumen

Nutzerschlüssel, Modelldropdown mit Preisen, Budget, minimierte Inhaltsanalyse, Schutzregeln, feste Aktionspläne, Freigabe, Papierkorb, Teilfehler und Wiederherstellung. Sicherheitskritische Pfade anhand simulierter Providerfehler und echter Testnachrichten prüfen.

### Etappe 3: Weitere Standardanbieter und Abmeldungen

Yahoo über IMAP, Gmail über API, Outlook über Graph; Reihenfolge nach Integrationsergebnissen und OAuth-Verfügbarkeit. RFC-8058-Abmeldungen tatsächlich ausführen, sichere manuelle Fallbacks anzeigen. Mailto-Versand optional separat ergänzen. Anbieter nicht allein aufgrund einer gemeinsamen Adapterklasse als vollständig unterstützt kennzeichnen.

### Etappe 4: Proton und öffentliche Freigabe

Lokalen Connector ausliefern und widerrufbare Kopplung, Offline-Verhalten sowie lokale Aktionsprüfung testen. SaaS-Betriebshärtung, Anbieterfreigaben, Datenschutzprozesse, Backups und Betriebsüberwachung abschließen. Proton wird erst nach validiertem Connector als unterstützt angeboten; alle fünf Anbieter bleiben Zielumfang der ersten vollständigen Produktversion.

Verbindliche Abnahmekriterien:

1. Ohne gültige, passende Freigabe ist keine Mailmutation und keine Abmeldung möglich – auch bei direktem API-Aufruf.
2. Nutzer A kann weder Daten noch Schlüssel, Jobs oder Aktionen von Nutzer B lesen oder verwenden.
3. Freigegebene Mengen bleiben fest; neue Nachrichten und geänderte Pläne sind ausgeschlossen.
4. Wiederanlauf, Timeouts und doppelte Jobs erzeugen keine unkontrollierten Wiederholungen; unklare externe Ergebnisse werden abgeglichen.
5. Schutzregeln stoppen die Ausführung auch bei anderslautender KI-Empfehlung.
6. Prompt-Injection, manipulierte Header, XSS und interne Abmeldeziele führen zu keiner unzulässigen Aktion.
7. Jeder freigegebene Anbieter besteht Lesen, Synchronisierung, Papierkorb, Teilfehler und Wiederherstellung unter realen Testbedingungen.
8. Schlüsselrotation, Kontotrennung, Datenlöschung und Wiederherstellung aus Backup funktionieren nachvollziehbar.
9. Modellkatalog zeigt Preisstand und Kompatibilität; bei Datenschutz-/Budgetproblemen wird kein stiller Fallback ausgeführt.

## 13. Offene Produktentscheidungen

Die Planung kann mit den vorgeschlagenen Standards fortgeführt werden. Vor Umsetzung zu konkretisieren: erstes reales Testpostfach, bevorzugte SaaS-Hostingregion, gewünschte Anmeldung/MFA, unterstützte Connector-Betriebssysteme und konkrete Aufbewahrungsfristen. Eine belastbare Kalender-/Kostenplanung folgt nach Etappe 0; OAuth-Verifikation und Sicherheitsprüfungen werden separat vom Entwicklungsaufwand betrachtet.
