# DM Cockpit – Discord Audio & KI – Contract v1

Stand: 2026-08-09

## Ziel

Der Vertrag trennt Foundry/DM Cockpit von Discord Voice, STT und KI. Anbieter und Hosting können dadurch gewechselt werden, ohne das Foundry-Datenmodell neu zu bauen.

## Grundregeln

- Transport lokal: `ws://127.0.0.1:43170/v1`
- Protokollversion: `1.0`
- finale Transkriptsegmente werden in SQLite persistiert
- Roh-Audio wird nicht dauerhaft gespeichert
- Sprechertrennung erfolgt technisch über Discord User IDs
- Discord User ID ist Source of Truth dafür, **welche Person spricht**
- nur eine vom GM in Foundry bestätigte Zuordnung ist Source of Truth dafür, **welchen Foundry-Charakter diese Person spielt**
- KI darf niemals Actor-IDs oder Spieler-/Charakterzuordnungen selbst erraten
- eine Charakterzuordnung bedeutet nicht automatisch, dass jede Aussage in-character ist
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

### Voice-Teilnehmer

#### `voice.participants`

Der Companion veröffentlicht den beobachteten Zustand des Voice-Channels, dem er für den konfigurierten GM folgt.

```json
{
  "guildId": "guild_01",
  "channelId": "voice_01",
  "observedAt": "2026-08-09T16:20:00.000Z",
  "participants": [
    {
      "discordUserId": "1234567890",
      "displayName": "Mira",
      "globalName": "Mira",
      "serverNickname": null,
      "isBot": false,
      "channelId": "voice_01"
    }
  ]
}
```

Bots dürfen im Payload enthalten sein; die Foundry-Zuordnungs-UI filtert sie für die Spielerzuordnung aus.

#### `voice.participants.request`

Foundry kann den zuletzt bekannten Teilnehmerzustand erneut anfordern. Der Server hält dafür nur den aktuellen Snapshot im Speicher; dies ist keine Teilnehmerhistorie.

## Spieler-/Charakterzuordnung

Die Zuordnung ist bewusst **keine KI-Aufgabe**. Foundry zeigt Discord-Spieler und vorhandene Actors; der GM wählt die Zuordnung selbst.

### `player.character.mapping.set`

Foundry überträgt den vollständigen aktuellen Mapping-Snapshot seiner Welt.

```json
{
  "worldId": "world_01",
  "worldName": "Meine Kampagne",
  "updatedAt": "2026-08-09T16:21:00.000Z",
  "mappings": [
    {
      "discordUserId": "1234567890",
      "playerName": "Mira",
      "actorId": "actor_01",
      "actorUuid": "Actor.actor_01",
      "characterName": "Ragna",
      "updatedAt": "2026-08-09T16:21:00.000Z"
    }
  ]
}
```

Semantik:

- `worldId + discordUserId` ist der persistente Schlüssel im Companion.
- Der übertragene Array-Inhalt ersetzt für diese Welt den bisherigen Companion-Mirror vollständig.
- Ein leerer Mapping-Array löscht die Zuordnungen dieser Welt im Mirror.
- Die Foundry-Welt-Einstellung bleibt die autoritative GM-Konfiguration; SQLite dient als persistenter Companion-Mirror.

### `player.character.mapping.request`

```json
{
  "worldId": "world_01"
}
```

### `player.character.mapping.result`

Der Companion liefert die für diese Welt persistent gespeicherten Zuordnungen zurück. Der laufende Companion verwendet den zuletzt erhaltenen Mapping-Snapshot zur Sprecherattribution.

## Transkript

`transcript.segment`

Persistiert werden nur finale Segmente. Partials dürfen für Live-Feedback übertragen werden, werden aber nicht dauerhaft archiviert.

Neue Segmente können zusätzlich die zum Segmentzeitpunkt bestätigte Spieler-/Charakteridentität enthalten:

```json
{
  "segmentId": "seg_01...",
  "discordUserId": "1234567890",
  "speakerName": "Mira",
  "playerName": "Mira",
  "actorId": "actor_01",
  "actorUuid": "Actor.actor_01",
  "characterName": "Ragna",
  "startedAt": "2026-08-09T09:10:01.000Z",
  "endedAt": "2026-08-09T09:10:09.000Z",
  "text": "Ich verspreche dem Händler morgen zurückzukommen.",
  "final": true,
  "language": "de",
  "provider": "deepgram",
  "confidence": 0.94
}
```

Regeln:

1. `discordUserId` bleibt die technische Sprecheridentität.
2. `speakerName` bleibt der Discord-Anzeigename der sprechenden Person.
3. `playerName`, `actorId`, `actorUuid`, `characterName` werden nur aus der bereits bestätigten Mapping-Tabelle ergänzt.
4. Ohne Mapping bleiben Actor-/Charakterfelder `null`; die Pipeline darf sie nicht erraten.
5. Persistierte Transkriptsegmente behalten die Identität, die zum Zeitpunkt ihrer Verarbeitung galt. Spätere Mapping-Änderungen schreiben alte Segmente nicht still um.
6. Die KI erhält den Spieler- und optionalen Charakternamen als Kontext, aber keine Freiheit zur Actor-Zuordnung.

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

Der bestätigte NPC-Memory-Schreibpfad erfordert weiterhin einen manuellen GM-Klick. Der neue Spieler-/Charakter-Mapping-Kern verändert keine Foundry-Actors und keine Discord-Nicknames.

## Provider-Abstraktion

### STT

Bestätigter bisheriger Provider:

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

Ollama und der optionale OpenAI-Adapter erhalten nun zusätzlich den **GM-bestätigten Charakternamen**, sofern ein Mapping vorhanden ist. Actor-ID/UUID werden nicht als frei interpretierbare Modellentscheidung verwendet.

OpenAI bleibt optionaler Fallback; ein echter kostenpflichtiger OpenAI-API-Aufruf wurde bisher nicht benötigt.

## Roh-Audio

V1-Regel:

`until_successful_transcription`

Roh-Audio bleibt nur temporär für Verarbeitung/Retry im RAM bzw. kurzfristigen Puffer und wird nicht dauerhaft archiviert.

## Fehler- und Wiederanlaufregeln

- eindeutige Message-IDs
- eindeutige Segment-IDs
- idempotente SQLite-Schreibvorgänge für finale Segmente/Kandidaten
- Mapping-Snapshot pro Welt wird transaktional ersetzt
- Reconnect darf gespeicherte Daten nicht duplizieren
- Candidate-Review wird persistent als Status gespeichert
- Providerfehler müssen sichtbar werden; kein stilles Verwerfen
- Backpressure/Queue ist Segmentverlust vorzuziehen
- Discord-Nickname-Automatik ist **nicht** Teil dieses Identity-Core-Blocks

## Aktueller Implementierungsstand

Bereits früher vollständig bestätigt und nicht ohne Regression zu wiederholen:

- Discord Voice/DAVE/GM Follow
- Sprechertrennung
- Deepgram STT
- Live-Transkript
- SQLite-Persistenz
- provider-neutrale KI-Extraktion
- Ollama/qwen3:4b End-to-End
- Candidate Review / Change-Record / Undo-Baseline

Identity-Core 0.9.27 / Companion 0.11.0 auf `main` implementiert:

- Voice-Teilnehmer-Snapshot des relevanten Calls
- Protocol-Nachrichten für Teilnehmer und Spieler-/Charakterzuordnung
- persistente SQLite-Tabelle für Welt-Zuordnungen
- migrationssichere zusätzliche Transkript-Identitätsfelder
- Foundry-Karte `Spieler & Charaktere`
- weltpersistente GM-Zuordnung Discord-Mitglied -> Foundry-Actor
- strukturierte Spieler-/Charakterattribution neuer Transkriptsegmente
- Weitergabe des bestätigten Spielernamens/Charakternamens an Ollama/OpenAI-Extraktionskontext
- automatischer Identity-Mapping-/Legacy-Migrations-Smoke-Test in CI

Status dieses neuen Blocks:

- **implementiert auf main**
- **automatisierte/static Prüfung über GitHub Actions vorgesehen**
- **echter Discord-/Foundry-Runtime-Test noch offen**
- **nicht als lokal oder vollständig bestätigt behandeln, bevor der gebündelte Nutzertest durchgeführt wurde**
