# DM Cockpit – Checkpoint Index

Kanonischer aktueller Status: `../PROJECT-CHECKPOINT.json`

Vollständige Übergabe für neue Chats/KIs: `../PROJECT-HANDOFF.md`

Die JSON-Dateien in diesem Ordner sind historische Snapshots. Sie sind nützlich, um Entscheidungen und bestätigte Teststufen nachzuvollziehen, aber sie ersetzen nicht den kanonischen Checkpoint.

## Wichtige Meilensteine

- Chat-Arbeitsregeln festgeschrieben
- Companion 0.5.0: Discord/DAVE/Deepgram/Foundry real bestätigt
- Companion 0.6.0: Mock-AI-End-to-End bestätigt
- Companion 0.7.0: OpenAI-Adapter isoliert bestätigt, kein echter API-Aufruf
- Companion 0.8.0: Ollama-Adapter bestätigt
- Ollama-Runtime zunächst nicht erreichbar
- Ollama/qwen3:4b installiert und Preflight bestätigt
- Ollama/qwen3:4b echter End-to-End-Lauf bestätigt
- qwen3:4b Qualitätsbenchmark bestätigt: 11/12 = 91,7 %
- Companion 0.9.0 Candidate Review implementiert
- Companion 0.9.0 Candidate Review lokal bestätigt
- Foundry 0.9.22 KI-Kandidatenkarte sichtbar bestätigt
- Foundry 0.9.22 realer Ollama-Kandidat + Annehmen/Verwerfen + NPC Memory bestätigt
- Companion 0.10.0 Change-Record/Undo-Backend implementiert; Nutzer-PC-Test noch ausstehend

## Bekannte neuere historische Dateien

- `2026-08-09T13-29-chat-working-rules.json`
- `2026-08-09T14-31-companion-0.8.0-ollama-adapter-confirmed.json`
- `2026-08-09T14-35-ollama-preflight-runtime-unreachable.json`
- `2026-08-09T14-38-ollama-runtime-qwen3-present.json`
- `2026-08-09T14-40-companion-0.8.0-ollama-preflight.json`
- `2026-08-09T14-44-companion-0.8.0-ollama-e2e-confirmed.json`
- `2026-08-09T14-46-qwen3-4b-quality-confirmed.json`
- `2026-08-09T14-56-candidate-review-implemented-unconfirmed.json`

Weitere historische Snapshots können im Ordner liegen. Bei Widersprüchen gilt:

1. realer Repository-Code/Versionen prüfen;
2. `PROJECT-CHECKPOINT.json` als aktuelle Projektposition verwenden;
3. `PROJECT-HANDOFF.md` für Kontext und Chronologie verwenden;
4. alte Snapshots niemals ungeprüft als aktuellen Zustand übernehmen.

## Checkpoint-Regel

Bei jedem bedeutenden Meilenstein:

1. `PROJECT-CHECKPOINT.json` aktualisieren;
2. einen historischen JSON-Snapshot unter `checkpoints/` anlegen;
3. denselben regulären Checkpoint in ChatGPT Library `/DM Cockpit/` speichern;
4. `PROJECT-HANDOFF.md` nur dann aktualisieren, wenn Architektur, bestätigte Baseline, Versionen oder Roadmap wesentlich verändert wurden.
