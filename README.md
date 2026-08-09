# DM Cockpit V0.9.22

Foundry-VTT-V14-Modul plus lokaler Companion Service für Discord Voice, Live-Transkript, NPC-Kontext, strukturierte KI-Kandidaten und sicheren Change-Record/Undo-Unterbau.

## Für neue Chats / andere KIs

Zuerst lesen:

1. `PROJECT-HANDOFF.md` – vollständiger Projektüberblick von Architektur und Historie bis zum aktuellen Pausepunkt.
2. `PROJECT-CHECKPOINT.json` – kanonischer maschinenlesbarer Status.
3. `checkpoints/` – historische Snapshots.

Bei einem Widerspruch zwischen Dokumentation und Code ist der Repository-Code die technische Quelle der Wahrheit; der Checkpoint muss anschließend korrigiert werden.

## Aktueller Stand

### Foundry 0.9.22 – Candidate Review real bestätigt

Bestätigt:

- LIVE-Dashboard
- Abenteuer-Flowchart
- spontane Szenen und Szenen-Presets
- Gegner-Spawnpunkte und Enemy Reserve Bench
- Handout Queue
- Loot-/Belohnungspakete + Item-Suche
- Compendium-Schnellsuche
- NPC-Schnellgenerator
- Actor-basiertes NPC Memory
- Discord Live-Transkript UI/Transport
- NPC-Kontext aus Cockpit-Actor bzw. ausgewähltem Foundry-Token
- KI-Kandidatenkarte
- realer Ollama-Kandidat mit echtem Foundry-Actor-Kontext
- manuelles Annehmen/Verwerfen
- Annehmen → bestehendes NPC Memory
- keine automatische Actor-Änderung ohne GM-Aktion
- Foundry/GitHub Update-System

### Companion 0.8.0 – lokale KI vollständig bestätigt

Lokaler Standard:

- Ollama
- `qwen3:4b`
- kein LLM-API-Key
- Structured Output
- echter End-to-End-Lauf bestätigt
- Qualitätsbenchmark 11/12 = 91,7 %
- Ø 1066 ms, P95 1935 ms

OpenAI bleibt nur optionaler Fallback; kein echter bezahlter OpenAI-Aufruf wurde durchgeführt.

### Companion 0.9.0 – Candidate Review vollständig bestätigt

Bestätigt:

- `pending -> accepted/rejected`
- SQLite-Persistenz der Review-Status
- `candidates.list.request/result`
- Reload persistierter Kandidaten
- Candidate-Review-Smoke-Test

### Companion 0.10.0 – Change-Record/Undo implementiert, Nutzer-Test ausstehend

Im Repository vorhanden:

- `companion/src/change-record-runtime.js`
- persistente `change_records`
- `npc.memory.applied`
- `change.undo.request`
- `change.undo.result`
- aktiver Change-Record-Reload beim Verbindungsaufbau
- idempotentes Undo
- `npm.cmd run test:change-record`

Wichtig: Der 0.10.0-Backend-Code ist noch nicht auf dem Nutzer-PC bestätigt. Der Companion liefert Vorher/Nachher-Zustände und persistiert den Undo-Status; die tatsächliche Wiederherstellung des Foundry-Actor-Flags muss Foundry ausführen.

## Kostenstrategie

- LLM-Auswertung: lokal über Ollama/Qwen3, keine nutzungsabhängigen LLM-API-Gebühren
- OpenAI: optionaler Fallback
- STT: aktuell real bestätigt über Deepgram Nova-3
- lokales STT: spätere Stufe

## Datenschutz / Sicherheitsregeln

- Discord Bot Token niemals in GitHub oder Chat speichern.
- Deepgram API Key niemals in GitHub oder Chat speichern.
- OpenAI/API Keys ausschließlich lokal halten.
- Secrets bleiben in `companion/.env`.
- Roh-Audio wird nicht dauerhaft gespeichert.
- Actor-/Weltänderungen nicht automatisch ohne Change-Record/Undo oder klare GM-Bestätigung ausführen.

## Nächster Arbeitsblock

1. Companion 0.10.0 lokal per `git pull` holen.
2. `npm.cmd run check`.
3. Companion starten.
4. In zweiter PowerShell `npm.cmd run test:change-record`.
5. Bei Erfolg Backend als bestätigt checkpointen.
6. Danach Foundry-seitigen Restore/Undo-Pfad fertigstellen und mit Test-Actor prüfen.

## Installation / Updates

Manifest:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Foundry-Installationspaket:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Der Companion liegt separat unter `companion/` und ist nicht Bestandteil des Foundry-ZIPs.
