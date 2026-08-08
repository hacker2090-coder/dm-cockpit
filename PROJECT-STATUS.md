# DM Cockpit – Projektstand

Stand: 09.08.2026
Aktuelle Version: **V0.9.17**
Status: **V0.9.16 bestätigt; V0.9.17 bereit zum Test**

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
- Compendium-Schnellsuche
- NPC-Schnellgenerator
- GitHub-/Foundry-Update-System

## Neu in V0.9.17 – NPC Action Memory

- eigener Memory-Bereich direkt unter dem aktuellen Schnell-NPC
- kurze Aktion/Erinnerung eingeben und mit **Merken** speichern
- Zeitstempel pro Eintrag
- Erinnerungen werden pro erzeugtem NPC getrennt gespeichert
- neueste Einträge erscheinen oben
- einzelne Einträge können gelöscht werden
- private Speicherung im Foundry-User-Scope
- beim Neu-Würfeln wechselt die Memory-Anzeige automatisch zum neuen NPC

## V0.9.16 – NPC-Schnellgenerator

- eigener Bereich direkt im DM Cockpit
- ein Klick erzeugt einen sofort spielbaren NPC
- systemneutraler Generator ohne Statblock-Abhängigkeit
- Felder: Name, Rolle, Auftreten, Persönlichkeit, Motivation, Eigenheit, Geheimnis
- **Neu würfeln** ersetzt den aktuellen NPC sofort
- letzter NPC bleibt lokal beim GM gespeichert und überlebt Cockpit-Neurender
- **In Foundry funktional bestätigt.**

## V0.9.15 – Compendium-Schnellsuche

- durchsucht Actor-, Item-, JournalEntry- und RollTable-Kompendien
- nutzt Foundrys Compendium-Indizes
- Filter für Alle, Monster / Actors, Items / Zauber, Journal und Tabellen
- Treffer lassen sich direkt öffnen
- **In Foundry funktional bestätigt.**

## Update-System

- Stabiles Manifest auf `main/module.json`
- Stabile Installations-ZIP auf `main/dm-cockpit.zip`
- Update-System erfolgreich getestet.
- V0.9.16 NPC-Schnellgenerator funktional bestätigt.

## Nächste offene [SPÄTER]-Punkte

1. Spielerfragen-Parkplatz
2. „Was hat sich geändert?“
3. Session Recap

## Arbeitsregel

Immer nur einen To-do-Punkt gleichzeitig umsetzen. Keine zusätzlichen Funktionen ohne Entscheidung.
