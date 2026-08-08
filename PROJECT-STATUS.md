# DM Cockpit – Projektstand

Stand: 09.08.2026
Aktuelle Version: **V0.9.18**
Status: **V0.9.16 bestätigt; V0.9.18 bereit zum Test**

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

## Neu in V0.9.18 – Actor-basiertes NPC Memory

- eigener **NPC Memory**-Bereich im Cockpit
- verwendet echte World Actors aus Foundrys Actor-Tab
- Actor-Suche nach Name und Typ
- ausgewählten Actor direkt öffnen
- Erinnerungen/Aktionen mit Zeitstempel pro Actor speichern
- neueste Einträge oben
- einzelne Erinnerungen löschen
- Speicherung direkt als `dm-cockpit`-Flag am Actor
- Schnellgenerator-Profile werden im Memory-Bereich angezeigt
- V0.9.17 wurde vor Bestätigung durch diese Actor-basierte Variante ersetzt

## V0.9.18 – Schnell-NPC in Actor-Tab übertragen

- **Als Actor anlegen** direkt im NPC-Schnellgenerator
- bevorzugt den registrierten Actor-Typ `npc`, falls vorhanden
- verwendet andernfalls einen gültigen registrierten Actor-Typ
- Schnell-NPC-Daten werden als Actor-Flag übernommen
- Foundrys generisches Actor-Standardbild wird für Actor und Prototype-Token verwendet
- neuer Actor wird automatisch im NPC-Memory-Bereich ausgewählt
- nach erfolgreicher Übertragung steht **Actor öffnen** zur Verfügung

## V0.9.16 – NPC-Schnellgenerator

- ein Klick erzeugt einen sofort spielbaren NPC
- systemneutraler Generator ohne Statblock-Abhängigkeit
- Felder: Name, Rolle, Auftreten, Persönlichkeit, Motivation, Eigenheit, Geheimnis
- **Neu würfeln** ersetzt den aktuellen NPC sofort
- letzter NPC bleibt lokal beim GM gespeichert
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

Immer nur einen To-do-Punkt gleichzeitig umsetzen. Im aktuellen Chat möglichst autonom arbeiten und nur bei nicht sinnvoll ableitbaren Produktentscheidungen nachfragen.
