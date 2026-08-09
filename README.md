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

## Bestätigter Kern

**V0.9.18 ist in Foundry funktional bestätigt.**

Der Live-Transkript-Test von V0.9.19 wurde am 09.08.2026 teilweise erfolgreich durchgeführt:

- Bereich sichtbar: bestätigt
- Mock-Status: bestätigt
- Mock-Segmente: bestätigt
- Leeren: bestätigt
- NPC-Kontext: noch nicht eindeutig bestätigt

V0.9.20 synchronisierte die sichtbare NPC-Memory-Auswahl erstmals separat. V0.9.21 macht den Button-Pfad selbst eindeutig und übernimmt den aktuell sichtbaren Actor direkt aus dem Dropdown.

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

### Neu in V0.9.21 – eindeutiger NPC-Kontext-Button

Beim Klick auf **NPC-Kontext** passiert jetzt direkt:

1. Die Bridge liest den aktuell sichtbaren Actor aus dem NPC-Memory-Dropdown.
2. Dieser Actor wird als `npcMemorySelectedActorId` gespeichert.
3. Der Live-Transcript-Transport erhält denselben Actor unmittelbar als `npc.context`.
4. Oben im Live-Transkript erscheint `<Actorname> · Cockpit`.
5. Die Benachrichtigung lautet eindeutig `NPC-Kontext aktiv: <Actorname>`.
6. Der ältere Button-Handler wird für diesen Klick bewusst nicht zusätzlich ausgeführt.

Damit hängt dieser Test nicht mehr davon ab, ob eine vorherige automatische Dropdown-Auswahl bereits gespeichert wurde.

## Noch nicht enthalten

- echter Discord Voice Bot
- DAVE/E2EE-Voice-Integration
- echter Speech-to-Text-Provider
- SQLite-Runtime
- automatische KI-Extraktion
- automatisches NPC-Memory aus Sprache
- Undo-Runtime für KI-Aktionen
- Transkript-Suche
- Session-Recap

Technischer Contract:

`docs/DISCORD-AUDIO-AI-CONTRACT-V1.md`

Maschinenlesbares Schema:

`schemas/discord-audio-ai-v1.schema.json`

## Test für V0.9.21

Nur dieser Pfad muss geprüft werden:

1. DM Cockpit auf V0.9.21 aktualisieren.
2. Im NPC-Memory-Dropdown einen Actor auswählen.
3. Im Live-Transkript auf **NPC-Kontext** klicken.
4. Oben muss `<Actorname> · Cockpit` erscheinen.
5. Die Benachrichtigung muss `DM Cockpit: NPC-Kontext aktiv: <Actorname>` lauten.

## Nächster einzelner TODO

Nach erfolgreichem NPC-Kontext-Retest:

**Lokalen Companion-Service-Skeleton mit WebSocket und SQLite-Basis implementieren.**

Dabei weiterhin noch kein echter Discord Voice Bot und kein kostenpflichtiger Cloud-Provider.

## Updates

Manifest:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Installationspaket:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Die Installations-ZIP wird durch GitHub Actions aus dem aktuellen Repository-Stand gebaut.
