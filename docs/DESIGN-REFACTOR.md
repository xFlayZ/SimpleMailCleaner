# Design-Refactoring nach Apple Design Skill

Grundlage: [dickwu/apple-design-skill](https://github.com/dickwu/apple-design-skill), lokal in `.local/skills/apple-design` geladen. Fremde HIG-Referenzen werden nicht als MIT-Projektquelltext veröffentlicht. Der Skill ist für weitere lokale Arbeit verfügbar. Angewendet werden die übertragbaren Prinzipien auf eine responsive Next.js-Webanwendung, keine Nachbildung von macOS-Fensterrahmen.

## Review

Der Arbeitsplatz soll helfen, einen großen E-Mail-Bestand nachvollziehbar auf wenige Entscheidungen zu reduzieren. Im bisherigen Code dominieren 9–11 px kleine, kontrastarme Nebeninformationen, während 2.000 clientseitig geladene Nachrichten sowohl Liste als auch Kennzahlen begrenzen. Ein dekorativer Überblick hilft bei 12.000 Nachrichten weniger als eine belastbare Arbeitsliste mit Filtern und nachvollziehbarer Analyseroute.

- **Kritisch – Lesbarkeit:** größere Systemtypografie, semantische Textfarben und berechenbare Kontraste. Grundlage: `accessibility.md › Vision`, `typography.md › Supporting Dynamic Type`, `color.md › Best practices`.
- **Hoch – Arbeitsablauf:** Suche, Tabellenfilter, Seitennavigation und Neubewertung direkt am Datenbestand platzieren. Grundlage: `layout.md › Visual hierarchy`, `lists-and-tables.md › Desktop (macOS)`; die konkrete Filtergestaltung ist eine Produktentscheidung für diese Webanwendung.
- **Hoch – KI-Kontrolle:** Kriterien und Auswahl vor einer Neubewertung zeigen; lokale Regeln, wiederverwendete Gruppen und bezahlte KI auseinanderhalten. Grundlage: `generative-ai.md › Best practices`, `Privacy` und `Outputs`.
- **Mittel – Dialoge:** native HTML-Dialoge mit Fokusführung, Escape und eindeutiger Abbruchmöglichkeit statt ausschließlich manuell positionierter Overlays. Grundlage: `modality.md › Best practices`.
- **Mittel – Anpassung:** Hell-/Dunkeldarstellung und kompakte Navigation mit identischem Funktionsumfang. Grundlage: `dark-mode.md › Dark Mode colors`, `sidebars.md › Best practices`, `layout.md › Adaptability` und `references/cross-platform.md`.

## Gestaltungssystem vor Implementierung

| Rolle | Hell | Dunkel |
| --- | --- | --- |
| Arbeitsfläche | #f5f5f7 | #111113 |
| Oberfläche | #ffffff | #1c1c1e |
| Primärtext | #1d1d1f | #f5f5f7 |
| Sekundärtext | #636366 | #a1a1a6 |
| Interaktion | #0066cc | #64a8ff |
| Trennlinie | #d7d7dc | #45454c |

Systemschrift für Navigation und Daten; Titel 30/36 px, Fließtext 14/21 px, Nebeninformationen mindestens 12 px, Daten mit tabellarischen Ziffern. Treffflächen mindestens 36 px auf Desktop und 44 px bei Touch. Sichtbarer Tastaturfokus, Status zusätzlich als Text und Symbol. Die konkrete Skala ist eine Web-Produktentscheidung, abgeleitet aus dem Skill.

Die charakteristische Komponente ist die **Aufräumroute**: Sie zeigt, wie viele Nachrichten lokal entschieden, zu Mustern zusammengefasst, wiederverwendet oder noch an die KI gegeben werden. Dieser visuelle Schwerpunkt gehört zur Aufgabe; alle anderen Flächen bleiben ruhig. Keine dekorative Briefumschlag-Illustration und kein Glas auf Inhaltskarten. Transparenz nur optional an Navigation, mit undurchsichtiger Alternative.

```text
Breit:  Navigation | Titel + Aktionen
                   | Bestandszahlen / Aufräumroute
                   | Suche + Filter
                   | Nachrichten / Gruppen
                   | Seitenwechsel + Auswahlaktionen

Schmal: Menü + Titel
        Aktionen
        Filter aufklappbar
        gestapelte Nachrichten / horizontal bedienbare Datentabelle
        Seitenwechsel
```

Die Gestaltung ist bewusst eine ruhige Arbeitsoberfläche für sensible Postfachdaten. Das ist eine gestalterische Entscheidung, keine Aussage, dass Apple eine bestimmte Palette oder ein bestimmtes Weblayout vorschreibt. Bewegungen sind kurz und entfallen bei reduzierter Bewegung. Kriterien werden schrittweise eingeblendet; keine verlorenen Funktionen auf schmalen Displays.

Eine visuelle Prüfung kann aus Code allein keine reale Browserdarstellung bestätigen. Kontraste und Datenverarbeitung werden technisch geprüft; verfügbare Browserprüfungen und ihre Grenzen werden im Prüfprotokoll festgehalten.

## Prüfprotokoll

- Produktionsbuild und TypeScript erfolgreich; 60 Unit-Tests, 54 Datenbank-/Scan-Integrationsprüfungen und 21 HTTP-Prüfungen bestanden.
- Browserprüfung im In-App-Browser: Übersicht, Prüfliste, erweiterte Filter, Kriterien-Dialog, Eingabe mehrerer Begriffe und Schließen per Escape. Dunkeldarstellung bei Desktopbreite sowie Dialog und Navigation bei 390 × 844 px geprüft. Kleine mobile Formularfelder und Demo-Hinweis anschließend angepasst. Keine vollständige manuelle Prüfung aller Browser, Screenreader oder echten Anbieterzugänge.
- Kontrast auf Oberfläche: Hell Primärtext 16,83:1, Sekundärtext 5,99:1, Akzent 5,57:1; dunkel 15,63:1 / 6,61:1 / 6,96:1. Diese Werte prüfen die zentralen Farbtokens, nicht sämtliche gerenderten Elementkombinationen.
- Native Anbieter-Batches mit HTTP-Fixtures geprüft, keine kostenpflichtigen Live-Aufträge versendet.

## Erweiterung: manuelle Sammelaktionen

Newsletter- und Absendergruppen, Nachrichtenzeilen und die Textvorschau bieten ausdrücklich benannte Papierkorb-Aktionen. Der gemeinsame Dialog zeigt Postfach, optionalen Stichtag, Behalten-Override und die konkrete eingefrorene Vorschau vor der Freigabe. Bestätigte Sammelaufträge laufen im Hintergrund; geschützte oder inzwischen geänderte Nachrichten werden ausgelassen.

Produktionsbuild, 60 Unit-Tests, 21 neue Sammelaktionsprüfungen, 24 bestehende Aktionsprüfungen und 23 HTTP-Prüfungen bestanden. Browserprüfung mit fiktiven Daten: Newsletter-Schaltfläche, vorausgefüllter exakter Absender, Behalten-Option und nativer Datumswechsel einschließlich Aktivierung der Vorschau. Keine echten E-Mail-Aktionen ausgeführt.

## Erweiterung: lesbare Suche, Verlauf und manuelle Kontrolle

Die alte Suchfeldregel setzte eine helle Fläche trotz dunkler Schriftpalette. Suchfelder verwenden nun die umgebende semantische Oberfläche und explizite Text-/Platzhalterfarben. Im Browser mit getippter Suche geprüft: Text `rgb(245,245,247)` auf `rgb(28,28,30)` in der Dunkeldarstellung; auch das neue Anweisungsfeld verwendet diese Farbkombination.

Der Verlauf hat eine gemeinsame Zeitachse statt mehrerer unabhängig sortierter Listen. Art-/Statusfilter, Suche, stabile Sortierung und serverseitige Pagination sowie gefilterte Ergebnisse einzelner Aktionen sorgen für klare Zuordnung. Unbestätigte Papierkorb-Vorschauen und doppelte Protokollmeldungen werden standardmäßig nicht als laufende Vorgänge dargestellt.

Kategorien und Schutz lassen sich einzeln, per Auswahl oder pro exaktem Absender bearbeiten. Eine Schutz-Ausnahme erfordert eine explizite Risiko-Bestätigung und betrifft nur die eingefrorenen Nachrichten. Im Browser wurden Kategorieauswahl, Entschützen, die gesperrte Speicherschaltfläche vor Bestätigung und deren Aktivierung danach geprüft, ohne echte Änderungen zu speichern. Das optionale KI-Anweisungsfeld wurde mit dem Rabatt-Beispiel geprüft. Verlaufsfilter und Sortierung wurden anhand fiktiver Notizen bedient.

Produktionsbuild, 65 Unit-Tests, 21 neue Kontrollprüfungen, 21 Sammelaktionsprüfungen, 24 bestehende Aktionsprüfungen, 20 Neubewertungsprüfungen und 35 HTTP-Prüfungen bestanden. Kein echter KI-Auftrag und keine echte E-Mail-Aktion wurden für diese Prüfungen ausgeführt.
