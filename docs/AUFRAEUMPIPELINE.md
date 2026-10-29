# Bestand günstig und gezielt neu bewerten

Empfohlener Ablauf: **Dashboard → Metadaten importieren**, danach **Aufräumen → Bestand neu bewerten**. Bereits erfasste Daten werden verwendet; kein erneuter Postfachabruf ist erforderlich. Der Inhaltsscan bleibt eine gesonderte Funktion.

## Drei Stufen

1. **Lokale Regeln:** Absenderschutz, Markierungen, Anhänge, wichtige Unterlagen, Sicherheits- und Antwortbetreffzeilen sowie Ausschlussbegriffe schützen Nachrichten. Alter, Lesestatus und erlaubte Kategorien steuern Vorschläge. Häufigkeit allein genügt nicht. Newsletter-Signale stammen aus Listenheadern und eindeutigen Werbemerkmalen.
2. **Muster:** Nur verbleibende Nachrichten desselben Kontos und Absenders mit demselben Listen- und normalisierten Betreffmuster teilen sich eine Bewertung. Zahlen, Datum und technische IDs werden normalisiert. Bis zu drei Betreffbeispiele repräsentieren ein Muster. Unterschiedliche Themen bleiben getrennt. Gruppierung kann deaktiviert werden.
3. **Optionale KI:** Standardmäßig gehen nur nicht lokal entschiedene und nicht passend gecachte Muster an die KI. Kompakte nummerierte Ergebnisse enthalten eine Entscheidung je Muster. Fehlende, doppelte oder fremde Referenzen werden abgewiesen. Unsichere Aufräumvorschläge bleiben zur Prüfung. Cache pro Nutzer, Modell, Kriterien und Muster: maximal 30 Tage.

## Optionale Prüfmodi

- **Gruppierte KI** bleibt der sparsame Standard. Feste Kriterien, persönliche Regeln und Schutzgründe werden zuerst lokal angewendet. Nur übrige Muster werden an die KI gesendet; passende Cache-Ergebnisse können wiederverwendet werden.
- **Hybrid · lokale Entscheidung prüfen** lässt die KI nach der lokalen Vorbewertung auch deren Behalten- und Löschvorschläge prüfen. Ähnliche Nachrichten bleiben gruppiert. Explizite Kriterien und bestätigte persönliche Regeln bleiben verbindlich. Metadaten geschützter Nachrichten können mit Einwilligung für die Zweitprüfung übertragen werden; bei einem KI-Widerspruch wird höchstens eine manuelle Prüfung vorgeschlagen. Der Schutz bleibt aktiv. Der Cache ist aus, damit die Vorentscheidung tatsächlich neu geprüft wird.
- **Voll-KI · jede Nachricht einzeln** überspringt lokale Heuristik-Entscheidungen und erzeugt eine einzelne Bewertung für jede Nachricht, die nicht durch feste Kriterien oder persönliche Regeln ausgeschlossen wurde. Auch geschützte Metadaten können zur Prüfung übertragen werden. Ein KI-Vorschlag hebt den Schutz niemals auf. Der Cache und die Betreffgruppierung sind aus; dies kann deutlich teurer sein.

Alle Modi verwenden nur Absender, Betreff und Empfangsalter, keinen Nachrichtentext. Mindestalter, Lesestatus, Ein-/Ausschlussbegriffe und bestätigte persönliche Regeln bleiben Grenzen. Vorschau, KI-Anzahl, Anfragen und Kostenspanne werden vor Freigabe angezeigt. Eine Bewertung verschiebt keine E-Mail; dafür ist weiterhin eine separate Freigabe erforderlich.

„High / medium / low“ ist keine kalibrierte Wahrscheinlichkeit. Es gibt weder eine garantierte Newsletter-Erkennung noch eine gewünschte Löschquote. Wenige Vorschläge können sachlich richtig sein. Filter und Kriterien helfen bei der gezielten Entscheidung.

## Kosten und Betriebsarten

| Modus | Kosten / Datenverarbeitung |
| --- | --- |
| Lokale Regeln | Keine KI-Kosten, keine Übermittlung |
| Gruppierte KI im Worker | Standardtarif; ZDR und Ausschluss von Datensammlung werden angefordert |
| Anbieter-Batch | Nur bei vorhandener `:batch`-Preisvariante; gesonderte Einwilligung ohne ZDR |
| Hybrid / Voll-KI | Frische Zweitprüfung ohne Muster-Cache; Voll-KI bewertet jede zugelassene Nachricht einzeln und ist meist am teuersten |

Ein Worker oder das Sammeln von HTTP-Anfragen senkt nicht automatisch die Tokenkosten. Lokale Entscheidungen, gemeinsame Musterbewertung, kompakte Ein-/Ausgaben und Cache-Treffer sparen Token. Bei 12.000 gleichen, nur durchnummerierten Testbetreffzeilen reicht ein Muster. Bei 12.000 unterschiedlichen Themen ist die Einsparung geringer. Das Testbeispiel ist keine Prognose für ein konkretes Postfach.

Die kostenlose Vorschau zeigt eingefrorene Auswahl, lokale Vorschläge, Muster, Cache-Treffer, geplante Anfragen, Kostenspanne und konservative Reservierung. Preise stammen in USD aus dem Modellkatalog; keine garantierte Rechnung oder automatische Euro-Umrechnung. Lauf-/Monatsbudget werden vor Versand geprüft und nie automatisch erhöht. Routing und zusätzliche Tokenarten können die tatsächliche Rechnung beeinflussen.

Der native [OpenRouter-Batch](https://openrouter.ai/docs/batch-quickstart) benötigt keinen zweiten Gemini-Schlüssel. Eingaben und Ergebnisse werden standardmäßig bis zu 30 Tage aufbewahrt; die Batch-Infrastruktur ist US-basiert und nicht ZDR-fähig. Die Verarbeitung kann Stunden dauern, bei einzelnen Routen bis 96 Stunden. Nach Verarbeitung fordert der Worker die Löschung des Remote-Batches an. Anbieter unterstützen die Löschung eigener Batch-Datensätze unterschiedlich; der Verlauf unterscheidet bestätigte Löschung, nicht unterstützte Upstream-Löschung und unklaren Zustand. Abrechnungs-/Auditdaten können bestehen bleiben.

Es gibt derzeit keinen Remote-Abbruch. **Übernahme stoppen** beendet nur das Anwenden von Ergebnissen. Übermittelte Aufträge können weiterlaufen und Kosten verursachen. Schlüsselwechsel können Abruf und Löschung verhindern; dann ist das OpenRouter-Konto manuell zu prüfen. Nach unklarer Übermittlung erfolgt kein automatischer zweiter POST. Bekannte Remote-IDs werden weiter abgefragt und Löschanforderungen bei vorübergehenden Fehlern wiederholt.

## Arbeitsliste

- Serverseitige Suche, Seiten mit 25/50/100 Nachrichten und Kennzahlen über den gesamten erfassten Bestand.
- Filter: Postfach, Kategorie, Empfehlung, Newsletter, Lesestatus, Anhänge, Schutz, Bewertungsquelle, Zeitraum, Absender. Sortierung nach Datum, Absender und Größe.
- Kriterienprofile, vorsichtige/ausgewogene/gründliche Voreinstellungen, eigene Begriffe, Kategorien und Mindestalter.
- Neubewertung aller Filtertreffer bis zur eingestellten Grenze (maximal 50.000) oder nur expliziter Auswahl. Vorschau gültig 15 Minuten.
- Manuelle Bewertungen ändern ausschließlich Empfehlungen. CSV-Export bis 50.000 Zeilen mit Maskierung von Tabellenformeln.
- Auswahl bleibt über Seiten erhalten, maximal 100 Nachrichten pro Aktionsfreigabe. Papierkorb und Abmeldung brauchen eigene Freigaben.

Neubewertungen speichern konkrete IDs und Versionen. Neue Nachrichten werden nicht nachträglich aufgenommen; seit der Vorschau geänderte Nachrichten werden übersprungen. Schutzregeln werden vor der Übernahme erneut geprüft. PostgreSQL-RLS und zusammengesetzte Fremdschlüssel sichern Nutzer- und Kontogrenzen.

## Manuell löschen und Sammelaktionen

Unter **Newsletter** und **Aufräumen** gibt es „Alle Newsletter-E-Mails löschen“. In Absender-/Newslettergruppen, jeder Nachrichtenzeile und der Textvorschau lässt sich die gesamte Post dieses exakten Absenders auswählen. Die Nachrichtenzeile öffnet die Sammelvorschau; die Textvorschau bietet zusätzlich „Diese E-Mail löschen“. Auch markierte Nachrichten mit Empfehlung „Behalten“ können ausdrücklich für den Papierkorb freigegeben werden. Die Empfehlung allein ist keine Sperre. Schutzmerkmale und geschützte Absender bleiben davon getrennt und werden weiter berücksichtigt.

„Nach Datum löschen“ wählt Nachrichten **vor Beginn des gewählten Tages** anhand des Empfangsdatums aus. Der Stichtag lässt sich zusätzlich auf Newsletter und Absenderaktionen anwenden. „Auch Behalten einschließen“ kann deaktiviert werden. Die Auswahl umfasst den erfassten Index, keine noch nicht importierten Nachrichten. Ein Datumsauftrag ist eine einmalige Auswahl, keine automatisch wiederkehrende Löschregel.

Sammelvorschauen zeigen Gesamtzahl, geschützte oder bereits aktive/unklare Einträge, Behalten-Anteil und alle betroffenen Postfächer. Bis zu 50.000 konkrete Nachrichten werden eingefroren; die Anzeige der ersten 100 ist ausdrücklich nur eine Vorschau. Bei mehr Treffern muss eingegrenzt werden. Freigabe innerhalb von 15 Minuten, danach maximal 24 Stunden Ausführungszeit für große Aufträge. Neue oder geänderte Nachrichten werden nicht stillschweigend aufgenommen. Nach Freigabe arbeitet der Worker im Hintergrund; im Aktivitätsverlauf kann die weitere Ausführung gestoppt werden. Keine endgültige Löschung und keine gleichzeitige Abmeldung.

Migration 004 ergänzt manuelle Freigaben. `npm run test:bulk` prüft diese mit isolierten Daten und simulierten Mail-Adaptern.

## Kategorien und Schutz selbst festlegen

„Kategorie / Schutz bearbeiten“ steht in der Nachrichtenzeile, Textvorschau, bei einer markierten Auswahl und an Absendergruppen zur Verfügung. Der Dialog lädt eine eingefrorene Auswahl mit Nachrichtenversionen, zeigt Anzahl und Schutzanteil und erlaubt getrennte Änderungen an Kategorie, Empfehlung und Schutz. Bei zwischenzeitlichen Änderungen werden betroffene Nachrichten übersprungen. Maximal 100 explizit markierte bzw. 50.000 aktuelle Nachrichten eines exakten Absenders lassen sich bearbeiten.

**Schutz auf eigene Gefahr aufheben** erfordert eine eigene Bestätigung. Die Ausnahme gilt pro konkreter Nachricht und übergeht auch Absenderschutz, Anhänge, Markierungen und automatische Betreff-Schutzregeln bei späteren Papierkorb-Aufträgen. Anbieter-Markierungen und Anhänge selbst werden nicht verändert. Neue Nachrichten erben diese Ausnahme nicht. Eine Ausnahme auf Nachrichtenebene hat Vorrang vor einer Absenderregel; zum Zurücknehmen im selben Dialog „Nachrichten schützen“ wählen. Das Bearbeiten selbst verschiebt noch keine Nachricht. Bestehende Freigaben werden durch die Versionsänderung ungültig.

## Eigene KI-Anweisung

Das optionale Feld im Neubewertungsdialog akzeptiert bis zu 2.000 Zeichen, beispielsweise: „Nachrichten mit 10% Rabatt oder ähnlichen Werbeangeboten als Werbung und Aufräumvorschlag bewerten.“ Die Anweisung wird als Nutzerpräferenz getrennt von den unvertrauenswürdigen E-Mail-Metadaten übermittelt. Ausgabeformat, Datenschutzvorgaben, Kategorienfreigaben und Aktionsbestätigungen bleiben verbindlich.

Mit eigener Anweisung werden auch die sonst lokal als Werbung entschiedenen Muster der KI vorgelegt. Schutz, Mindestalter, Lesestatus und Ausschlussbegriffe werden weiterhin zuerst lokal geprüft. Schutz gegebenenfalls zuvor ausdrücklich für die gewünschten Nachrichten aufheben. Im reinen lokalen Modus wird der Freitext nicht interpretiert. Das zusätzliche Promptvolumen fließt in die Kostenvorschau ein; eine geänderte Anweisung erzeugt einen anderen Cache-Schlüssel und kann zusätzliche KI-Kosten verursachen. Profile speichern die Anweisung mit. Eine spätere Neubewertung kann manuelle Kategorien/Empfehlungen neu bewerten, hebt aber keine manuell gesetzte Schutzentscheidung stillschweigend auf.

## Aktivitätsverlauf

Der Verlauf lädt alle gespeicherten Vorgänge serverseitig in eine gemeinsame Zeitachse: Importe/Inhaltsscans, Neubewertungen, Papierkorb, Wiederherstellung und Abmeldung. Suche nach Beschreibung/Postfach/Modell, Filter nach Vorgangsart und Status, Sortierung nach Erstellungszeit oder Prüfbedarf und Seitenwechsel sind unabhängig von den kleinen Dashboard-Vorschauen. Nicht freigegebene Papierkorb-Vorschauen erscheinen nicht als laufende Aktionen. Zusätzliche Protokollnotizen können eingeblendet werden, damit Freigabe-/Abschlussmeldungen die eigentlichen Vorgänge nicht doppeln.

Für Mail-Aktionen gibt es eine eigene paginierte Ergebnisliste mit Statusfilter (erfolgreich, ausstehend, fehlgeschlagen, unklar). Fortschritt und Fehler werden laufend aktualisiert. Stoppen bleibt möglich; bei Anbieter-Batches betrifft es weiterhin nur die Ergebnisübernahme.

## Betrieb und Prüfung

`npm run db:migrate` wendet die Migrationen einschließlich 003 und 004 an. Danach Webanwendung und Worker neu starten. Das Update allein startet keine echte KI-Neubewertung und verschiebt keine Nachricht.

`npm test`, `npm run test:integration`, `npm run test:scans`, `npm run test:reviews` und `npm run test:review-api` prüfen synthetische Daten und simulierte KI-Antworten. Echte kostenpflichtige Provider-Aufträge und Postfachmutationen sind nicht Teil dieser Tests. Die externe Batch-Integration benötigt weiterhin einen freiwilligen Praxistest mit einem Testbestand.
