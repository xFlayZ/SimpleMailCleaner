# Sicherheit

SimpleMailCleaner ist eine frühe Version. Es gibt derzeit keine unabhängig bestätigte Sicherheitsfreigabe oder garantierte Supportfrist. Den aktuellen Stand beschreibt [BETRIEB.md](docs/BETRIEB.md).

## Sicherheitslücken melden

Bitte keine ausnutzbaren Details oder vertraulichen Daten in öffentliche Issues oder Pull Requests schreiben.

Falls im GitHub-Repository unter **Security → Advisories → Report a vulnerability** verfügbar, nutze die private Meldung. Ist kein privater Meldekanal eingerichtet, eröffne höchstens ein Issue mit der Bitte um einen privaten Kontakt, ohne technische Exploitdetails oder sensible Daten zu veröffentlichen.

Für eine private Meldung sind betroffene Version, Auswirkung, Voraussetzungen und ein reproduzierbares Beispiel mit synthetischen Daten hilfreich. Keine aktiven API-Schlüssel, Kontopasswörter, Session-Tokens, echten E-Mail-Inhalte oder vertraulichen Abmelde-URLs versenden.

## Betrieb

- Neueste geprüfte Abhängigkeiten und Änderungen beachten.
- Eigene Testpostfächer und begrenzte OpenRouter-Schlüssel verwenden.
- `.env`, Connector-Zugänge, lokale Datenbanken und Backups mit Betriebssystemrechten schützen.
- Öffentliche Registrierung nicht ohne zusätzliche Härtung und Prüfung aktivieren.
- Bei einem Vorfall laufende Aktionen prüfen, neue Schreibaktionen pausieren und betroffene Zugänge beim jeweiligen Anbieter widerrufen. Ein bereits eingegangener externer Request kann noch abgeschlossen werden.
