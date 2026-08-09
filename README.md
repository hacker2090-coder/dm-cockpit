# DM Cockpit V0.9.21

Foundry-VTT-V14-Modul plus lokaler Companion Service für Discord Voice, Live-Transkript, NPC-Kontext und strukturierte KI-Kandidaten.

## Aktueller Stand

### Foundry V0.9.21 – funktional bestätigt

Bestätigte Kernfunktionen:

- LIVE-Dashboard
- Abenteuer-Flowchart
- spontane Szenen und Szenen-Presets
- Gegner-Spawnpunkte und Enemy Reserve Bench
- Handout Queue
- Loot-/Belohnungspakete + Item-Suche
- Compendium-Schnellsuche
- NPC-Schnellgenerator
- Actor-basiertes NPC Memory
- Discord Live-Transkript UI/Transport-Client
- NPC-Kontext aus Cockpit-Actor bzw. ausgewähltem Foundry-Token
- Foundry/GitHub Update-System

Foundry bleibt auf **V0.9.21**. Der Companion wird unabhängig davon versioniert.

## Companion – vollständig bestätigte Stufen

### 0.5.0

Auf dem Nutzer-PC bestätigt:

- Foundry ↔ WebSocket ↔ Companion ↔ SQLite
- Discord Bot Login
- DAVE/E2EE Voice
- Auto-Join/Follow beim konfigurierten GM
- sprechergetrennter Discord-Opus-Empfang
- keine dauerhafte Roh-Audio-Speicherung
- Deepgram Nova-3 STT auf Deutsch
- echter Discord → Deepgram → Protocol v1 → Foundry-Live-Transkript-Pfad
- Candidate-Broadcast + SQLite-Persistenz

### 0.6.0

Auf dem Nutzer-PC vollständig bestätigt:

- provider-neutraler `AiExtractionService`
- deterministischer Mock-Provider
- Final-only und Segment-Deduplizierung
- NPC-Kontext + Latest-Context-Fallback
- `npc.memory.candidate`
- `session.event.candidate`
- End-to-End Mock-Pipeline bis Protocol v1/Broadcast/SQLite
- keine automatischen Actor-Writes

### 0.7.0

Auf dem Nutzer-PC bestätigt:

- Syntaxprüfung
- isolierter OpenAI-Adaptertest mit Fake-HTTP-Response
- Responses-API-Payload
- `store=false`
- Strict Structured Output
- Actor-Zuordnung ausschließlich aus Foundry-Kontext

Ein echter kostenpflichtiger OpenAI-Aufruf wurde bewusst **nicht** durchgeführt.

## Companion 0.8.0 – kostenlose lokale KI vorbereitet

Der bevorzugte nächste Pfad ist lokal über **Ollama + Qwen3** statt kostenpflichtiger LLM-API.

Implementiert:

- `AI_PROVIDER=ollama`
- lokaler Ollama-Adapter
- Standardmodell `qwen3:4b`
- Standardendpoint `http://127.0.0.1:11434/api/chat`
- Structured Outputs per JSON-Schema
- `think=false`
- Temperatur 0
- Kontext 8192 Tokens
- kein API-Key erforderlich
- lokale/remote Endpoint-Erkennung
- isolierter Fake-HTTP-Adaptertest
- nicht-destruktiver Ollama-Preflight
- provider-neutraler End-to-End-Pipeline-Test für Ollama

Sicherer Standard bleibt:

```text
AI_PROVIDER=none
```

Lokale Aktivierung:

```text
AI_PROVIDER=ollama
OLLAMA_AI_MODEL=qwen3:4b
OLLAMA_AI_ENDPOINT=http://127.0.0.1:11434/api/chat
```

Der echte Ollama/Qwen3-Lauf auf dem Nutzer-PC steht noch aus. Bis dahin gilt 0.8.0 als **implementiert und isoliert getestet, realer lokaler Modelltest ausstehend**.

## Kostenstrategie

Ziel ist, laufende LLM-API-Kosten zu vermeiden:

- LLM-Auswertung: bevorzugt lokal mit Ollama/Qwen3
- OpenAI: nur optionaler Fallback
- STT: aktuell weiterhin Deepgram; ein lokaler STT-Ersatz ist eine spätere Stufe

Damit kann die KI-Extraktion selbst ohne API-Gebühren betrieben werden, sofern die lokale Modellqualität im realen Test ausreicht.

## Nächste Stufen

1. Companion 0.8.0 lokal mit Ollama/Qwen3 bestätigen
2. Qwen3 4B gegen 8B an realistischen deutschen Session-Sätzen vergleichen
3. Kandidaten-UI in Foundry mit Annehmen/Verwerfen
4. Undo/Change-Record Runtime
5. erst danach optionale automatische NPC-Memory-Übernahme
6. durchsuchbares Transkript
7. Session-Historie, Recap und Discord-Kurzfassung
8. optional lokales STT und Skalierungs-/Performance-Hardening

## Datenschutz / Secrets

- Discord Bot Token niemals in GitHub oder Chat speichern.
- Deepgram API Key niemals in GitHub oder Chat speichern.
- OpenAI/API Keys ausschließlich lokal halten.
- Ollama lokal benötigt für den Standardpfad keinen API-Key.
- Secrets bleiben in `companion/.env`.
- Roh-Audio wird nicht dauerhaft gespeichert.
- `notice_only` ist nur eine technische Capture-Policy und keine rechtliche Einwilligung.
- automatische Welt-/Actor-Änderungen erst nach Undo/Change-Record bzw. klarer GM-Bestätigung.

## Projekt-Checkpoint

Kanonischer Projektstand:

`PROJECT-CHECKPOINT.json`

Historische Snapshots:

`checkpoints/`

## Installation / Updates

Manifest:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Foundry-Installationspaket:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Der Companion liegt separat unter `companion/` und ist nicht Bestandteil des Foundry-ZIPs.
