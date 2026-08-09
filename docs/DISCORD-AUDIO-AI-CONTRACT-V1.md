# DM Cockpit – Discord Audio & KI – Contract v1

Stand: 2026-08-09

## Ziel

Der Vertrag trennt Foundry/DM Cockpit von Discord Voice, STT und KI. Anbieter und Hosting können dadurch gewechselt werden, ohne das Foundry-Datenmodell neu zu bauen.

## Grundregeln

- Transport lokal: `ws://127.0.0.1:43170/v1`
- Protokollversion: `1.0`
- finale Transkriptsegmente werden in SQLite persistiert
- Roh-Audio wird nicht dauerhaft gespeichert
- Sprechertrennung erfolgt über Discord User IDs
- Provider bleiben austauschbar
- KI-Kandidaten enthalten Quell-Segment-IDs
- keine automatische Foundry-Weltänderung ohne sicheren Undo/Change-Record oder explizite GM-Bestätigung

Maschinenlesbares Schema:

`schemas/discord-audio-ai-v1.schema.json`

## Envelope

```json
{
  "v": "1.0",
  "type": "transcript.segment",
  "id": "msg_01...",
  "ts": "2026-08-09T09:00:00.000Z",
  "sessionId": "session_01...",
  "payload": {}
}
```

## Kernnachrichten

### Verbindung / Session

- `hello`
- `hello.ack`
- `health`
- `session.started`
- `session.ended`
- `capture.status`
- `speaker.upserted`

### Transkript

`transcript.segment`

Persistiert werden nur finale Segmente. Partials dürfen für Live-Feedback übertragen werden, werden aber nicht dauerhaft archiviert.

Beispiel:

```json
{
  "segmentId": "seg_01...",
  "discordUserId": "1234567890",
  "speakerName": "Spieler",
  "startedAt": "2026-08-09T09:10:01.000Z",
  "endedAt": "2026-08-09T09:10:09.000Z",
  "text": "Ich verspreche dem Händler morgen zurückzukommen.",
  "final": true,
  "language": "de",
  "provider": "deepgram",
  "confidence": 0.94
}
```

## NPC-Kontext

Foundry sendet `npc.context` bei relevanten Änderungen.

Priorität:

1. explizit aktiver Cockpit-Actor
2. ausgewählter Foundry-Token
3. kein NPC

Der Companion darf NPC-Kandidaten nur dem Actor zuordnen, den Foundry über `actorId`/`actorUuid` geliefert hat. Die KI bestimmt niemals selbst eine Actor-ID.

## KI-Kandidaten

### `npc.memory.candidate`

Pflichtfelder:

- `candidateId`
- `actorId`
- `text`
- `kind`
- `sourceSegmentIds`
- `createdAt`

NPC-Kategorien:

- `statement`
- `knowledge`
- `action`
- `relationship`
- `promise`
- `lie`
- `deadline`
- `consequence`
- `other`

### `session.event.candidate`

Session-Kategorien:

- `decision`
- `quest`
- `task`
- `loot`
- `reward`
- `open_question`
- `combat`
- `event`
- `other`

Kandidatenstatus:

- `pending`
- `accepted`
- `rejected`

## Manuelle Kandidatenprüfung

### `candidate.review`

Foundry sendet diese Nachricht ausschließlich nach einer bewussten GM-Aktion.

```json
{
  "candidateType": "npc.memory.candidate",
  "candidateId": "cand_01...",
  "status": "accepted"
}
```

Erlaubte Statuswerte für Review:

- `accepted`
- `rejected`

Der Companion aktualisiert den Status in SQLite.

### `candidate.reviewed`

Bestätigung/Broadcast nach erfolgreicher Persistenz:

```json
{
  "candidateType": "npc.memory.candidate",
  "candidateId": "cand_01...",
  "status": "accepted",
  "reviewedAt": "2026-08-09T14:50:00.000Z"
}
```

## Kandidaten nach Reload wieder laden

### `candidates.list.request`

```json
{
  "status": "pending",
  "limit": 100
}
```

Optional:

- `status`: `pending`, `accepted`, `rejected`, `all`
- `sessionId`
- `limit` bis 250

### `candidates.list.result`

Antwort enthält getrennte Arrays:

- `npcCandidates`
- `sessionEventCandidates`

Dadurch kann Foundry nach einem Reload offene Kandidaten erneut aus SQLite laden.

## Foundry-Anwendung

Für NPC-Memory gilt in der aktuellen manuellen V1:

1. KI erzeugt `npc.memory.candidate`.
2. Foundry zeigt den Kandidaten an.
3. GM klickt ausdrücklich auf „Annehmen“.
4. Foundry schreibt den Text in `flags['dm-cockpit'].actionMemory` des bereits vorgegebenen Actors.
5. Foundry sendet `candidate.review` mit `accepted`.
6. Companion persistiert den Review-Status und broadcastet `candidate.reviewed`.

Bei `rejected` findet keine Actor-Änderung statt.

Session-Kandidaten werden bei Annahme zunächst nur als `accepted` in SQLite markiert. Sie dienen später als Quelle für Session-Historie, Recap und Discord-Kurzfassung.

## Undo / Change-Records

Das Schema enthält weiterhin:

- `npc.memory.applied`
- `change.undo.request`
- `change.undo.result`
- `change_records` in SQLite

Der vollständige Undo-Runtime-Pfad ist ein separater Entwicklungsblock. Bis dahin bleiben automatische Actor-Writes deaktiviert; der aktuelle NPC-Memory-Schreibpfad erfordert einen manuellen GM-Klick.

## Provider-Abstraktion

### STT

Bestätigter aktueller Provider:

- Deepgram Nova-3, Deutsch, EU-Endpunkt

STT bleibt provider-neutral und kann später lokal ersetzt werden.

### KI-Extraktion

Unterstützte Companion-Provider:

- `none`
- `mock`
- `openai`
- `ollama`

Aktuell ausgewählter kostenloser Standard:

- Ollama lokal
- `qwen3:4b`
- Structured Output per JSON-Schema
- `think=false`
- Temperatur 0

OpenAI bleibt optionaler Fallback; ein echter kostenpflichtiger OpenAI-API-Aufruf wurde bisher nicht benötigt.

## Roh-Audio

V1-Regel:

`until_successful_transcription`

Roh-Audio bleibt nur temporär für Verarbeitung/Retry im RAM bzw. kurzfristigen Puffer und wird nicht dauerhaft archiviert.

## Fehler- und Wiederanlaufregeln

- eindeutige Message-IDs
- eindeutige Segment-IDs
- idempotente SQLite-Schreibvorgänge für finale Segmente/Kandidaten
- Reconnect darf gespeicherte Daten nicht duplizieren
- Candidate-Review wird persistent als Status gespeichert
- Providerfehler müssen sichtbar werden; kein stilles Verwerfen
- Backpressure/Queue ist Segmentverlust vorzuziehen

## Aktueller Implementierungsstand

Bestätigt:

- Discord Voice/DAVE
- Sprechertrennung
- Deepgram STT
- Live-Transkript
- SQLite-Persistenz
- provider-neutrale KI-Extraktion
- Ollama/qwen3:4b End-to-End
- qwen3:4b Qualitätsbenchmark 91,7 %

Implementiert, noch lokal zu bestätigen:

- `candidate.review`
- `candidate.reviewed`
- `candidates.list.request/result`
- Foundry-Kandidaten-UI mit manuellem Annehmen/Verwerfen
