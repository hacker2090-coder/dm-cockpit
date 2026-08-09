# DM Cockpit Companion Service 0.10.0

Lokaler Dienst zwischen Foundry/DM Cockpit, Discord Voice, Speech-to-Text, SQLite und strukturierter KI-Extraktion.

Vollständige Projektübergabe: `../PROJECT-HANDOFF.md`
Kanonischer Status: `../PROJECT-CHECKPOINT.json`

## Bestätigte Baseline

Auf dem Nutzer-PC bestätigt:

- 0.1.0: Foundry ↔ WebSocket ↔ Companion ↔ SQLite
- 0.2.0: Discord Voice/DAVE/GM-Follow
- 0.3.0: sprechergetrennter Opus-Empfang, RAM-only
- 0.4.0: Deepgram Nova-3 STT Deutsch
- 0.5.0: realer Discord → STT → Protocol v1 → Foundry-Live-Transkript-Pfad plus Candidate/SQLite
- 0.6.0: provider-neutrale KI + Mock-End-to-End-Pipeline
- 0.7.0: OpenAI-Adapter mit Fake HTTP, kein echter bezahlter API-Aufruf
- 0.8.0: Ollama/qwen3:4b Preflight, echter E2E-Lauf und Qualitätsbenchmark
- 0.9.0: Candidate Review, SQLite-Status und Reload

Weiterhin gilt:

- keine dauerhafte Roh-Audio-Speicherung
- finale Transkriptsegmente werden dedupliziert
- NPC-Zuordnung kommt ausschließlich aus Foundry `npc.context`
- keine automatischen Actor-Writes ohne sicheren Änderungs-/Undo-Pfad oder explizite GM-Aktion

## Lokale KI – Ollama/Qwen3

Aktueller Standard:

```text
AI_PROVIDER=ollama
OLLAMA_AI_MODEL=qwen3:4b
OLLAMA_AI_ENDPOINT=http://127.0.0.1:11434/api/chat
OLLAMA_AI_NUM_CTX=8192
OLLAMA_AI_KEEP_ALIVE=10m
```

Eigenschaften:

- kein API-Key erforderlich
- `stream: false`
- `think: false`
- Structured Output per JSON-Schema
- Temperatur 0
- fixer Seed
- lokale Nachvalidierung
- ohne Foundry-NPC-Kontext keine NPC-Kandidaten

Qualitätsbenchmark auf dem Nutzer-PC:

- 11/12 = 91,7 %
- Mindestgrenze 80 %
- Ø 1066 ms
- P95 1935 ms
- `qwen3:4b` bleibt Standard

## Candidate Review – 0.9.0 bestätigt

Implementiert und lokal bestätigt:

- `candidate.review`
- `candidate.reviewed`
- `candidates.list.request`
- `candidates.list.result`
- `pending`, `accepted`, `rejected`
- persistente SQLite-Statusänderung
- Reload persistierter Kandidaten

Test:

```powershell
npm.cmd run test:candidate-review
```

Foundry 0.9.22 wurde real mit echtem Ollama-NPC-Kandidaten bestätigt: Annehmen/Verwerfen funktioniert, Annehmen schreibt in das bestehende NPC Memory.

## Change Record / Undo – 0.10.0 implementiert

Neu im aktuellen Code:

- `src/change-record-runtime.js`
- `change_records` Persistenz
- `npc.memory.applied`
- `change.undo.request`
- `change.undo.result`
- aktive Change-Records werden beim `hello` wieder gesendet
- `already_undone` für idempotentes Undo
- Change-Record-Statistiken im Health-Status

Smoke-Test:

```powershell
npm.cmd run test:change-record
```

Der Test prüft:

`persist -> list -> undo ready -> undone -> already_undone`

### Statusgrenze

Der 0.10.0-Code ist im Repository vorhanden, aber **noch nicht auf dem Nutzer-PC bestätigt**.

Der Companion stellt für ein Undo `before` und `after` bereit und persistiert anschließend den Undo-Status. Die eigentliche Wiederherstellung eines Foundry-Actor-Flags muss durch Foundry erfolgen. Dieser Foundry-Restore-End-to-End-Pfad ist noch nicht bestätigt.

## Provider

```text
AI_PROVIDER=none
AI_PROVIDER=mock
AI_PROVIDER=ollama
AI_PROVIDER=openai
```

OpenAI bleibt optionaler Fallback:

```text
OPENAI_AI_MODEL=gpt-5-nano
OPENAI_AI_ENDPOINT=https://api.openai.com/v1/responses
```

Beim OpenAI-Adapter bleibt `store: false` aktiv. Secrets gehören ausschließlich in `.env`.

## Speech-to-Text

Aktuell real bestätigt:

- Deepgram Nova-3
- Deutsch
- EU-Endpoint

Ollama ersetzt nur die LLM-Auswertung nach dem Transkript. Lokales STT ist noch nicht implementiert.

## Relevante Tests

```powershell
npm.cmd run check
npm.cmd run test:candidates
npm.cmd run test:candidate-review
npm.cmd run test:change-record
npm.cmd run test:ai
npm.cmd run test:ai-openai
npm.cmd run test:ai-ollama
npm.cmd run test:ollama-preflight
npm.cmd run test:ollama-quality
npm.cmd run test:ai-pipeline
npm.cmd run test:ai-pipeline-ollama
```

## Nächster einzelner Test

Nach `git pull`:

```powershell
cd $HOME\Desktop\dm-cockpit
cd companion
npm.cmd run check
```

Wenn grün, Companion starten und in einer zweiten PowerShell:

```powershell
npm.cmd run test:change-record
```

Frühere bestätigte Ollama-/Candidate-Review-Tests nicht ohne Regression wiederholen.
