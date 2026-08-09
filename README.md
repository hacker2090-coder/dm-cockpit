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
- lokaler Companion Service 0.3.0
- WebSocket + SQLite Ende-zu-Ende bestätigt
- Discord Voice + DAVE/E2EE + GM-Follow real bestätigt
- Discord Audio Receive / RAM-Buffering pro Sprecher implementiert

## Bestätigter Foundry-Kern

**DM Cockpit V0.9.21 ist in Foundry funktional bestätigt.**

Bestätigt sind unter anderem Live-Transkript, Mock-Segmente, Feed-Leeren und NPC-Kontext inklusive Anzeige des ausgewählten Actor-Namens.

## Companion 0.1.0 – bestätigt

Am 09.08.2026 auf dem Ziel-PC Ende-zu-Ende bestätigt:

- Companion startet lokal
- Foundry verbindet sich über `ws://127.0.0.1:43170/v1`
- `npm run mock` läuft über den echten WebSocket
- **Companion Mock** erscheint in Foundry
- SQLite speichert Session, Sprecher, Segment und NPC-Kontext
- Health-Test: `sessions: 1`, `speakers: 1`, `segments: 1`, `npcContexts: 1`

Damit ist **Foundry ↔ WebSocket ↔ Companion ↔ SQLite** bestätigt.

## Companion 0.2.0 – Discord Voice bestätigt

Auf dem echten Discord-Server bestätigt:

- Bot-Login funktioniert
- Bot joint automatisch den Voice-Channel des konfigurierten GM
- Bot folgt beim Channel-Wechsel
- Bot verlässt Voice, wenn der GM Voice verlässt
- DAVE/E2EE-Verbindung funktioniert
- `selfDeaf: false` ist für Audio Receive aktiv
- `selfMute: true`, solange der Bot selbst kein Audio sendet

Lokale Konfiguration erfolgt über `companion/.env`; diese Datei ist aus Git ausgeschlossen.

## Companion 0.3.0 – Audio Receive / Sprecher-Buffering

Neu implementiert:

- `companion/src/audio-receive.js`
- echter Discord-Voice-Receiver
- getrennte Audio-Subscriptions nach Discord User ID
- eigener temporärer Opus-Puffer je Sprecher
- mehrere gleichzeitig aktive Sprecher werden getrennt behandelt
- Sprechsegment endet nach 1,2 Sekunden Inaktivität
- Schutzlimits: 60 Sekunden bzw. 8 MiB pro Segment
- Segmentmetadaten mit Discord User ID, Dauer, Paket- und Byteanzahl
- Roh-Audio nur im RAM
- keine Audiodatei und kein Cloud-Upload
- Puffer wird nach Verarbeitung freigegeben

Dieser Schritt muss jetzt einmal mit echter Sprache getestet werden. Danach kann der STT-Adapter als nächster separater Baustein folgen.

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
- Ziel auch für mehr als 10 Teilnehmer
- lokales SQLite für dauerhafte Transkripte
- Roh-Audio nur temporär
- austauschbare STT-/KI-Provider
- NPC-Kontext über Cockpit oder ausgewählten Token
- automatisches KI-Speichern später nur mit Undo-/Change-Datenmodell

## Nächster einzelner Test

**Companion 0.3.0 Audio Receive:**

1. Repository aktualisieren.
2. Companion starten.
3. GM einem Voice-Channel beitreten lassen.
4. Etwa 3–5 Sekunden sprechen.
5. Mindestens 2 Sekunden still sein.
6. Im Terminal muss `[audio-receive] Segment ...` mit Paket- und Byteanzahl größer als 0 erscheinen.

Für den ersten Test reicht die eigene Stimme des GM; weitere Teilnehmer sind nicht nötig.

## Noch nicht enthalten

- Opus-Decoding / PCM
- Speech-to-Text Provider
- echtes Sprach-Live-Transkript in Foundry
- KI-Extraktion
- automatische NPC-Memory-Änderungen
- Undo-Ausführung
- Transkript-Suche
- Session-Recap
- Discord-Kurzfassung

## Updates

Manifest:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Installationspaket:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Der Companion-Service liegt separat im Repository und ist nicht Teil des Foundry-Modul-ZIPs. Die Foundry-Version bleibt V0.9.21.
