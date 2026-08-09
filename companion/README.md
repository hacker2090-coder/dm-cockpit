# DM Cockpit Companion Service 0.3.0

Lokaler Zwischendienst zwischen Foundry/DM Cockpit und Discord-, Speech-to-Text- und KI-Komponenten.

## Bestätigter Stand

### Companion 0.1.0 – bestätigt

- Foundry verbindet sich mit `ws://127.0.0.1:43170/v1`
- `npm run mock` durchläuft den echten WebSocket
- der Mock erscheint im Foundry-Live-Transkript
- SQLite speichert Session, Sprecher, Segment und NPC-Kontext

### Companion 0.2.0 – bestätigt

Auf dem Zielserver real getestet:

- Discord-Bot meldet sich erfolgreich an
- Bot joint automatisch den Voice-Channel des konfigurierten GM
- Bot folgt beim Wechsel in einen anderen Voice-Channel
- Bot verlässt Voice wieder, wenn der GM Voice verlässt
- DAVE/E2EE-Verbindung funktioniert ohne Fehler

## Neu in 0.3.0 – Audio Receive / Sprecher-Buffering

Dateien:

- `src/audio-receive.js`
- `src/main.js`
- `src/discord-voice.js`

Enthalten:

- echter Discord-Audioempfang über den `VoiceReceiver` von `@discordjs/voice`
- getrennte Audio-Subscriptions nach Discord User ID
- ein eigener temporärer Opus-Puffer pro gleichzeitig sprechendem Discord-User
- Segmentende nach 1,2 Sekunden Audio-Inaktivität
- maximal 60 Sekunden pro einzelner Sprechsequenz
- maximal 8 MiB Opus-Daten pro Sprechsequenz
- Schutz vor doppelter Subscription desselben Users
- Bot-eigene Audio-ID wird ignoriert
- Segmentmetadaten: User ID, Start, Ende, Dauer, Paketanzahl, Byteanzahl, Kürzungsgrund
- Puffer liegt ausschließlich im RAM
- keine Audiodateien auf Platte
- noch keine Übertragung an STT oder Cloud
- Paketpuffer wird nach dem Segment-Callback freigegeben

Der Audio-Receive-Schritt dient zunächst nur dazu zu beweisen, dass DAVE-entschlüsseltes Discord-Audio pro Sprecher im Companion ankommt. Erst danach wird ein STT-Adapter angebunden.

## Voraussetzungen

- Node.js **24.17.0 oder neuer**
- npm
- DM Cockpit V0.9.21 oder neuer

## Installation / Update

```powershell
cd $HOME\Desktop\dm-cockpit
git pull
cd companion
npm.cmd install
npm.cmd run check
```

Bei einer PowerShell ohne Skriptausführungsfreigabe `npm.cmd` statt `npm` verwenden.

## Lokale Discord-Konfiguration über `.env`

Der Companion lädt beim Start automatisch eine vorhandene `companion/.env`. Diese Datei ist per `.gitignore` ausgeschlossen und darf nicht committed werden.

Vorlage erzeugen:

```powershell
Copy-Item .env.example .env
notepad .env
```

In `.env` eintragen:

```text
DISCORD_BOT_TOKEN=DEIN_TOKEN_NUR_LOKAL
DISCORD_GUILD_ID=DEINE_SERVER_ID
DISCORD_GM_USER_ID=DEINE_DISCORD_USER_ID
DM_COCKPIT_DISCORD_DEBUG=0
```

**Den Bot-Token niemals in GitHub oder Chat-Nachrichten einfügen.**

## Start

```powershell
npm.cmd start
```

Ohne Discord-Konfiguration läuft der WebSocket-/SQLite-Service weiterhin normal; Discord Voice bleibt deaktiviert.

Optional für ausführliche Voice-/Audio-Debuglogs:

```text
DM_COCKPIT_DISCORD_DEBUG=1
```

## Audio-Receive-Test 0.3.0

Für den ersten Test reicht der konfigurierte GM alleine in einem Voice-Channel.

1. Repository aktualisieren und `npm.cmd install` ausführen.
2. `npm.cmd run check` ausführen.
3. `npm.cmd start` starten.
4. Mit dem konfigurierten GM einem Voice-Channel beitreten.
5. Der Bot muss wie in 0.2.0 automatisch folgen.
6. Etwa 3–5 Sekunden normal sprechen.
7. Danach mindestens 2 Sekunden still sein.
8. Im Terminal muss ein Eintrag ähnlich diesem erscheinen:

```text
[audio-receive] Segment <DiscordUserId>: <n> Opus-Pakete, <n> Bytes, <n> ms.
[audio-receive] Bereit für späteres STT: User <DiscordUserId>, <n> Pakete, <n> Bytes.
```

Wenn mehrere Personen gleichzeitig sprechen, werden ihre Streams unabhängig nach Discord User ID gepuffert. Für den ersten Funktionstest ist jedoch nur die eigene Stimme nötig.

## Datenschutz dieses Zwischenstands

0.3.0 schreibt empfangenes Roh-Audio **nicht auf die Festplatte**. Opus-Pakete existieren nur temporär im RAM eines Sprechsegments und werden danach freigegeben. Ein dauerhafter Roh-Audio-Workflow wird nicht eingeführt; beim späteren STT-Schritt bleibt das Ziel, Audio nur so lange vorzuhalten, wie es für die erfolgreiche Transkription benötigt wird.

## Lokaler WebSocket + SQLite Mock

Der bestätigte Mock bleibt erhalten:

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

Roh-Audio wird in 0.3.0 nicht persistiert.

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

- Opus-Decoding zu PCM/WAV
- Speech-to-Text Provider
- Live-Transkript aus echter Sprache
- KI-Extraktion
- automatische NPC-Memory-Änderungen
- Undo-Ausführung
- Transkript-Suche
- Recap / Discord-Kurzfassung

## Nächster einzelner Test

**Companion 0.3.0 Audio Receive:** mit dem GM alleine sprechen und prüfen, ob nach der Sprechpause ein `[audio-receive] Segment ...` mit derselben Discord User ID und einer Paket-/Byteanzahl größer als 0 erscheint.
