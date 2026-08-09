# DM Cockpit Companion Service 0.8.0

Lokaler Dienst zwischen Foundry/DM Cockpit, Discord Voice, Speech-to-Text, SQLite und strukturierter KI-Extraktion.

## Bestätigte Baseline

Auf dem Nutzer-PC bestätigt:

- Companion 0.5.0: Discord/DAVE/Audio/Deepgram/Protocol v1/Foundry sowie Candidate-Broadcast + SQLite
- Companion 0.6.0: provider-neutrale AI-Extraction inklusive Mock-End-to-End-Pipeline
- Companion 0.7.0: Syntaxprüfung und isolierter OpenAI-Adaptertest mit Fake-HTTP-Response

Weiterhin gilt:

- keine dauerhafte Roh-Audio-Speicherung
- finale Transkriptsegmente werden dedupliziert
- NPC-Zuordnung kommt ausschließlich aus Foundry `npc.context`
- keine automatischen Actor-Writes

## Neu in 0.8.0: lokale kostenlose KI mit Ollama

Neuer Provider:

- `src/ai-extraction-ollama.js`
- Standardmodell `qwen3:4b`
- lokale API `http://127.0.0.1:11434/api/chat`
- kein API-Key erforderlich
- `stream: false`
- `think: false`
- Structured Output per JSON-Schema
- `temperature: 0`
- fester Seed für reproduzierbarere Tests
- Standard-Kontextfenster 8192 Tokens
- Modell-Keep-Alive standardmäßig 10 Minuten
- lokale Nachvalidierung der Kandidaten
- ohne Foundry-NPC-Kontext werden NPC-Kandidaten verworfen

Der sichere Standard bleibt:

```text
AI_PROVIDER=none
```

Lokale KI wird nur durch folgende Einstellung aktiviert:

```text
AI_PROVIDER=ollama
```

## Provider

```text
AI_PROVIDER=none     # sicherer Standard
AI_PROVIDER=mock     # deterministischer Testprovider
AI_PROVIDER=ollama   # lokale kostenlose KI
AI_PROVIDER=openai   # optionaler Cloud-Fallback
```

### Ollama-Konfiguration

```text
OLLAMA_AI_MODEL=qwen3:4b
OLLAMA_AI_ENDPOINT=http://127.0.0.1:11434/api/chat
OLLAMA_AI_TIMEOUT_MS=60000
OLLAMA_AI_NUM_CTX=8192
OLLAMA_AI_KEEP_ALIVE=10m
```

Für den lokalen Standard-Endpunkt werden keine API-Schlüssel benötigt und die LLM-Auswertung bleibt auf dem Rechner. Wird `OLLAMA_AI_ENDPOINT` absichtlich auf einen anderen Host gesetzt, kennzeichnet der Provider dies in seinem Status als externe Datenübertragung.

## Ollama-Tests

Adaptertest ohne installiertes Ollama oder echten Modelllauf:

```powershell
npm.cmd run test:ai-ollama
```

Dieser Test verwendet eine lokale Fake-HTTP-Antwort und bestätigt:

- API-Payload an `/api/chat`
- `qwen3:4b`
- `think=false`
- Structured Output
- Temperatur 0
- Kontextgröße 8192
- Actor-Zuordnung aus Foundry-Kontext
- keine API-Key-Pflicht

Nicht-destruktiver Preflight gegen eine echte lokale Ollama-Installation:

```powershell
npm.cmd run test:ollama-preflight
```

Der Preflight lädt nichts herunter und verändert keine Modelle. Er prüft nur:

- ist Ollama unter `127.0.0.1:11434` erreichbar?
- ist `qwen3:4b` vorhanden?
- falls verfügbar: Parametergröße und Quantisierung

Falls das Modell fehlt, nennt der Test lediglich den manuellen Befehl:

```powershell
ollama pull qwen3:4b
```

Ende-zu-Ende-Test mit echtem lokalem Modell:

```powershell
npm.cmd run test:ai-pipeline-ollama
```

Dafür muss der Companion parallel mit `AI_PROVIDER=ollama` laufen. Der Test prüft:

**npc.context + final transcript.segment → Ollama/Qwen3 → NPC-/Session-Kandidat → Protocol v1 → Broadcast → SQLite**

## OpenAI-Fallback

Der optionale Cloud-Adapter bleibt vorhanden, ist aber für den kostenlosen lokalen Pfad nicht erforderlich.

```text
OPENAI_API_KEY=
OPENAI_AI_MODEL=gpt-5-nano
OPENAI_AI_ENDPOINT=https://api.openai.com/v1/responses
OPENAI_AI_TIMEOUT_MS=20000
```

Beim OpenAI-Adapter bleibt `store: false` aktiv. Secrets gehören ausschließlich in die lokale `companion/.env`.

## Speech-to-Text

Der bestehende STT-Pfad bleibt unverändert. Aktuell real bestätigt ist Deepgram Nova-3 auf Deutsch. Die neue lokale Ollama-Integration ersetzt nur die LLM-Auswertung nach dem Transkript; sie ersetzt Deepgram noch nicht.

## Tests

```powershell
npm.cmd run check
npm.cmd run test:ai
npm.cmd run test:ai-openai
npm.cmd run test:ai-ollama
npm.cmd run test:ollama-preflight
npm.cmd run test:ai-pipeline
npm.cmd run test:ai-pipeline-ollama
```

## Noch nicht bestätigt / enthalten

- echter Ollama/Qwen3-Lauf auf dem Nutzer-PC
- Qualitätsvergleich Qwen3 4B gegen 8B an realistischen deutschen Session-Sätzen
- lokales Speech-to-Text als Ersatz für Deepgram
- Foundry Candidate UI mit Annehmen/Verwerfen
- automatische Actor-Memory-Änderungen
- Undo-Ausführung
- Transkript-Suche
- Session-Recap / Discord-Kurzfassung

## Nächster einzelner externer Test

Wenn der Nutzer wieder am Rechner ist:

1. Companion 0.8.0 per `git pull` holen.
2. `npm.cmd run check` und `npm.cmd run test:ai-ollama` ausführen.
3. Ollama installieren/starten, falls noch nicht vorhanden.
4. `qwen3:4b` lokal laden.
5. `npm.cmd run test:ollama-preflight` ausführen.
6. Companion mit `AI_PROVIDER=ollama` starten und danach `npm.cmd run test:ai-pipeline-ollama` ausführen.

Bis zu diesem echten lokalen Lauf ist 0.8.0 als **implementiert + isoliert getestet, echter Ollama-Test ausstehend** zu behandeln.
