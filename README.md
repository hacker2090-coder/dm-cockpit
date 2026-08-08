# DM Cockpit V0.9.18

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
- NPC-Schnellgenerator
- Actor-basiertes NPC Memory

## NPC-Schnellgenerator

Direkt im DM Cockpit kann mit einem Klick ein sofort spielbarer, systemneutraler NPC erzeugt werden.

Erzeugte Felder:

- Name
- Rolle
- Auftreten
- Persönlichkeit
- Motivation
- Eigenheit
- Geheimnis

Der zuletzt erzeugte NPC bleibt für den GM erhalten. Mit **Neu würfeln** wird sofort ein neuer NPC erzeugt.

Neu in V0.9.18:

- **Als Actor anlegen** überträgt den Schnell-NPC direkt in Foundrys Actor-Verzeichnis.
- Wenn das aktive System einen `npc`-Actor-Typ anbietet, wird dieser bevorzugt; sonst wird ein gültiger Actor-Typ verwendet.
- Schnellgenerator-Daten werden als DM-Cockpit-Flag am Actor gespeichert.
- Actor-Bild und Prototype-Token verwenden Foundrys generisches Standardbild.
- Nach dem Anlegen wird der neue Actor automatisch im NPC-Memory-Bereich ausgewählt.

**V0.9.16 mit NPC-Schnellgenerator wurde in Foundry funktional bestätigt.**

## Neu in V0.9.18 – NPC Memory

NPC Memory ist jetzt ein eigener Bereich im Cockpit und arbeitet mit den echten World Actors aus Foundrys Actor-Tab.

- alle World Actors aus `game.actors` stehen zur Auswahl
- Suchfeld nach Name und Actor-Typ
- ausgewählten Actor direkt öffnen
- Erinnerungen/Aktionen pro Actor mit Zeitstempel speichern
- neueste Einträge stehen oben
- Einträge können einzeln gelöscht werden
- Erinnerungen werden direkt am Actor als DM-Cockpit-Flag gespeichert
- bei Schnellgenerator-NPCs werden Rolle, Auftreten, Persönlichkeit, Motivation, Eigenheit und Geheimnis im Memory-Bereich angezeigt
- neu angelegte Schnell-NPCs werden direkt ausgewählt

V0.9.17 wurde durch diese Actor-basierte Überarbeitung ersetzt, bevor die alte Memory-Variante bestätigt wurde.

V0.9.18 ist veröffentlicht und muss in Foundry funktional getestet werden.

## Updates

DM Cockpit nutzt Foundrys Manifest-/Download-Mechanismus.

Manifest:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Installationspaket:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Die Installations-ZIP wird durch GitHub Actions aus dem aktuellen Repository-Stand gebaut.
