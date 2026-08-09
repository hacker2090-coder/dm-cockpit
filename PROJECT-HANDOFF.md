# DM Cockpit – Master Handoff

Stand: 2026-08-09 15:19 CEST

Dieses Dokument ist der Einstiegspunkt für einen neuen Chat/eine andere KI. Es beschreibt Ziel, Architektur, bestätigten Stand, Historie, Sicherheitsregeln und den nächsten Arbeitsblock. Für den jeweils letzten maschinenlesbaren Zustand zusätzlich immer `PROJECT-CHECKPOINT.json` lesen.

## 1. Projektziel

DM Cockpit ist ein Foundry-VTT-V14-Modul plus lokaler Companion Service. Ziel ist ein zentrales GM-Live-Cockpit, das möglichst viel Session-Arbeit ohne ständiges Wechseln zwischen Foundry, Discord und Notizen abdeckt.

Produktprinzipien:

- im Live-Betrieb nur wenige relevante Aktionen gleichzeitig zeigen;
- Warnungen und Zeitdruck priorisieren;
- seltene Funktionen einklappen oder in Kontextaktionen verschieben;
- KI darf Vorschläge erzeugen;
- KI darf nicht ungefragt die Foundry-Welt verändern;
- automatische Welt-/Actor-Änderungen erst mit Undo/Change-Record oder expliziter GM-Bestätigung.

## 2. Repository und lokale Umgebung

- Repository: `hacker2090-coder/dm-cockpit`
- Branch: `main`
- lokales Repo: `$HOME\Desktop\dm-cockpit`
- Foundry-Modul-ID: `dm-cockpit`
- aktuelles Foundry-Modul: `0.9.22`
- aktueller Companion-Code: `0.10.0`
- Node: `>=24.17.0`; Nutzer-PC bestätigte 24.18.1
- Companion WebSocket: `ws://127.0.0.1:43170/v1`
- Health: `http://127.0.0.1:43170/health`
- SQLite: `companion/data/dm-cockpit.sqlite`
- lokale Secrets: `companion/.env`, gitignored

PowerShell-Regel:

```powershell
cd $HOME\Desktop\dm-cockpit
git pull
cd companion
npm.cmd ...
```

`npm.cmd` verwenden, nicht `npm`, weil die PowerShell-Execution-Policy `npm.ps1` blockieren kann.

## 3. Arbeitsregeln des Chats

Diese Regeln nicht ohne ausdrückliche Nutzerentscheidung ändern:

1. Immer nur einen TODO-Block gleichzeitig verfolgen.
2. Möglichst autonom arbeiten; Nutzer nur für echte lokale/externe Tests, Secrets/Zugänge oder nicht sinnvoll ableitbare Entscheidungen einbeziehen.
3. Bekannte Antworten nicht erneut abfragen.
4. Auswahlfragen/strukturierte Entscheidungen über HTML-Dateien führen; Ergebnis muss kopierbar sein.
5. Regelmäßig JSON-Checkpoints erstellen.
6. Reguläre Checkpoints doppelt sichern: GitHub + ChatGPT Library `/DM Cockpit/`.
7. Kanonischer GitHub-Checkpoint: `PROJECT-CHECKPOINT.json`; historische Snapshots: `checkpoints/`.
8. Wenn Nutzeraktion nötig ist, Abschnitt exakt `Ich möchte von dir` verwenden.
9. Niemals Discord-Bot-Token, Deepgram-Key, OpenAI-Key, Passwörter oder andere Secrets in Chat/GitHub/Checkpoint speichern.
10. Roh-Audio nicht dauerhaft speichern; nur temporär im RAM bis zur Verarbeitung.
11. Keine automatischen Actor-/Weltänderungen ohne Change-Record/Undo oder klare GM-Bestätigung.

## 4. Architektur

### Foundry

Foundry ist UI und Weltzustand. Es verarbeitet kein Discord-Audio.

Bestätigte Kernfunktionen bis 0.9.22:

- LIVE-Dashboard
- Abenteuer-Flowchart
- spontane Szenen
- Szenen-Presets
- Gegner-Spawnpunkte
- Enemy Reserve Bench
- Handout Queue
- Loot-/Belohnungspakete
- Item-Suche
- Compendium-Schnellsuche
- NPC-Schnellgenerator
- Actor-basiertes NPC Memory
- Discord Live-Transkript UI/Transport
- NPC-Kontext aus Cockpit-Actor oder ausgewähltem Token
- manuelle KI-Kandidatenprüfung mit Annehmen/Verwerfen
- Foundry/GitHub Update-System

NPC-Memory-Flag:

`flags['dm-cockpit'].actionMemory`

NPC-Schnellprofil:

`flags['dm-cockpit'].quickNpc`

### Companion

Der Companion übernimmt:

- Discord Gateway/Voice
- DAVE/E2EE
- GM-Follow/Auto-Join
- sprechergetrennten Audioempfang
- temporäre Audio-Pufferung
- STT
- KI-Extraktion
- SQLite-Persistenz
- Protocol-v1-WebSocket zu Foundry

### Speech-to-Text

Aktuell real bestätigt:

- Provider: Deepgram
- Modell: Nova-3
- Sprache: Deutsch
- Endpoint: EU-Endpoint

Ollama ersetzt nur die LLM-Extraktion nach dem Transkript, nicht das STT.

### KI-Extraktion

Provider-neutral:

- `none`
- `mock`
- `ollama`
- `openai`

Aktueller Standard: lokales Ollama mit `qwen3:4b`.

Konfiguration:

```text
AI_PROVIDER=ollama
OLLAMA_AI_MODEL=qwen3:4b
OLLAMA_AI_ENDPOINT=http://127.0.0.1:11434/api/chat
OLLAMA_AI_NUM_CTX=8192
OLLAMA_AI_KEEP_ALIVE=10m
```

Ollama benötigt lokal keinen API-Key.

## 5. Protocol v1

Version: `1.0`

Relevante Nachrichtentypen:

- `hello`
- `hello.ack`
- `health`
- `session.started`
- `session.ended`
- `speaker.upserted`
- `capture.status`
- `transcript.segment`
- `npc.context`
- `npc.memory.candidate`
- `session.event.candidate`
- `candidate.review`
- `candidate.reviewed`
- `candidates.list.request`
- `candidates.list.result`
- `npc.memory.applied`
- `change.undo.request`
- `change.undo.result`
- `error`

Vertrag und Schema:

- `docs/DISCORD-AUDIO-AI-CONTRACT-V1.md`
- `schemas/discord-audio-ai-v1.schema.json`

NPC-Kandidatentypen:

`statement`, `knowledge`, `action`, `relationship`, `promise`, `lie`, `deadline`, `consequence`, `other`

Session-Kandidatentypen:

`decision`, `quest`, `task`, `loot`, `reward`, `open_question`, `combat`, `event`, `other`

Actor-ID wird niemals vom Modell erfunden. NPC-Kandidaten dürfen nur entstehen, wenn Foundry einen gültigen `npc.context` geliefert hat.

## 6. SQLite

Wichtige Tabellen:

- `meta`
- `sessions`
- `speakers`
- `transcript_segments`
- `npc_context_events`
- `npc_memory_candidates`
- `session_event_candidates`
- `change_records`

Finale Transkripte und Kandidaten werden persistiert. Roh-Audio wird nicht dauerhaft gespeichert.

## 7. Versions- und Testhistorie

### Companion 0.1.0

Bestätigt:

Foundry ↔ WebSocket ↔ Companion ↔ SQLite.

### 0.2.0

Bestätigt:

Discord Login, DAVE/E2EE, Auto-Join, Follow des konfigurierten GM, Channel-Wechsel und Leave bei GM-Leave.

### 0.3.0

Bestätigt:

sprechergetrennter Discord-Opus-Empfang; Audio nur temporär im RAM.

### 0.4.0

Bestätigt:

Discord → Deepgram Nova-3 → deutsches Transkript.

### 0.5.0

Vollständig lokal bestätigt:

- Health
- Discord/DAVE
- Deepgram
- Foundry Live-Transkript
- Candidate-Broadcast
- SQLite

Realer Sprachtest enthielt u. a. den Satz: „Das ist der Regressions Test für DM Cockpit Version 0 Punkt 5 Punkt 0.“; Confidence 0.961; Satz war in Foundry sichtbar.

### 0.6.0

Vollständig lokal bestätigt:

- provider-neutraler `AiExtractionService`
- deterministischer Mock
- Final-only
- Deduplizierung
- NPC-Kontext
- NPC- und Session-Kandidaten
- End-to-End Mock-Pipeline bis Protocol v1/Broadcast/SQLite

### 0.7.0

Auf Nutzer-PC bestätigt:

- Syntax
- OpenAI-Adapter mit Fake-HTTP
- Responses API Payload
- `store=false`
- Strict Structured Output
- Actor-Zuordnung aus Foundry-Kontext

Kein echter OpenAI-Aufruf; keine API-Kosten.

Aktueller optionaler OpenAI-Fallback: `gpt-5-nano`.

### 0.8.0

Vollständig lokal bestätigt:

- Ollama-Adapter
- `qwen3:4b`
- Preflight gegen echten Ollama-Dienst
- echter Ollama-End-to-End-Test
- Protocol v1/Broadcast/SQLite
- 12-Fälle-Qualitätsbenchmark

Benchmark `qwen3:4b`:

- 11/12 bestanden
- 91,7 %
- Mindestgrenze 80 %
- Ø 1066 ms
- P95 1935 ms
- einziger Fehlfall: `npc-relationship` wurde als `statement` klassifiziert

Entscheidung: `qwen3:4b` bleibt Standard. `qwen3:8b` ist aktuell nicht nötig.

### 0.9.0

Vollständig lokal bestätigt:

- `candidate.review`
- `candidate.reviewed`
- `candidates.list.request/result`
- Status `pending/accepted/rejected`
- persistente SQLite-Review-Status
- Reload der Kandidaten
- Candidate-Review-Smoke-Test

Foundry 0.9.22 wurde anschließend real bestätigt:

- Karte `KI-Kandidaten` sichtbar
- realer Ollama-Kandidat mit echtem Foundry-Actor-Kontext sichtbar
- `Annehmen` funktioniert
- `Verwerfen` funktioniert
- angenommener NPC-Kandidat wird dem bestehenden NPC Memory hinzugefügt
- keine automatische Übernahme ohne GM-Klick

### Companion 0.10.0 – aktueller Code

Bereits im Repository implementiert, aber **noch nicht auf dem Nutzer-PC bestätigt**:

- `companion/src/change-record-runtime.js`
- Persistenz von `change_records`
- `npc.memory.applied`
- `change.undo.request`
- `change.undo.result`
- aktiver Change-Record-Reload beim `hello`
- idempotentes Undo (`already_undone`)
- `npm.cmd run test:change-record`

Wichtige Abgrenzung: Der Companion kann Change-Records speichern, Vorher/Nachher liefern und den Undo-Status persistieren. Die tatsächliche Wiederherstellung des Foundry-Actor-Flags muss Foundry ausführen und danach `undone` zurückmelden. Dieser Foundry-Restore-Pfad ist noch nicht als Runtime-Test bestätigt.

## 8. Aktueller Pausepunkt

Bestätigt bis einschließlich:

- Foundry 0.9.22 Candidate Review
- Companion 0.9.0 Candidate Review Backend
- lokales Ollama/qwen3:4b mit 91,7-%-Benchmark

Im Repository zusätzlich vorhanden, aber noch unbestätigt:

- Companion 0.10.0 Change-Record/Undo-Backend

## 9. Nächster einzelner Arbeitsblock

Nicht wieder bei Ollama, Candidate Review oder Foundry-UI anfangen.

Als Nächstes:

1. Companion 0.10.0 lokal holen (`git pull`).
2. `npm.cmd run check` ausführen.
3. Companion starten.
4. In zweiter PowerShell `npm.cmd run test:change-record` ausführen.
5. Wenn grün: 0.10.0 Backend als bestätigt checkpointen.
6. Danach Foundry-seitigen Restore/Undo-Pfad implementieren bzw. vervollständigen.
7. Erst danach einen echten NPC-Memory-Undo-Test mit einem Test-Actor durchführen.

## 10. Danach geplante Roadmap

1. Undo/Change-Record End-to-End inklusive Foundry Restore
2. optional automatische NPC-Memory-Übernahme nur mit sicherem Undo
3. dauerhaft durchsuchbares Transkript
4. Session-Historie
5. Recap
6. Discord-Kurzfassung
7. optional lokales STT als Ersatz für Deepgram
8. Performance-/Skalierungs-Hardening

## 11. Was nicht erneut getestet werden soll

Ohne neue Regression nicht wiederholen:

- Discord-Bot neu anlegen
- Deepgram-Konto neu einrichten
- Secrets erneut anfordern
- Companion 0.1–0.7 Baseline-Tests
- 0.8 Ollama Adapter/Preflight/E2E/Qualitätsbenchmark
- 0.9 Candidate-Review-Smoke-Test
- Foundry 0.9.22 Sichtbarkeit der KI-Kandidatenkarte
- Foundry realer Ollama-Kandidat
- Foundry Annehmen/Verwerfen
- Foundry Annehmen → NPC Memory

## 12. Wichtige Dateien

- `PROJECT-CHECKPOINT.json` – kanonischer maschinenlesbarer Status
- `PROJECT-HANDOFF.md` – kompletter menschlich/LLM-lesbarer Übergabestand
- `checkpoints/` – historische Snapshots
- `module.json` – Foundry Manifest
- `scripts/live-transcript.js` – Foundry Transport/Live-Transkript
- `scripts/ai-candidate-review.js` – Foundry Kandidatenprüfung
- `scripts/npc-action-memory.js` – Actor-basiertes NPC Memory
- `companion/src/server.js` – Protocol-v1-Server
- `companion/src/store.js` – SQLite Store
- `companion/src/change-record-runtime.js` – Change-Record/Undo Backend
- `companion/src/change-record-smoke-test.js` – 0.10 Undo Backend Smoke Test
- `companion/src/ai-extraction-ollama.js` – lokaler Qwen/Ollama Provider
- `docs/DISCORD-AUDIO-AI-CONTRACT-V1.md` – Protokollvertrag
- `schemas/discord-audio-ai-v1.schema.json` – Protokollschema

## 13. Handoff-Regel für eine neue KI

Eine neue KI soll zuerst `PROJECT-HANDOFF.md` und `PROJECT-CHECKPOINT.json` lesen. Repository-Code ist die technische Quelle der Wahrheit; bei einem Widerspruch zwischen Dokumentation und Code muss der reale Code-/Versionsstand geprüft und der Checkpoint korrigiert werden. Danach am `next_single_external_test` bzw. dem nächsten unbestätigten Block fortsetzen – nicht frühere bestätigte Arbeit wiederholen.
