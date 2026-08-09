# DM Cockpit – Discord Audio & KI – Contract v1

Stand: 2026-08-09

## Ziel

Der Vertrag trennt Foundry/DM Cockpit von Discord Voice, STT und KI. Anbieter und Hosting können dadurch gewechselt werden, ohne das Foundry-Datenmodell neu zu bauen.

Maschinenlesbares Schema:

`schemas/discord-audio-ai-v1.schema.json`

## Grundregeln

- Transport lokal: `ws://127.0.0.1:43170/v1`
- Protokollversion: `1.0`
- finale Transkriptsegmente werden in SQLite persistiert
- Roh-Audio wird nicht dauerhaft gespeichert
- Discord User ID ist Source of Truth dafür, **welche Person spricht**
- nur eine vom GM bestätigte Foundry-Zuordnung ist Source of Truth dafür, **welchen Charakter diese Person spielt**
- KI darf niemals Actor-IDs oder Spieler-/Charakterzuordnungen selbst erraten
- eine Charakterzuordnung ist keine automatische IC/OOC-Klassifikation
- Discord-Server-Nicknames dürfen nur durch ein ausdrücklich aktiviertes Identity-Profil verändert werden
- der globale Discord-Benutzername wird niemals verändert
- vor jeder Session-Nickname-Änderung muss der vorherige Server-Nickname persistent gesichert sein
- Restore darf eine unerwartete manuelle Namensänderung nicht blind überschreiben
- keine automatische Foundry-Weltänderung ohne sicheren Undo/Change-Record oder ausdrückliche GM-Bestätigung

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

## Verbindung / Session

Kernnachrichten:

- `hello`
- `hello.ack`
- `health`
- `session.started`
- `session.ended`
- `capture.status`
- `speaker.upserted`

`hello.ack` veröffentlicht die tatsächlich vom Companion unterstützten Features. Seit Companion 0.12.0 gehören persistente Identity-Profile und persistenter Nickname-Restore-Zustand dazu.

## Voice-Teilnehmer

### `voice.participants`

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

Bots dürfen im Payload enthalten sein; Mapping- und Nickname-Logik ignorieren sie für Spielerzuordnungen.

### `voice.participants.request`

Foundry kann den zuletzt bekannten Teilnehmer-Snapshot erneut anfordern. Dies ist keine Teilnehmerhistorie.

## Spieler-/Charakterzuordnung

Die Zuordnung ist bewusst **keine KI-Aufgabe**. Foundry zeigt Discord-Spieler und vorhandene Actors; der GM wählt die Zuordnung selbst.

### `player.character.mapping.set`

Foundry sendet den vollständigen aktuellen Mapping-Snapshot seiner Welt.

```json
{
  "worldId": "world_01",
  "worldName": "Meine Kampagne",
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

Regeln:

- `worldId + discordUserId` ist der persistente Schlüssel im Companion-Mirror.
- der Array-Inhalt ersetzt für diese Welt den bisherigen Mirror vollständig
- ein leerer Array löscht die Mirror-Zuordnungen der Welt
- Foundry bleibt die autoritative GM-Konfiguration

Weitere Nachrichten:

- `player.character.mapping.request`
- `player.character.mapping.result`

## Session-/Kampagnen-Identity-Profile

Ein Identity-Profil ist ein persistenter Snapshot einer konkreten Spielidentität. Unterstützte Typen:

- `campaign`
- `oneshot`
- `session`

Ein Profil enthält:

- `profileId`
- `worldId`
- Anzeigename
- Typ
- Aktivstatus
- Snapshot der bestätigten Discord-Spieler-/Foundry-Charakterzuordnungen

Es kann Companion-weit immer nur **ein** Profil gleichzeitig aktiv sein.

### `identity.profile.save`

Speichert oder aktualisiert ein Profil. Das Speichern allein aktiviert **keine** Nickname-Automatik.

```json
{
  "profileId": "profile_01",
  "worldId": "world_01",
  "worldName": "Meine Kampagne",
  "name": "Auktion der verbotenen Dinge",
  "kind": "oneshot",
  "mappings": [
    {
      "discordUserId": "1234567890",
      "playerName": "Mira",
      "actorId": "actor_01",
      "actorUuid": "Actor.actor_01",
      "characterName": "Ragna"
    }
  ]
}
```

### Profilnachrichten

- `identity.profile.list.request`
- `identity.profile.list.result`
- `identity.profile.activate`
- `identity.profile.deactivate`
- `identity.profile.state.request`
- `identity.profile.state`

### Aktivierungsregel

Nur `identity.profile.activate` schaltet ein Profil scharf. Danach darf der Nickname-Manager ausschließlich für im aktiven Profil zugeordnete Mitglieder des relevanten Voice-Calls arbeiten.

`identity.profile.deactivate` beendet diesen Zustand. Aktive DM-Cockpit-Nickname-Leases werden danach restauriert, soweit Discord-Berechtigungen und Konfliktschutz dies erlauben.

## Discord-Session-Nickname

Standardformat:

`Charakter | Spieler`

Regeln:

1. Der Charaktername steht zuerst.
2. Der Nickname wird auf maximal 32 Unicode-Zeichen begrenzt.
3. Der Charaktername hat bei Platzmangel Priorität; der Spielername wird zuerst gekürzt bzw. weggelassen.
4. Ziel ist ausschließlich der serverbezogene Discord-Nickname.
5. Vor dem ersten Write wird `originalNickname` persistent gespeichert.
6. `Manage Nicknames` und Discord-Rollenhierarchie müssen die Änderung erlauben.
7. Ein identischer gewünschter Nickname verursacht keinen unnötigen weiteren Write.

## Persistenter Nickname-Lease

Tabelle:

`discord_nickname_overrides`

Ein Lease enthält mindestens:

- Guild-ID
- Discord-User-ID
- Profil-ID
- ursprünglichen Nickname
- von DM Cockpit gesetzten Nickname
- Zustand
- Fehler-/Zeitstempel

Relevante Zustände:

- `prepared`
- `applied`
- `apply_failed`
- `restore_failed`
- `restore_conflict`
- `conflict_released`
- `restored`

### Apply

Ablauf:

1. Mitglied und Discord-Berechtigungen prüfen.
2. aktuellen Server-Nickname lesen.
3. Lease mit Originalzustand **vor** Discord-Mutation persistieren.
4. Session-Nickname setzen.
5. Lease als `applied` markieren.

### Restore

Restore wird ausgelöst, wenn z. B.:

- ein zugeordnetes Mitglied den relevanten Call verlässt
- ein Profil deaktiviert oder gewechselt wird
- eine Zuordnung im aktiven Profil nicht mehr gilt
- der Companion sauber herunterfährt
- nach einem Restart ein persistierter Lease nicht mehr zu einem aktiven Call-Zustand gehört

Sicherheitslogik:

- aktueller Nickname entspricht bereits `originalNickname` → Restore als No-op erfolgreich markieren
- aktueller Nickname entspricht dem von DM Cockpit gesetzten `appliedNickname` → Original wiederherstellen
- aktueller Nickname entspricht **weder** Original noch DM-Cockpit-Nickname → `restore_conflict`; manuelle Änderung nicht überschreiben

Bei einem späteren bewussten Rejoin/Apply kann ein vorheriger Restore-Konflikt freigegeben werden; der nun aktuelle manuelle Name wird dann zur neuen Restore-Basis.

## `nickname.status`

Der Companion veröffentlicht Diagnose-/Lifecycle-Zustände des Nickname-Managers, z. B.:

- `nickname_applied`
- `nickname_restored`
- `nickname_restore_conflict`
- `nickname_apply_blocked`
- `nickname_apply_failed`
- `nickname_restore_failed`

Foundry zeigt diese Informationen in der Karte `Session-Identität` an.

## Transkript

`transcript.segment`

Persistiert werden nur finale Segmente. Partials dürfen für Live-Feedback übertragen werden, werden aber nicht dauerhaft archiviert.

Ein finales Segment kann zusätzlich die zum Segmentzeitpunkt bestätigte Spieler-/Charakteridentität enthalten:

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
2. `speakerName` ist der Discord-Anzeigename der sprechenden Person.
3. Actor-/Charakterfelder stammen ausschließlich aus bestätigtem Mapping.
4. Ohne Mapping bleiben Actor-/Charakterfelder `null`.
5. Alte persistierte Segmente werden durch spätere Mapping-Änderungen nicht still umgeschrieben.
6. Die KI erhält Spieler-/Charakterkontext, aber keine Freiheit zur Actor-Zuordnung.

## NPC-Kontext / KI-Kandidaten / Undo

Die bestehenden Regeln bleiben unverändert:

- `npc.context` priorisiert expliziten Cockpit-Actor, dann ausgewählten Token, sonst keinen NPC
- NPC-Kandidaten dürfen nur dem von Foundry vorgegebenen Actor zugeordnet werden
- `npc.memory.candidate` und `session.event.candidate` bleiben manuell prüfbare Vorschläge
- `candidate.review` / `candidate.reviewed` persistieren Annahme/Ablehnung
- `npc.memory.applied`, `change.undo.request`, `change.undo.result` bilden den sicheren Change-/Undo-Pfad
- keine automatische Foundry-Actor-Mutation durch die neue Discord-Identity-Logik

## Provider-Abstraktion

### STT

Bestätigter bisheriger Provider:

- Deepgram Nova-3, Deutsch, EU-Endpunkt

STT bleibt provider-neutral und kann später lokal ersetzt werden.

### KI-Extraktion

Unterstützt:

- `none`
- `mock`
- `openai`
- `ollama`

Aktueller kostenloser Standard:

- Ollama lokal
- `qwen3:4b`
- Structured Output
- `think=false`
- Temperatur 0

Ollama und der optionale OpenAI-Adapter erhalten zusätzlich den **GM-bestätigten Charakternamen**, sofern ein Mapping vorhanden ist. Actor-ID/UUID sind keine Modellentscheidung.

## Roh-Audio

Regel:

`until_successful_transcription`

Roh-Audio bleibt nur temporär für Verarbeitung/Retry im RAM bzw. kurzfristigen Puffer und wird nicht dauerhaft archiviert.

## Fehler- und Wiederanlaufregeln

- eindeutige Message- und Segment-IDs
- idempotente SQLite-Schreibvorgänge für finale Segmente/Kandidaten
- Mapping-Snapshot pro Welt wird transaktional ersetzt
- Profile und Nickname-Leases sind persistent
- Reconnect darf gespeicherte Daten nicht duplizieren
- Candidate-Review bleibt persistent
- Providerfehler müssen sichtbar werden
- Backpressure/Queue ist Segmentverlust vorzuziehen
- geordneter Companion-Shutdown führt Nickname-Restore vor Discord-/SQLite-Ende aus
- Restore-Konflikte werden sichtbar gehalten statt externe manuelle Änderungen zu überschreiben

## Implementierungs-/Teststand

Bereits früher vollständig bestätigt und nicht ohne konkrete Regression zu wiederholen:

- Discord Voice/DAVE/GM Follow
- Sprechertrennung
- Deepgram STT
- Live-Transkript
- SQLite-Persistenz
- Ollama/qwen3:4b E2E
- Candidate Review / Change-Record / Undo-Baseline

### Identity-Core 0.9.27 / Companion 0.11.0

- implementiert
- CI-validiert mit `Build DM Cockpit v0.9.27`
- echter Discord-/Foundry-Runtime-Test noch offen

### Session Identity 0.9.28 / Companion 0.12.0

Implementiert:

- persistente Profile
- Foundry-Karte `Session-Identität`
- reversible Nickname-Leases
- Join/Leave/Profilewechsel/Deactivate/Shutdown-Lifecycle
- Rollen-/Berechtigungsprüfung
- Restore-Konfliktschutz
- Restart-/Crash-Recovery

Automatisiert ohne echten Discord-Server erfolgreich geprüft:

- Profil-Persistenz
- ein aktives Profil
- Nickname-Längenbegrenzung
- Join Apply
- Leave Restore
- doppelte Snapshot-Idempotenz
- manuelle Änderung → Restore-Konflikt
- Rejoin nach Konflikt
- Profilwechsel
- Deaktivierung
- Restart-Recovery

Bis zum gebündelten Nutzertest gilt dieser Block **nicht** als lokal oder vollständig bestätigt.
