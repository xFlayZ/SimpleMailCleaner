# Sparsame KI-Analyse und separater Inhaltsscan

Die Anwendung bietet drei unabhängig wählbare Analysearten:

| Analyseart | Daten an die KI | Kosten |
| --- | --- | --- |
| Lokale Übersicht | Keine | 0 USD KI-Kosten |
| KI-Schnellanalyse | Absender, Betreff (max. 400 Zeichen), Datum und interne Nachrichten-ID | Schätzung vor dem Start; bis zu 20 Nachrichten pro Anfrage |
| Separater KI-Inhaltsscan | Zusätzlich bereinigte Textausschnitte bis 12.000 Zeichen | Eigene Schätzung und ausdrückliche Inhaltseinwilligung |

Die Schnellanalyse ist im Scandialog die vorausgewählte KI-Option. Sie lädt weder Nachrichtentexte noch Roh-MIME oder Anhänge. Auch die DKIM-Prüfung einer Abmeldung läuft dort nicht automatisch: Dafür wäre die Roh-Nachricht erforderlich. Bereits früher verifizierte Abmeldeangebote bleiben erhalten; neue Angebote werden beim separat beauftragten Inhaltsscan ermittelt. Das tatsächliche Abmelden erfordert unverändert eine eigene Freigabe und erneute Verifikation.

Metadaten sind ebenfalls vertraulich: Absenderadressen und Betreffzeilen können personenbezogene oder sensible Informationen enthalten. Ihre Übermittlung an OpenRouter und den Modellanbieter wird pro Scan bestätigt. Die KI erhält den ausdrücklichen Hinweis, dass sie keinen Nachrichtentext gesehen hat und bei unklarer Bedeutung zur manuellen Prüfung zurückstellen muss. Alte Nachrichten sind nicht allein wegen ihres Alters zum Aufräumen geeignet.

## Weniger wiederkehrende Kosten

Die Schnellanalyse bündelt maximal 20 einzelne Bewertungen pro Anfrage. Jede Nachricht behält ihre eigene ID, Kategorie und Begründung; die KI darf keine zusätzlichen Nachrichten in eine Auswahl aufnehmen. Kleine Modellkontextfenster können kleinere Pakete erfordern. Unvollständige, doppelte oder fremde Ergebnis-IDs werden verworfen. Ein Paketfehler löst keinen heimlichen Inhaltsscan aus.

Unveränderte Schnellbewertungen werden über Absender, Betreff, Datum, Modell und Promptversion wiedererkannt. Sie werden nicht erneut an die KI geschickt. Schutzregeln werden lokal berücksichtigt. Schnell- und Inhaltsbewertungen werden getrennt gespeichert. Auch nach einem Inhaltsscan kann eine unveränderte frühere Schnellbewertung weiterverwendet werden.

## Kostenanzeige

Vor einem KI-Scan wird eine Spanne anhand der aktuellen Modellpreise, der maximalen Auswahl und vorhandener Metadaten angezeigt. Bekannte geschützte und bereits unverändert bewertete Nachrichten werden abgezogen. Noch unbekannte Treffer und Textlängen bleiben eine Hochrechnung. Die Schätzung verursacht selbst keinen kostenpflichtigen KI-Aufruf und lädt keinen E-Mail-Text.

Die bisherige pauschale Oberkantenrechnung mit vielen Eingabetokens pro Nachricht wird nicht mehr als erwarteter Preis für die Schnellanalyse verwendet. Erwartungsspanne und technische Budgetreservierung werden unterschieden. Das Scan-/Monatsbudget wird vor jedem einzelnen KI-Request geprüft und niemals automatisch angehoben.

Rechenbeispiel, keine aktuellen oder garantierten Modellpreise: Bei 1 USD pro Million Eingabetokens und 5 USD pro Million Ausgabetokens sowie durchschnittlich 400 Metadatenbytes je Nachricht ergibt die Planung für 12.000 noch ungeprüfte Nachrichten ungefähr 5,28–9,90 USD bei 600 Paketanfragen. Tatsächliche Tokenlängen, Modellantworten, Reasoning-Kosten und Providerpreise können abweichen. Andere Modelle können erheblich günstiger sein. Gebühren und Steuern sind nicht enthalten. Die Anwendung lädt die gültigen Preise dynamisch.

Lokale Übersichten und Schnellanalysen erlauben bis zu 20.000 Nachrichten pro Scan, der separate Inhaltsscan bleibt auf 500 begrenzt. Die Zahl ist die maximale Auswahl, nicht die garantierte Anzahl vorhandener Nachrichten im Zeitraum. Bei großen Konten kann bereits der Abruf der Metadaten wegen Anbieterlimits länger dauern. Der lokale Proton-Connector muss nach diesem Update neu gestartet werden, damit er größere Metadatenaufträge akzeptiert.

## Aussagekraft und Ausführung

Die Prüfungsliste kennzeichnet ausdrücklich, ob eine aktuelle Empfehlung nur auf Metadaten oder auf dem separaten Inhaltsscan basiert. Eine Metadatenbewertung ersetzt keine vollständige Inhaltsprüfung. Papierkorb-Aktionen und Abmeldungen bleiben konkrete, getrennte Freigaben mit den vorhandenen Schutzregeln; die KI führt keine Aktionen aus.
