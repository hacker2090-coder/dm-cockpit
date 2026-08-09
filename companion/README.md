# DM Cockpit Companion Service 0.4.0

Lokaler Zwischendienst zwischen Foundry/DM Cockpit, Discord Voice, Speech-to-Text und späteren KI-Komponenten.

## Bestätigter Stand

### Companion 0.1.0 – bestätigt

- Foundry ↔ lokaler WebSocket funktioniert
- echter Mock erscheint im Foundry-Live-Transkript
- SQLite speichert Session, Sprecher, Segment und NPC-Kontext

### Companion 0.2.0 – bestätigt

- Discord-Bot Login
- DAVE/E2EE Voice-Verbindung
- Auto-Join beim konfigurierten GM
- Folgen beim Voice-Channel-Wechsel
- Voice verlassen, wenn GM Voice verlässt

### Companion 0.3.0 – bestätigt

Am 09.08.2026 real mit Discord-Audio getestet:

- DAVE-entschlüsseltes Audio kommt im Companion an
- Sprechertrennung über Discord User ID funktioniert
- echte Opus-Pakete werden pro Sprecher im RAM gepuffert
- bestätigte Testsegmente: 362 Pakete / 49.801 Bytes und 105 Pakete / 14.643 Bytes
- keine Roh-Audiodateien auf Platte

## Neu in 0.4.0 – provider-neutrales Speech-to-Text

Dateien:

- `src/stt-service.js`
- `src/stt-deepgram.js`
- `src/companion-publisher.js`
- `src/main.js`

### Architektur

`SttService` ist provider-neutral. Auswahl erfolgt ausschließlich über:

```text
STT_PROVIDER=none
```

`none` ist bewusst der Standard. Dadurch wird **kein Discord-Audio an einen Cloud-Dienst gesendet**, solange der Nutzer STT nicht ausdrücklich lokal aktiviert.

Der erste reale Provider-Adapter ist:

```text
STT_PROVIDER=deepgram
```

Weitere Provider können später ergänzt werden, ohne Discord Voice, Audio Receive oder Foundry umzubauen.

### Warum Deepgram zuerst

Der bestehende Discord-Receive-Pfad liefert rohe Opus-Pakete mit 48 kHz Stereo. Deepgram Streaming STT akzeptiert rohes Opus direkt. Für den ersten realen Audio→Text-Pfad ist daher kein FFmpeg/PCM-Decode nötig.

Standardkonfiguration:

- Endpoint: `wss://api.eu.deepgram.com/v1/listen`
- Modell: `nova-3`
- Sprache: `de`
- Encoding: Opus
- Sample Rate: 48.000 Hz
- Channels: 2
- Smart Format: aktiv
- Provider-Diarization: nicht nötig, weil Discord User IDs bereits die Sprecher trennen

Provider-Vergleich und Quellen:

`docs/STT-PROVIDER-EVALUATION-2026-08-09.md`

### STT Queue / Schutzgrenzen

Standard:

- maximal 4 parallele STT-Jobs
- maximal 64 wartende Segmente
- 1 Retry bei Providerfehler
- sehr kurze Segmente unter 250 ms werden ignoriert
- Roh-Audio bleibt nur im RAM
- nach erfolgreichem oder endgültig fehlgeschlagenem STT-Job wird der Paketpuffer geleert

### Rückweg nach Foundry

Der neue interne `CompanionPublisher` benutzt den bereits bestätigten Protocol-v1-WebSocket als Rückkanal.

Er veröffentlicht:

- `session.started`
- `session.ended`
- `speaker.upserted`
- `capture.status`
- `transcript.segment`

Dadurch durchläuft ein echtes STT-Ergebnis denselben bestätigten Pfad wie bisher:

**Discord Voice → Opus Buffer → STT → Protocol v1 → SQLite → Foundry Live-Transkript**

Der bestehende Companion-WebSocket/SQLite-Server wurde für diesen Schritt bewusst nicht strukturell umgebaut.

## Voraussetzungen

- Node.js **24.17.0 oder neuer**
- npm
- DM Cockpit V0.9.21 oder neuer

## Update

```powershell
cd $HOME\Desktop\dm-cockpit
git pull
cd companion
npm.cmd install
npm.cmd run check
```

## Lokale `.env`

Die vorhandene `companion/.env` bleibt lokal erhalten und wird von Git ignoriert.

Bestehende Discord-Werte:

```text
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_GM_USER_ID=...
```

Für STT sind zusätzlich möglich:

```text
STT_PROVIDER=none
DEEPGRAM_API_KEY=
DEEPGRAM_STT_ENDPOINT=wss://api.eu.deepgram.com/v1/listen
DEEPGRAM_STT_MODEL=nova-3
DEEPGRAM_STT_LANGUAGE=de
STT_MAX_CONCURRENCY=4
STT_MAX_PENDING=64
STT_MAX_RETRIES=1
```

**API-Keys und Bot-Tokens bleiben ausschließlich lokal und gehören weder in GitHub noch in Chat-Nachrichten.**

## Start ohne Cloud-STT

Mit

```text
STT_PROVIDER=none
```

startet alles bisher Bestätigte normal:

```powershell
npm.cmd start
```

Discord Audio wird empfangen und segmentiert, aber nicht an einen STT-Provider gesendet.

## Erster Deepgram-Test

Erst wenn ein lokaler Deepgram API-Key vorhanden ist:

```text
STT_PROVIDER=deepgram
DEEPGRAM_API_KEY=DEIN_KEY_NUR_LOKAL
```

Danach:

1. Foundry öffnen und Live-Transkript mit dem Companion verbinden.
2. `npm.cmd start`.
3. Mit dem konfigurierten GM einem Discord-Voice-Channel beitreten.
4. Einen kurzen deutschen Satz sprechen.
5. Danach ca. 2 Sekunden still sein.

Erwartet im Terminal:

```text
[audio-receive] Segment ...
[stt] <Discord-Name>: "erkannter Satz" (Confidence ...)
```

Erwartet in Foundry:

- derselbe Satz erscheint im **Discord Live-Transkript**
- Sprechername entspricht dem Discord-Benutzer
- Segment ist final

Erwartet in SQLite/Health:

- `segments` steigt nach einem erfolgreichen STT-Segment
- `speakers` enthält den Discord-Benutzer
- eine Voice-Session wird erfasst

## Datenschutz des Audio-Pfads

Roh-Audio wird weiterhin nicht als Datei gespeichert. Mit aktiviertem STT bleibt das Opus-Segment im RAM, bis der STT-Job erfolgreich oder nach begrenzten Retries endgültig fehlgeschlagen ist; danach wird es freigegeben.

## Noch nicht enthalten

- zweiter realer STT-Provider
- KI-Extraktion aus Transkripten
- automatische NPC-Memory-Änderungen
- Undo-Ausführung für KI-Aktionen
- Transkript-Suche im Cockpit
- Session-Recap
- Discord-Kurzfassung

## Nächster einzelner Test

**Companion 0.4.0 real mit Deepgram testen:** deutscher Sprachsatz → STT-Terminalausgabe → Foundry Live-Transkript → SQLite.
