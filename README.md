# DM Cockpit V0.9.15

Aktueller Stand:

- LIVE-Dashboard
- Abenteuer-Flowchart
- Spontane Szenen
- Szenen-Presets
- Gegner-Spawnpunkte
- Enemy Reserve Bench
- Handout Queue
- Loot-/Belohnungspakete
- Item-Suche für Belohnungspakete
- Compendium-Schnellsuche

## Handout Queue

Journal-Handouts können vorgemerkt und später über „Spielern zeigen“ geöffnet werden. Nach dem Zeigen bleibt ein Handout in der Queue, bis es manuell entfernt wird.

## Loot-/Belohnungspakete

Belohnungspakete bestehen aus einem Namen, einer optionalen Notiz und Gegenständen aus der Welt oder Item-Kompendien.

- **Verteilen:** Gegenstände werden an einen ausgewählten Welt-Actor übertragen.
- **Nur zeigen:** Paketinhalt und Notiz werden im Chat angezeigt, ohne Actor-Daten zu verändern.
- Mengen werden unterstützt.
- V0.9.14 mit Item-Suche ist in Foundry funktional bestätigt.

## Neu in V0.9.15 – Compendium-Schnellsuche

Direkt im DM Cockpit steht eine globale Suche über wichtige Kompendiumstypen zur Verfügung.

- durchsucht Actor-, Item-, JournalEntry- und RollTable-Kompendien
- Live-Suche nach Name, Dokumenttyp, Untertyp und Kompendiumsname
- Filter: Alle, Monster / Actors, Items / Zauber, Journal, Tabellen
- zeigt Name, Typ und Herkunftskompendium
- maximal 50 Treffer gleichzeitig, damit die Oberfläche kompakt bleibt
- Treffer werden erst beim Öffnen vollständig geladen
- Klick auf **Öffnen** öffnet das Foundry-Dokument direkt

V0.9.15 ist veröffentlicht und muss noch in Foundry funktional getestet werden.

## Updates

DM Cockpit nutzt Foundrys Manifest-/Download-Mechanismus.

Manifest:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Installationspaket:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Die Installations-ZIP wird durch GitHub Actions aus dem aktuellen Repository-Stand gebaut. Das Update-System sowie V0.9.12 Handout Queue und V0.9.14 mit Loot-/Belohnungspaketen und Item-Suche wurden funktional bestätigt.
