# DM Cockpit Companion Service 0.7.0

Lokaler Dienst zwischen Foundry/DM Cockpit, Discord Voice, Speech-to-Text, SQLite und strukturierter KI-Extraktion.

## Bestätigte Baseline: 0.6.0

Auf dem Nutzer-PC vollständig bestätigt:

- Discord Bot + DAVE/E2EE
- Auto-Join/Follow beim konfigurierten GM
- sprechergetrennter Opus-Empfang nur im RAM
- Deepgram Nova-3 STT (`de`, EU-Endpunkt)
- Protocol v1 → SQLite → Foundry-Live-Transkript
- `npc.memory.candidate` Broadcast/Persistenz
- `session.event.candidate` Broadcast/Persistenz
- provider-neutrale `AiExtractionService`
- deterministischer Mock-Provider
- Final-only + Deduplizierung
- NPC-Kontext + Latest-Context-Fallback
- automatische Mock-Pipeline `transcript.segment → Kandidaten → Protocol v1 → SQLite`
- keine automatischen Actor-Writes

## Neu in 0.7.0: realer OpenAI-Adapter

Datei:

- `src/ai-extraction-openai.js`

Aktivierung erfolgt ausschließlich lokal über:

```text
AI_PROVIDER=openai
OPENAI_API_KEY=...
```

Der sichere Standard bleibt:

```text
AI_PROVIDER=none
```

Damit wird ohne ausdrückliche lokale Aktivierung **kein Transkript an einen LLM-Provider gesendet**.

### Standardmodell

```text
OPENAI_AI_MODEL=gpt-5.4-nano
```

Das Modell ist für kostensensitive, hochvolumige Klassifikation und Datenextraktion vorgesehen und unterstützt Structured Outputs.

### API-Vertrag

Der Adapter nutzt die OpenAI Responses API:

```text
https://api.openai.com/v1/responses
```

Schutzmaßnahmen:

- `store: false`
- Strict Structured Output per JSON Schema
- maximal 8 NPC- und 8 Session-Kandidaten pro Segment
- Kategorien ausschließlich aus den Protocol-v1-Enums
- lokale Nachvalidierung nach der Modellantwort
- ohne aktiven Foundry-NPC-Kontext werden alle NPC-Kandidaten verworfen
- die Actor-ID wird **nie vom Modell bestimmt**; sie kommt ausschließlich aus `npc.context`
- keine Actor-Writes
- keine Tokens/API-Keys in GitHub oder Checkpoints

An den Provider werden bei aktivierter OpenAI-Extraktion übertragen:

- finales Transkriptsegment
- Sprecher-Anzeigename
- Session-ID
- lesbarer NPC-Kontext, falls aktiv

Roh-Audio wird nicht an den LLM-Adapter übergeben.

## Provider

```text
AI_PROVIDER=none     # sicherer Standard
AI_PROVIDER=mock     # deterministischer lokaler Testprovider
AI_PROVIDER=openai   # realer OpenAI-Adapter
```

## Tests

Syntax/Grundprüfung:

```powershell
npm.cmd run check
```

Deterministische Mock-Extraktion:

```powershell
npm.cmd run test:ai
```

OpenAI-Adapter ohne echten API-Aufruf testen:

```powershell
npm.cmd run test:ai-openai
```

Dieser Test verwendet einen lokalen Fake-HTTP-Response und bestätigt:

- Responses-API-Payload
- `store=false`
- Strict Structured Output
- Actor-Zuordnung aus Foundry-Kontext
- lokale Nachvalidierung
- kein echter API-Key und keine Kosten

Ende-zu-Ende Candidate-Pipeline:

```powershell
npm.cmd run test:ai-pipeline
```

Dieser Test funktioniert mit laufendem Companion sowohl für `AI_PROVIDER=mock` als auch für den späteren kontrollierten Realtest mit `AI_PROVIDER=openai`.

## `.env`

Secrets bleiben ausschließlich lokal in `companion/.env`.

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
OPENAI_API_KEY=
OPENAI_AI_MODEL=gpt-5.4-nano
OPENAI_AI_ENDPOINT=https://api.openai.com/v1/responses
OPENAI_AI_TIMEOUT_MS=20000
```

## Noch nicht bestätigt / enthalten

- echter OpenAI-API-Aufruf auf dem Nutzer-PC
- Qualitätsevaluation an echten Session-Sätzen
- Foundry Candidate UI
- Annehmen/Verwerfen in Foundry
- automatische Actor-Memory-Änderungen
- Undo-Ausführung
- Transkript-Suche
- Session-Recap / Discord-Kurzfassung

## Nächster einzelner Schritt

0.7.0 lokal mit `npm.cmd run check` und `npm.cmd run test:ai-openai` bestätigen. Danach erst einen lokalen OpenAI API-Key setzen und einen kontrollierten echten Pipeline-Test ausführen.
