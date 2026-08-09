# DM Cockpit V0.9.20

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
- NPC-Kontext: Fehler gefunden – sichtbare NPC-Memory-Auswahl konnte vom gespeicherten Actor-Kontext abweichen

V0.9.20 behebt gezielt diese NPC-Kontext-Synchronisierung und muss nur noch für diesen Pfad erneut getestet werden.

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

### Neu in V0.9.20 – NPC-Kontext-Bridge

Die sichtbare Actor-Auswahl im NPC-Memory-Bereich wird jetzt explizit mit `npcMemorySelectedActorId` synchronisiert.

Damit gilt:

1. Der im NPC-Memory-Dropdown sichtbare Actor ist die primäre Cockpit-Auswahl.
2. Diese Auswahl wird auch dann persistiert, wenn sie automatisch als erster verfügbarer Actor angezeigt wurde.
3. Der Live-Transkript-Status zeigt die synchronisierte Auswahl an.
4. Der bestehende Token-Fallback bleibt erhalten, wenn kein Cockpit-Actor aktiv ist.

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

## Test für V0.9.20

Nur der reparierte Pfad muss erneut geprüft werden:

1. DM Cockpit auf V0.9.20 aktualisieren.
2. Im NPC-Memory-Bereich einen Actor sichtbar auswählen.
3. Im Live-Transkript auf **NPC-Kontext** klicken.
4. Oben im Live-Transkript muss der Actorname mit `· Cockpit` erscheinen.
5. Die Benachrichtigung muss ebenfalls den Actorname nennen.

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
