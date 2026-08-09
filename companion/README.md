# DM Cockpit Companion Service 0.2.0

Lokaler Zwischendienst zwischen Foundry/DM Cockpit und Discord-, Speech-to-Text- und KI-Komponenten.

## Bestätigter Stand

Companion 0.1.0 wurde auf dem Ziel-PC vollständig Ende-zu-Ende bestätigt:

- Foundry verbindet sich mit `ws://127.0.0.1:43170/v1`
- `npm run mock` durchläuft den echten WebSocket
- der Mock erscheint im Foundry-Live-Transkript
- SQLite speichert Session, Sprecher, Segment und NPC-Kontext

## Neu in 0.2.0 – Discord Voice Skeleton

Dateien:

- `src/main.js`
- `src/discord-voice.js`

Enthalten:

- Discord Gateway Login über `discord.js`
- nur `Guilds` und `GuildVoiceStates` als Gateway-Intents
- konfigurierter GM über Discord User ID
- automatischer Beitritt in den Voice-Channel des GM
- automatisches Folgen, wenn der GM den Voice-Channel wechselt
- Voice verlassen, wenn der GM Voice verlässt
- DAVE/E2EE in `@discordjs/voice` ausdrücklich aktiviert
- Bot joint mit `selfDeaf: false`, damit später Audio-Empfang möglich ist
- Bot bleibt `selfMute: true`, da noch kein Audio gesendet wird
- Join-/Ready-/Fehlerstatus im Companion-Terminal
- Discord-Konfiguration ist optional: Ohne lokale Variablen funktionieren WebSocket, SQLite und Mock weiterhin wie bisher

**Noch keine Audioaufnahme.** Wenn die Voice-Verbindung Ready ist, meldet der Skeleton den Capture-Zustand intern als `paused`. Audio-Buffering und STT kommen erst nach bestätigtem Voice-Test.

## Voraussetzungen

- Node.js **24.17.0 oder neuer**
- npm
- DM Cockpit V0.9.21 oder neuer

Der höhere Node-Mindeststand kommt von der aktuellen `@discordjs/voice`-Version mit DAVE-Unterstützung.

## Installation / Update

```powershell
cd $HOME\Desktop\dm-cockpit
git pull
cd companion
npm.cmd install
npm.cmd run check
```

Bei einer PowerShell ohne Skriptausführungsfreigabe `npm.cmd` statt `npm` verwenden.

## Start ohne Discord

```powershell
npm.cmd start
```

Ohne Discord-Konfiguration erscheint eine Meldung wie:

```text
[discord-voice] Deaktiviert. Lokal konfigurieren: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_GM_USER_ID
```

Der WebSocket-/SQLite-Service läuft trotzdem normal weiter.

## Discord Voice lokal konfigurieren

Die Werte **nur lokal im PowerShell-Fenster setzen**. Den Bot-Token niemals in GitHub committen und nicht in Chat-Nachrichten einfügen.

```powershell
$env:DISCORD_BOT_TOKEN="DEIN_TOKEN_NUR_LOKAL"
$env:DISCORD_GUILD_ID="DEINE_SERVER_ID"
$env:DISCORD_GM_USER_ID="DEINE_DISCORD_USER_ID"
npm.cmd start
```

Optional für ausführliche Voice-Debuglogs:

```powershell
$env:DM_COCKPIT_DISCORD_DEBUG="1"
```

### Erwartetes Verhalten

1. Companion startet.
2. Bot meldet sich bei Discord an.
3. Wenn der konfigurierte GM bereits in einem Voice-Channel ist, joint der Bot diesen Channel.
4. Wechselt der GM den Channel, folgt der Bot.
5. Verlässt der GM Voice, verlässt auch der Bot den Voice-Channel.
6. Bei erfolgreicher Verbindung erscheint im Terminal sinngemäß `Folge GM in '<Channel>'; DAVE aktiviert.`

## Lokaler WebSocket + SQLite Mock

Der bereits bestätigte Mock bleibt erhalten:

```powershell
npm.cmd run mock
```

Standardmäßig:

- WebSocket: `ws://127.0.0.1:43170/v1`
- Health: `http://127.0.0.1:43170/health`
- SQLite: `companion/data/dm-cockpit.sqlite`

## Persistiert

SQLite enthält Tabellen für:

- Sessions
- Sprecher
- finale Transkriptsegmente
- NPC-Kontext-Ereignisse
- zukünftige Undo-/Change-Records

Partielle Transkriptsegmente werden nicht dauerhaft gespeichert.

## Konfiguration über Umgebungsvariablen

Companion:

- `DM_COCKPIT_HOST` – Standard `127.0.0.1`
- `DM_COCKPIT_PORT` – Standard `43170`
- `DM_COCKPIT_WS_PATH` – Standard `/v1`
- `DM_COCKPIT_DB_PATH` – optional eigener SQLite-Pfad
- `DM_COCKPIT_WS_URL` – nur für `npm run mock`

Discord Voice:

- `DISCORD_BOT_TOKEN` – Bot-Token, nur lokal
- `DISCORD_GUILD_ID` – Discord-Server-ID
- `DISCORD_GM_USER_ID` – Discord-User-ID des GM, dem der Bot folgen soll
- `DM_COCKPIT_DISCORD_DEBUG=1` – optionale Debugausgabe

## Noch nicht enthalten

- Audio-Buffering / Audio-Aufzeichnung
- Sprecher-Audiostreams
- Speech-to-Text
- KI-Extraktion
- automatische NPC-Memory-Änderungen
- Undo-Ausführung
- Transkript-Suche
- Recap / Discord-Kurzfassung

## Nächster einzelner Test

**Discord Voice 0.2.0 gegen einen echten Discord-Server testen:** Bot lokal konfigurieren, GM einem Voice-Channel beitreten lassen und prüfen, ob der Bot automatisch joint, folgt und wieder verlässt.
