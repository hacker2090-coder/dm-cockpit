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

## NPC Memory

NPC Memory ist ein eigener Bereich im Cockpit und arbeitet mit den echten World Actors aus Foundrys Actor-Tab.

- alle World Actors aus `game.actors` stehen zur Auswahl
- Suchfeld nach Name und Actor-Typ
- ausgewählten Actor direkt öffnen
- Erinnerungen/Aktionen pro Actor mit Zeitstempel speichern
- neueste Einträge stehen oben
- Einträge können einzeln gelöscht werden
- Erinnerungen werden direkt am Actor als DM-Cockpit-Flag gespeichert
- bei Schnellgenerator-NPCs werden Rolle, Auftreten, Persönlichkeit, Motivation, Eigenheit und Geheimnis im Memory-Bereich angezeigt
- neu angelegte Schnell-NPCs werden direkt ausgewählt

**V0.9.18 ist in Foundry funktional bestätigt.**

## Discord Audio & KI – Architektur v1

Der nächste große Ausbau ist Discord Voice + Transkription + KI-gestütztes NPC Memory.

Der erste Architektur-TODO ist abgeschlossen:

- provider-neutraler Nachrichtenvertrag zwischen Foundry und einem separaten Companion Service
- WebSocket-Transport vorgesehen
- Sprecher werden über Discord User IDs getrennt
- Ziel-Latenz 5–15 Sekunden
- keine feste Teilnehmerobergrenze im Protokoll; Ziel auch >10 Teilnehmer
- lokale SQLite-Datenhaltung für Transkripte
- Roh-Audio nur temporär bis zur erfolgreichen Transkription
- austauschbare STT- und KI-Provider
- aktiver NPC über Cockpit oder ausgewählten Token
- direktes KI-Speichern mit verpflichtendem Undo-/Change-Datenmodell
- Capture-Policy wird technisch protokolliert und nicht mit einer rechtlichen Freigabe gleichgesetzt

Technischer Contract:

`docs/DISCORD-AUDIO-AI-CONTRACT-V1.md`

Maschinenlesbares Schema:

`schemas/discord-audio-ai-v1.schema.json`

Noch nicht implementiert sind Discord Bot, DAVE Voice, echtes STT, Live-Transkript-UI, SQLite-Code und KI-Extraktion.

### Nächster einzelner TODO

**Foundry Live-Transkript V1 als Mock/Transport-Client implementieren.**

Zuerst soll Foundry simulierte `transcript.segment`- und `capture.status`-Nachrichten verarbeiten können. Discord Voice und ein kostenpflichtiger Cloud-Provider kommen erst danach.

## Updates

DM Cockpit nutzt Foundrys Manifest-/Download-Mechanismus.

Manifest:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Installationspaket:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Die Installations-ZIP wird durch GitHub Actions aus dem aktuellen Repository-Stand gebaut.

Die aktuelle Architekturänderung ist dokumentations-/schema-seitig und ändert noch keinen Foundry-Runtime-Code; deshalb bleibt die Modulversion bei V0.9.18.
