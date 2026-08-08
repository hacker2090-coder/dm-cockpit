# DM Cockpit – Update-System

## Foundry-Manifest

`https://github.com/hacker2090-coder/dm-cockpit/releases/latest/download/module.json`

## Neue Version veröffentlichen

1. Versionsnummer in `module.json` und im Quellarchiv erhöhen.
2. `dm-cockpit-source.zip` aktualisieren.
3. Nach `main` übertragen.
4. GitHub Actions erstellt automatisch das Release mit `module.json` und `dm-cockpit.zip`.
5. Foundry erkennt die neue Version beim Update-Check.

Das Repository muss öffentlich sein, damit Foundry Manifest und ZIP ohne GitHub-Anmeldung abrufen kann.