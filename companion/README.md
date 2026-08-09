# DM Cockpit Companion Service 0.6.0

Lokaler Dienst zwischen Foundry/DM Cockpit, Discord Voice, Speech-to-Text, SQLite und der neuen strukturierten KI-Extraktionsschicht.

## Bestätigte Baseline: 0.5.0

Auf dem Nutzer-PC vollständig bestätigt:

- Discord Bot + DAVE/E2EE
- Auto-Join/Follow beim konfigurierten GM
- sprechergetrennter Opus-Empfang nur im RAM
- Deepgram Nova-3 STT (`de`, EU-Endpunkt)
- Protocol v1 → SQLite → Foundry-Live-Transkript
- `npc.memory.candidate` Broadcast/Persistenz
- `session.event.candidate` Broadcast/Persistenz

## Neu in 0.6.0

### Provider-neutrale Extraktion

`src/ai-extraction-service.js` kapselt die Extraktionslogik. Auswahl über:

```text
AI_PROVIDER=none
```

`none` bleibt der sichere Standard. Dadurch wird ohne ausdrückliche Aktivierung **keine KI-Extraktion ausgeführt**.

Für reproduzierbare lokale Tests existiert:

```text
AI_PROVIDER=mock
```

Der Mock ist deterministisch und überträgt keine Daten an externe Dienste. Ein realer LLM-Provider ist noch nicht implementiert.

### Automatische Datenstrecke

```text
final transcript.segment
→ Protocol-v1-Broadcast
→ AiExtractionService
→ npc.memory.candidate / session.event.candidate
→ Companion Server
→ SQLite + WebSocket-Broadcast
```

`npc.context` wird pro Session verfolgt und der Extraktion als aktueller NPC-Kontext mitgegeben.

### Sicherheitsregeln

- nur finale Transkriptsegmente
- Deduplizierung per `segmentId`
- `sourceSegmentIds` bleiben erhalten
- Kandidaten tragen Provider/Modell/Confidence/Status
- keine automatischen Actor-Schreibvorgänge
- keine Undo-Ausführung in 0.6.0
- kein echter LLM/API-Key in dieser Version notwendig

## Tests

Syntax/Grundprüfung:

```powershell
npm.cmd run check
```

Deterministischer Extraktionstest:

```powershell
npm.cmd run test:ai
```

Der Test bestätigt:

- NPC-Kandidat `promise`
- Session-Kandidat `task`
- NPC-Kontext-Zuordnung
- Quellenbindung an `sourceSegmentIds`
- Partials werden ignoriert
- Duplikate werden ignoriert
- Session-Entscheidung funktioniert auch ohne NPC-Kontext

Candidate-Infrastruktur aus 0.5.0:

```powershell
npm.cmd run test:candidates
```

## Lokales Update

```powershell
Ctrl+C
cd $HOME\Desktop\dm-cockpit
git pull
cd companion
npm.cmd install
npm.cmd run check
npm.cmd run test:ai
```

## `.env`

Secrets bleiben ausschließlich lokal in `companion/.env`.

Beispiel:

```text
DISCORD_BOT_TOKEN=...
DISCORD_GUILD_ID=...
DISCORD_GM_USER_ID=...

STT_PROVIDER=deepgram
DEEPGRAM_API_KEY=...
DEEPGRAM_STT_ENDPOINT=wss://api.eu.deepgram.com/v1/listen
DEEPGRAM_STT_MODEL=nova-3
DEEPGRAM_STT_LANGUAGE=de

AI_PROVIDER=none
```

Für den späteren 0.6.0-Ende-zu-Ende-Mock-Test wird `AI_PROVIDER=mock` nur temporär aktiviert.

## Noch nicht enthalten

- realer LLM/AI-Provider
- Foundry Candidate UI
- Annehmen/Verwerfen in Foundry
- automatische Actor-Memory-Änderungen
- Undo-Ausführung
- Transkript-Suche
- Session-Recap / Discord-Kurzfassung

## Nächster Schritt

0.6.0 auf dem Nutzer-PC mit `npm.cmd run check` und `npm.cmd run test:ai` bestätigen. Danach automatische Protocol-Pipeline mit temporärem `AI_PROVIDER=mock` Ende-zu-Ende testen.
