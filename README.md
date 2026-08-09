# DM Cockpit V0.9.19

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

V0.9.19 ergänzt erstmals Runtime-Code für Discord Audio & KI und muss deshalb noch in einer Foundry-V14-Testwelt funktional geprüft werden.

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

Mit **Als Actor anlegen** wird der Schnell-NPC in Foundrys Actor-Verzeichnis übertragen. Schnellgenerator-Daten werden als DM-Cockpit-Flag am Actor gespeichert und der neue Actor wird automatisch im NPC-Memory-Bereich ausgewählt.

## NPC Memory

NPC Memory arbeitet mit echten World Actors aus Foundrys Actor-Tab.

- Actor-Suche nach Name und Typ
- Actor direkt öffnen
- Erinnerungen/Aktionen mit Zeitstempel speichern
- Einträge einzeln löschen
- Speicherung direkt am Actor als DM-Cockpit-Flag
- Schnellgenerator-Profil anzeigen

## Neu in V0.9.19 – Discord Live-Transkript V1

Der erste Runtime-Teil der Discord-Audio/KI-Erweiterung ist implementiert.

Dateien:

- `scripts/live-transcript.js`
- `styles/live-transcript.css`

Funktionen:

- eigener Bereich **Discord Live-Transkript** im DM Cockpit
- WebSocket-Transport-Client nach Contract v1
- lokaler Standard-Endpunkt `ws://127.0.0.1:43170/v1`, im Cockpit änderbar
- Verarbeitung von `transcript.segment`
- Verarbeitung und Anzeige von `capture.status`
- Sprechername, Zeitstempel und optionale Confidence im Feed
- deduplizierte Segmente über `segmentId`
- bis zu 120 Segmente im flüchtigen UI-Puffer
- NPC-Kontext aus Cockpit-Actor oder ausgewähltem Foundry-Token
- `npc.context` wird bei aktiver Verbindung automatisch an den Companion Service übertragen
- Handshake `hello` beim WebSocket-Connect
- Mock-Capture-Status ohne Discord
- Mock-Transkriptsegmente ohne Cloud-STT
- sichtbarer Hinweis auf die konfigurierte Capture-Policy
- Debug-/Integrations-API unter `globalThis.DMCockpitLiveTranscript`

Noch **nicht** enthalten:

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

## Test für V0.9.19

In einer separaten Foundry-V14-Testwelt:

1. DM Cockpit auf V0.9.19 aktualisieren und aktivieren.
2. DM Cockpit öffnen.
3. Prüfen, ob **Discord Live-Transkript** sichtbar ist.
4. **Mock-Status** klicken – Status soll zwischen `Live` und `Inaktiv` wechseln.
5. Mehrfach **Mock-Segment** klicken – Sprecher, Uhrzeit, Text und Confidence sollen erscheinen.
6. Einen Actor im NPC Memory auswählen und **NPC-Kontext** klicken – der Actorname soll oben im Transkriptbereich erscheinen.
7. Optional einen Token auswählen und testen, wenn kein Cockpit-Actor aktiv ist.
8. **Leeren** klicken – der Feed soll geleert werden.

Für diesen Mock-Test wird weder ein Discord-Bot noch ein API-Key benötigt. Der Button **Verbinden** darf ohne laufenden Companion Service einen Verbindungsfehler zeigen; das ist zu diesem Zeitpunkt erwartetes Verhalten.

## Discord Audio & KI – Architektur v1

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

## Nächster einzelner TODO

**V0.9.19 in einer Foundry-V14-Testwelt funktional bestätigen.**

Nach erfolgreichem Mock-Test folgt als nächster Entwicklungsschritt der lokale Companion-Service-Skeleton mit WebSocket und SQLite-Basis – weiterhin zunächst ohne Discord Voice und ohne kostenpflichtigen Cloud-Provider.

## Updates

Manifest:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Installationspaket:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Die Installations-ZIP wird durch GitHub Actions aus dem aktuellen Repository-Stand gebaut.
