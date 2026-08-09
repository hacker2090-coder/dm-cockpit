# DM Cockpit V0.9.21

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
- Discord Live-Transkript Mock/Transport-Client
- lokaler Companion-Service Skeleton 0.1.0 mit WebSocket + SQLite

## Bestätigter Foundry-Kern

**DM Cockpit V0.9.21 ist in Foundry funktional bestätigt.**

Für den Discord-Live-Transkript-Schritt wurden erfolgreich geprüft:

- Bereich sichtbar
- Mock-Status Live/Inaktiv
- Mock-Segmente
- Feed leeren
- NPC-Kontext aus dem NPC-Memory-Dropdown
- Anzeige `<Actorname> · Cockpit`

Damit ist der Foundry-seitige Mock-/Transport-Client abgeschlossen.

## NPC-Schnellgenerator

Direkt im DM Cockpit kann mit einem Klick ein sofort spielbarer, systemneutraler NPC erzeugt werden.

Mit **Als Actor anlegen** wird der Schnell-NPC in Foundrys Actor-Verzeichnis übertragen. Schnellgenerator-Daten werden als DM-Cockpit-Flag am Actor gespeichert und der neue Actor wird automatisch im NPC-Memory-Bereich ausgewählt.

## NPC Memory

NPC Memory arbeitet mit echten World Actors aus Foundrys Actor-Tab.

- Actor-Suche nach Name und Typ
- Actor direkt öffnen
- Erinnerungen/Aktionen mit Zeitstempel speichern
- Einträge einzeln löschen
- Speicherung direkt am Actor als DM-Cockpit-Flag
- Schnellgenerator-Profil anzeigen

## Discord Live-Transkript V1

Dateien:

- `scripts/live-transcript.js`
- `styles/live-transcript.css`
- `scripts/npc-context-bridge.js`

Funktionen:

- eigener Bereich **Discord Live-Transkript** im DM Cockpit
- WebSocket-Transport-Client nach Contract v1
- lokaler Standard-Endpunkt `ws://127.0.0.1:43170/v1`
- Verarbeitung von `transcript.segment`
- Verarbeitung und Anzeige von `capture.status`
- Sprechername, Zeitstempel und optionale Confidence im Feed
- deduplizierte Segmente über `segmentId`
- bis zu 120 Segmente im flüchtigen UI-Puffer
- NPC-Kontext aus Cockpit-Actor oder ausgewähltem Foundry-Token
- Mock-Capture-Status ohne Discord
- Mock-Transkriptsegmente ohne Cloud-STT
- sichtbarer Hinweis auf die konfigurierte Capture-Policy
- Debug-/Integrations-API unter `globalThis.DMCockpitLiveTranscript`

## Neu – lokaler Companion-Service 0.1.0

Der nächste Architekturbaustein ist unter `companion/` implementiert.

Ziel: Foundry bleibt browserbasiert; Discord Voice, STT, KI und lokale Persistenz laufen später im separaten Companion-Prozess.

### Enthalten

- Node.js Service für lokalen Betrieb
- Standardbindung nur an `127.0.0.1:43170`
- WebSocket-Endpunkt `/v1`
- HTTP-Health-Endpunkt `/health`
- `hello` → `hello.ack` Handshake nach Contract v1
- Verarbeitung von `session.started` / `session.ended`
- Sprecher-Upsert
- finale `transcript.segment`-Persistenz
- NPC-Kontext-Ereignisse
- `capture.status` Transport
- SQLite-Datenbank unter `companion/data/dm-cockpit.sqlite`
- Tabellen für Sessions, Sprecher, Transkriptsegmente, NPC-Kontext und zukünftige Change-/Undo-Records
- idempotente Transkriptsegmente über `segmentId`
- 1-MiB WebSocket-Maximalpayload
- WebSocket-Kompression deaktiviert
- echter lokaler Mock-Client mit `npm run mock`

Details und Startanleitung:

`companion/README.md`

### Voraussetzungen

- Node.js 22.16.0 oder neuer
- npm

### Noch nicht enthalten

- Discord Gateway / Voice
- DAVE/E2EE
- Audio-Buffering
- Speech-to-Text
- KI-Extraktion
- automatische NPC-Memory-Änderungen
- Undo-Ausführung
- Transkript-Suche
- Session-Recap
- Discord-Kurzfassung

## Architektur v1

Technischer Contract:

`docs/DISCORD-AUDIO-AI-CONTRACT-V1.md`

Maschinenlesbares Schema:

`schemas/discord-audio-ai-v1.schema.json`

Festgelegt:

- Companion Service getrennt vom Foundry-Modul
- WebSocket zwischen Foundry und Companion Service
- Sprechertrennung über Discord User IDs
- Ziel-Latenz 5–15 Sekunden
- Ziel auch für >10 Teilnehmer
- lokales SQLite für dauerhafte Transkripte
- Roh-Audio nur bis zur erfolgreichen Transkription
- austauschbare STT-/KI-Provider
- NPC-Kontext über Cockpit oder ausgewählten Token
- automatisches KI-Speichern später nur mit Undo-/Change-Datenmodell
- Capture-Policy wird technisch dokumentiert und nicht mit einer rechtlichen Freigabe gleichgesetzt

## Nächster einzelner Test

Companion-Service lokal starten und die echte Verbindung zu Foundry prüfen:

1. `cd companion`
2. `npm install`
3. `npm run check`
4. `npm start`
5. Foundry → Discord Live-Transkript → **Verbinden**
6. in zweitem Terminal `npm run mock`
7. prüfen, ob **Companion Mock** im Foundry-Transkript erscheint
8. `/health` prüfen, ob SQLite mindestens Session/Sprecher/Segment gezählt hat

Für diesen Test werden weiterhin kein Discord-Bot, kein API-Key und keine kostenpflichtige Cloud benötigt.

## Updates

Manifest:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Installationspaket:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Der Companion-Service liegt separat im Repository und ist nicht Teil des Foundry-Modul-ZIPs. Die Foundry-Version bleibt daher V0.9.21.
