# DM Cockpit V0.9.14

Aktueller bestätigter Stand:

- LIVE-Dashboard
- Abenteuer-Flowchart
- Spontane Szenen
- Szenen-Presets
- Gegner-Spawnpunkte
- Enemy Reserve Bench
- Handout Queue
- Loot-/Belohnungspakete
- Item-Suche für Belohnungspakete

## Handout Queue

Journal-Handouts können vorgemerkt und später über „Spielern zeigen“ geöffnet werden. Nach dem Zeigen bleibt ein Handout in der Queue, bis es manuell entfernt wird.

## Loot-/Belohnungspakete

Belohnungspakete bestehen aus einem Namen, einer optionalen Notiz und Gegenständen aus der Welt oder Item-Kompendien.

Beim Einsatz stehen zwei Aktionen zur Verfügung:

- **Verteilen:** Gegenstände werden an einen ausgewählten Welt-Actor übertragen.
- **Nur zeigen:** Paketinhalt und Notiz werden im Chat angezeigt, ohne Actor-Daten zu verändern.

Mengen werden unterstützt. Währungen, EP und Zufallstabellen werden derzeit nicht automatisch verarbeitet; solche Angaben können in der Paketnotiz stehen.

## V0.9.14 – Item-Suche

Beim Hinzufügen eines Gegenstands zu einem Belohnungspaket steht eine Live-Suche zur Verfügung.

- durchsucht Welt-Items und Item-Kompendien
- filtert während der Eingabe
- sucht nach Itemname sowie Welt-/Kompendiumsbezeichnung
- unterstützt mehrere Suchbegriffe
- zeigt die Anzahl der Treffer an

**V0.9.14 wurde in Foundry funktional bestätigt.**

## Updates

DM Cockpit nutzt Foundrys Manifest-/Download-Mechanismus.

Manifest:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Installationspaket:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Die Installations-ZIP wird durch GitHub Actions aus dem aktuellen Repository-Stand gebaut. Das Update-System sowie V0.9.12 Handout Queue und V0.9.14 mit Loot-/Belohnungspaketen und Item-Suche wurden funktional bestätigt.
