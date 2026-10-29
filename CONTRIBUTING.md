# Mitwirken

Danke für dein Interesse an SimpleMailCleaner. Die Anwendung verarbeitet sensible E-Mail-Daten; nachvollziehbare Änderungen und sichere Standardwerte sind deshalb besonders wichtig.

## Fehler melden

Vor einem neuen Issue nach ähnlichen Meldungen suchen. Bitte erwartetes und tatsächliches Verhalten, Reproduktionsschritte, verwendete Node.js-/PostgreSQL-Versionen sowie den betroffenen Anbieter und die Analyseart beschreiben. Ein kleines Beispiel mit synthetischen Daten hilft.

Keine API-Schlüssel, Tokens, Passwörter, echten Nachrichten, personenbezogenen Daten, vollständigen Header oder vertraulichen Abmelde-URLs veröffentlichen. Sicherheitslücken nicht in öffentlichen Issues diskutieren; siehe [SECURITY.md](SECURITY.md).

## Lokale Entwicklung

Der [Quick start](README.md#quick-start-without-docker) und die [Einrichtungsanleitung](docs/EINRICHTUNG.md) erklären Datenbank und Anbieterzugänge. Eigene `.env` verwenden und niemals einchecken. Providerexperimente nur mit eigenen Testpostfächern durchführen.

Eine Änderung sollte ein zusammenhängendes Problem lösen. Beschreibe im Pull Request das Problem, das resultierende Verhalten, die durchgeführten Prüfungen und relevante Grenzen. Neue Anbieterfunktionen müssen fehlende Serverfähigkeiten und unklare Ergebnisse ausdrücklich behandeln.

Bei jeder nutzerseitigen oder betrieblichen Änderung `CHANGELOG.md` im Abschnitt **Unreleased** aktualisieren. Den englischen `README.md`, den deutschen `README.de.md` und Setup-/Sicherheitsdokumentation zusammen aktuell halten, wenn sich Ablauf, Voraussetzungen, Routen oder Sicherheitsverhalten ändern.

```bash
npm test
npm run build
npm run typecheck
```

Bei Änderungen an Datenbank, Freigaben oder Scanverarbeitung die passenden Integrationsprüfungen mit einer separaten Testdatenbank ausführen. Mailmutationstests dürfen keine realen Konten als implizites Standardziel verwenden.

## Sicherheitsgrundsätze

- KI-Ausgaben und E-Mail-Inhalte sind nicht vertrauenswürdig.
- Absender-/Betreffanalyse darf keinen stillen Inhaltsscan auslösen.
- Neue Nachrichten dürfen nicht in bereits freigegebene Mengen aufgenommen werden.
- Keine endgültige Löschung, kein unsicherer IMAP-Fallback, keine Deaktivierung der TLS-Prüfung.
- Eigentümerzuordnung, Nutzerisolierung und Budgetprüfungen müssen auch im Hintergrunddienst gelten.
- Keine automatische Wiederholung von Schreibaktionen mit unklarem externem Ergebnis.

## Lizenz von Beiträgen

Mit einem Beitrag erklärst du, dass du ihn einreichen darfst und ihn unter der [MIT-Lizenz dieses Projekts](LICENSE) bereitstellst. Fremdcode nur mit nachvollziehbarer Herkunft und kompatibler Lizenz übernehmen; erforderliche Hinweise erhalten.
