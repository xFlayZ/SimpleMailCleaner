# Analysearten

Der empfohlene Ablauf ist ein kostenloser Metadatenimport mit anschließender konfigurierbarer Neubewertung. Die frühere Bewertung jeder Nachricht in 20er-Paketen wurde durch lokale Vorfilterung und gemeinsame Musterbewertungen ersetzt. Details stehen in [Aufräumpipeline](AUFRAEUMPIPELINE.md).

Metadatenimport und Neubewertung laden keine Nachrichtentexte oder Anhänge. Der separate Inhaltsscan übermittelt nach eigener Einwilligung Textausschnitte bis 12.000 Zeichen und bleibt auf 500 Nachrichten begrenzt. Die Textvorschau lädt auf Wunsch ausschließlich Text zur Anzeige. Keine Analyse verschiebt von selbst eine E-Mail.

Ein Listenheader ist noch keine verifizierte Abmeldemöglichkeit. Die DKIM-/RFC-8058-Prüfung benötigt die Roh-Nachricht; neue Angebote werden beim separat beauftragten Inhaltsscan ermittelt. Abmelden erfordert eine eigene Freigabe und erneute Verifikation.

Historische Aufträge des Typs ai_headers werden als Import mit nachgelagerter gruppierter Worker-Bewertung verarbeitet. Für eine genaue Kostenvorschau zuerst importieren und anschließend den Bestand neu bewerten.
