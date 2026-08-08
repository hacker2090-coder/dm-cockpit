# DM Cockpit V0.9.13

Aktueller Stand:

- LIVE-Dashboard
- Abenteuer-Flowchart
- Spontane Szenen
- Szenen-Presets
- Gegner-Spawnpunkte
- Enemy Reserve Bench
- Handout Queue
- Loot-/Belohnungspakete

## Handout Queue

Journal-Handouts können vorgemerkt und später über „Spielern zeigen“ geöffnet werden. Nach dem Zeigen bleibt ein Handout in der Queue, bis es manuell entfernt wird.

## Loot-/Belohnungspakete

Belohnungspakete bestehen aus einem Namen, einer optionalen Notiz und Gegenständen aus der Welt oder Item-Kompendien.

Beim Einsatz stehen zwei Aktionen zur Verfügung:

- **Verteilen:** Gegenstände werden an einen ausgewählten Welt-Actor übertragen.
- **Nur zeigen:** Paketinhalt und Notiz werden im Chat angezeigt, ohne Actor-Daten zu verändern.

Mengen werden unterstützt. Währungen, EP und Zufallstabellen werden in V0.9.13 nicht automatisch verarbeitet; solche Angaben können in der Paketnotiz stehen.

V0.9.13 ist veröffentlicht und muss noch in Foundry funktional getestet werden.

## Updates

DM Cockpit nutzt Foundrys Manifest-/Download-Mechanismus.

Manifest:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Installationspaket:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Die Installations-ZIP wird durch GitHub Actions aus dem aktuellen Repository-Stand gebaut. Das Update von V0.9.10 auf V0.9.11 wurde erfolgreich in Foundry getestet; V0.9.12 mit Handout Queue wurde ebenfalls funktional bestätigt.
