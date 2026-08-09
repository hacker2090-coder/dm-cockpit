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
- lokaler Companion Service 0.2.0
- WebSocket + SQLite Ende-zu-Ende bestätigt
- Discord Voice Skeleton mit DAVE/E2EE und GM-Follow implementiert

## Bestätigter Foundry-Kern

**DM Cockpit V0.9.21 ist in Foundry funktional bestätigt.**

Für den Discord-Live-Transkript-Schritt wurden erfolgreich geprüft:

- Bereich sichtbar
- Mock-Status Live/Inaktiv
- Mock-Segmente
- Feed leeren
- NPC-Kontext aus dem NPC-Memory-Dropdown
- Anzeige `<Actorname> · Cockpit`

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

## Companion Service 0.1.0 – bestätigt

Der lokale Companion unter `companion/` wurde am 09.08.2026 auf dem Ziel-PC vollständig Ende-zu-Ende getestet.

Bestätigt:

- Node.js läuft auf dem Ziel-PC
- Companion startet lokal
- Foundry verbindet sich über `ws://127.0.0.1:43170/v1`
- `npm run mock` läuft erfolgreich über den echten WebSocket
- der Sprecher **Companion Mock** erscheint im Foundry-Transkript
- SQLite speichert Daten dauerhaft
- Health-Test bestätigte `sessions: 1`, `speakers: 1`, `segments: 1`, `npcContexts: 1`

Damit sind **Foundry ↔ WebSocket ↔ Companion ↔ SQLite** als funktionierende Basis bestätigt.

## Companion Service 0.2.0 – Discord Voice Skeleton

Neu implementiert:

- `companion/src/main.js`
- `companion/src/discord-voice.js`
- `discord.js` 14.27.0
- `@discordjs/voice` 0.19.2
- DAVE/E2EE ausdrücklich aktiviert
- Discord Gateway mit `Guilds` + `GuildVoiceStates`
- konfigurierter GM über Discord User ID
- automatischer Join in den aktuellen Voice-Channel des GM
- automatisches Folgen bei Channel-Wechsel
- automatisches Verlassen, wenn der GM Voice verlässt
- `selfDeaf: false` als Grundlage für späteren Audio-Empfang
- `selfMute: true`, solange der Bot selbst kein Audio sendet
- Discord Voice bleibt optional; ohne lokale Discord-Konfiguration läuft der bestätigte WebSocket-/SQLite-Kern weiterhin
- eigene GitHub-Actions-CI unter `.github/workflows/companion-ci.yml`

### Sicherheit der Zugangsdaten

Discord Bot Token und IDs werden ausschließlich über lokale Umgebungsvariablen konfiguriert. Der Bot-Token gehört weder in GitHub noch in Chat-Nachrichten.

Benötigte Variablen:

- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`
- `DISCORD_GM_USER_ID`

Details: `companion/README.md`

### Noch nicht enthalten

- Audio-Buffering / eigentliche Aufnahme
- Sprecher-Audiostreams
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

**Discord Voice Skeleton 0.2.0 auf einem echten Discord-Server testen.**

Dafür wird lokal ein Discord-Bot mit Zugriff auf den Zielserver benötigt. Der Nutzer muss keinen Token im Chat teilen; die Konfiguration erfolgt nur im lokalen PowerShell-Prozess.

Erst nach bestätigtem DAVE-Voice-Join folgt Audio-Buffering/Receive als eigener nächster Schritt.

## Updates

Manifest:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Installationspaket:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Der Companion-Service liegt separat im Repository und ist nicht Teil des Foundry-Modul-ZIPs. Die Foundry-Version bleibt daher V0.9.21.
