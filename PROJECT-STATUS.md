# DM Cockpit – Projektstand

Stand: 09.08.2026
Aktuelle Version: **V0.9.15**
Status: **V0.9.14 bestätigt; V0.9.15 bereit zum Test**

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

## Neu in V0.9.15 – Compendium-Schnellsuche

- eigener Suchbereich direkt im DM Cockpit
- durchsucht Actor-, Item-, JournalEntry- und RollTable-Kompendien
- nutzt Foundrys Compendium-Indizes statt alle Dokumente vollständig zu laden
- Live-Suche nach Name, Untertyp und Kompendiumsname
- Filter: Alle, Monster / Actors, Items / Zauber, Journal, Tabellen
- Treffer zeigen Name, Typ und Herkunftskompendium
- bis zu 50 Treffer gleichzeitig sichtbar
- **Öffnen** lädt und öffnet den ausgewählten Foundry-Eintrag

## V0.9.14 – Loot-/Belohnungspakete + Item-Suche

- Pakete mit Name und optionaler Notiz anlegen.
- Gegenstände aus Welt-Items und Item-Kompendien hinzufügen.
- Mengen pro Gegenstand festlegen.
- **Verteilen:** Gegenstände an einen ausgewählten Welt-Actor übertragen.
- **Nur zeigen:** Paket als Chat-Nachricht anzeigen, ohne Actor-Daten zu verändern.
- Item-Suche filtert Welt-Items und Item-Kompendien während der Eingabe.
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

1. NPC-Schnellgenerator
2. NPC Action Memory
3. Spielerfragen-Parkplatz
4. „Was hat sich geändert?“
5. Session Recap

## Arbeitsregel

Immer nur einen To-do-Punkt gleichzeitig umsetzen. Keine zusätzlichen Funktionen ohne Entscheidung.
