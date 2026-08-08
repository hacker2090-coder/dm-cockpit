# DM Cockpit – Projektstand

Stand: 09.08.2026
Aktuelle Version: **V0.9.14**
Status: **funktional bestätigt**

## Fertig / aktiv

- LIVE-Dashboard
- Abenteuer-Flowchart
- Spontane Szenen
- Szenen-Presets
- Gegner-Spawnpunkte
- Enemy Reserve Bench
- Handout Queue
- Loot-/Belohnungspakete
- Item-Suche für Belohnungspakete
- GitHub-/Foundry-Update-System

## Loot-/Belohnungspakete

- Pakete mit Name und optionaler Notiz anlegen.
- Gegenstände aus Welt-Items und Item-Kompendien hinzufügen.
- Mengen pro Gegenstand festlegen.
- **Verteilen:** Gegenstände an einen ausgewählten Welt-Actor übertragen.
- **Nur zeigen:** Paket als Chat-Nachricht anzeigen, ohne Actor-Daten zu verändern.
- Pakete und Gegenstände können manuell entfernt werden.
- Währung, EP und Zufallstabellen werden derzeit nicht automatisch verarbeitet.

## V0.9.14 – Item-Suche

- Live-Suche beim Hinzufügen eines Gegenstands zu einem Belohnungspaket.
- Durchsucht Welt-Items und Item-Kompendien.
- Filtert die bestehende Auswahl während der Eingabe.
- Sucht nach Itemname und Welt-/Kompendiumsbezeichnung.
- Mehrere Suchbegriffe werden gemeinsam berücksichtigt.
- Trefferanzahl wird angezeigt.
- **In Foundry funktional bestätigt.**

## Handout Queue

- Journal-Einträge und Journal-Seiten können vorgemerkt werden.
- „Spielern zeigen“ nutzt Foundrys eigenen Anzeige-Dialog.
- Nach dem Zeigen bleibt der Eintrag in der Queue.
- Entfernen erfolgt manuell.

## Update-System

- Stabiles Manifest auf `main/module.json`
- Stabile Installations-ZIP auf `main/dm-cockpit.zip`
- Foundry erkennt höhere Versionsnummern über das Manifest.
- Update-System erfolgreich getestet.
- V0.9.12 Handout Queue funktional bestätigt.
- V0.9.14 Loot-/Belohnungspakete + Item-Suche funktional bestätigt.

## Nächste offene [SPÄTER]-Punkte

1. Compendium-Schnellsuche
2. NPC-Schnellgenerator
3. NPC Action Memory
4. Spielerfragen-Parkplatz
5. „Was hat sich geändert?“
6. Session Recap

## Arbeitsregel

Immer nur einen To-do-Punkt gleichzeitig umsetzen. Keine zusätzlichen Funktionen ohne Entscheidung.
