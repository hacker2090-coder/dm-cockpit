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
- der Discord-Ausgabe-Textkanal ist eine persistente, jederzeit änderbare GM-Konfiguration
- Discord-Ausgaben prüfen den realen `View Channel`-/`Send Messages`-Zugriff vor Verwendung
- direkte Recaps werden ausschließlich nach bewusster GM-Aktion gesendet
- Discord-Erwähnungen werden bei DM-Cockpit-Ausgaben deaktiviert
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

`hello.ack` veröffentlicht die tatsächlich vom Companion unterstützten Features. Seit Companion 0.13.0 gehören persistente Identity-Profile, persistenter Nickname-Restore-Zustand sowie persistenter Discord-Ausgabe-Textkanal und idempotente Discord-Ausgaben dazu.

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

Weitere Nachricht:

- `voice.participants.request`

## Spieler-/Charakterzuordnung

Die Zuordnung ist bewusst **keine KI-Aufgabe**. Foundry zeigt Discord-Spieler und vorhandene Actors; der GM wählt die Zuordnung selbst.

Nachrichten:

- `player.character.mapping.set`
- `player.character.mapping.request`
- `player.character.mapping.result`

Regeln:

- `worldId + discordUserId` ist der persistente Schlüssel im Companion-Mirror
- Foundry bleibt die autoritative GM-Konfiguration
- ein vollständiger Mapping-Snapshot ersetzt für die Welt den bisherigen Mirror
- ein leerer Snapshot löscht die Mirror-Zuordnungen der Welt

## Session-/Kampagnen-Identity-Profile

Unterstützte Typen:

- `campaign`
- `oneshot`
- `session`

Nachrichten:

- `identity.profile.save`
- `identity.profile.list.request`
- `identity.profile.list.result`
- `identity.profile.activate`
- `identity.profile.deactivate`
- `identity.profile.state.request`
- `identity.profile.state`

Ein Profil ist ein persistenter Snapshot der bestätigten Discord-Spieler-/Foundry-Charakterzuordnungen. Es kann Companion-weit immer nur **ein** Profil aktiv sein. Speichern allein aktiviert keine Nickname-Automatik.

## Discord-Session-Nickname

Standardformat:

`Charakter | Spieler`

Regeln:

1. Charaktername steht zuerst.
2. Maximal 32 Unicode-Zeichen.
3. Charaktername hat bei Platzmangel Priorität.
4. Aktuell beobachteter Discord-Anzeigename wird als Spieleranteil bevorzugt.
5. Nur serverbezogener Discord-Nickname wird verändert.
6. Originalzustand wird vor Mutation persistent gespeichert.
7. `Manage Nicknames` und Rollen-Hierarchie müssen die Änderung erlauben.
8. Identischer Zielnickname verursacht keinen unnötigen Write.

Persistenter Lease:

`discord_nickname_overrides`

Restore wird u. a. ausgelöst bei Call-Leave, Profilwechsel, Deaktivierung, geordnetem Shutdown und Restart-Recovery. Eine externe manuelle Namensänderung führt zu `restore_conflict` und wird nicht blind überschrieben.

Diagnose:

- `nickname.status`

## Discord-Ausgabe-Textkanal

Seit Foundry 0.9.29 / Companion 0.13.0 besitzt DM Cockpit einen eigenen Discord-Ausgabepfad.

### Persistenz

Tabelle:

`discord_output_settings`

Gespeichert werden nur:

- Guild-ID
- Kanal-ID
- letzter bekannter Kanalname
- Änderungszeitpunkt

Der GM kann den Zielkanal im Cockpit jederzeit neu auswählen oder vollständig entfernen.

### Verfügbare Kanäle

Request:

`discord.output.channels.request`

Result:

`discord.output.channels.result`

Der Companion liefert ausschließlich unterstützte Server-Textkanäle, in denen der Bot aktuell mindestens besitzt:

- `View Channel`
- `Send Messages`

Voice-, Kategorie-, Forum- oder nicht beschreibbare Kanäle werden nicht als Ziel angeboten.

### Zielkanal ändern

Request:

`discord.output.channel.set`

```json
{
  "channelId": "1234567890"
}
```

`channelId: null` entfernt den gespeicherten Zielkanal.

Status:

- `discord.output.state.request`
- `discord.output.state`

Vor jedem tatsächlichen Versand wird der gespeicherte Kanal erneut gegen Discord und die aktuellen Bot-Rechte geprüft. Eine alte gespeicherte Kanal-ID gilt daher nicht automatisch als sendbar.

## Discord-Nachrichten

Request:

`discord.output.message.request`

Erlaubte Arten:

- `capture_notice`
- `recap`

Result:

`discord.output.message.result`

Der Result-Payload enthält Versandstatus, Zielkanal, Discord-Message-ID soweit vorhanden, Textlänge und einen möglichen Fehler. Nachrichtentext wird **nicht** als Versand-Audit in SQLite gespeichert.

### Idempotenz / Audit

Tabelle:

`discord_output_posts`

Gespeichert werden Metadaten wie:

- Request-ID
- Art
- Session-ID
- Guild-/Kanal-ID
- Discord-Message-ID
- Status
- Textlänge
- Fehler
- Zeitstempel

Der eigentliche Nachrichtentext wird dort nicht persistiert.

Eine bereits erfolgreich versandte identische Request-ID wird nicht erneut an Discord gesendet. Dies verhindert insbesondere doppelte automatische Aufnahmehinweise durch Reconnect-/Retry-Pfade.

### Aufnahme-/Transkriptionshinweis

Bei neu gestarteter Voice-Session versucht der Companion automatisch genau einen erfolgreichen Hinweis für diese Session in den aktuell konfigurierten Zielkanal zu senden.

Standardinhalt informiert darüber, dass:

- die aktuelle Pen-&-Paper-Session live transkribiert wird
- DM Cockpit Roh-Audio nicht dauerhaft speichert
- ein aktiver Profilname, falls vorhanden, als Rundenname angezeigt werden kann

Falls kein Ausgabekanal gewählt oder der Kanal nicht beschreibbar ist, gilt `capture.status.noticeShown` weiterhin als `false`.

Der GM kann den Hinweis über die Cockpit-Karte `Discord-Ausgabe` zusätzlich bewusst erneut anfordern.

### Session-Recap

Die bestehende Discord-Kurzfassung bleibt lokal aus **manuell angenommenen** `session.event.candidate` erzeugt.

Die Recap-Karte bietet weiterhin:

- vollständiges Recap kopieren
- Discord-Kurzfassung kopieren

Neu kommt hinzu:

- `An Discord senden`

Dieser Button ist eine ausdrückliche GM-Aktion. Es gibt **kein automatisches Recap-Posting**.

Discord-Nachrichten sind auf 2000 Zeichen begrenzt; die bestehende Recap-Kurzfassung bleibt vorsorglich auf 1800 Zeichen begrenzt.

Bei allen DM-Cockpit-Ausgaben wird `allowedMentions.parse = []` verwendet, sodass Text aus Recap/KI-Kontext keine unbeabsichtigten `@everyone`, `@here` oder Rollen-/User-Pings auslöst.

## Transkript

`transcript.segment`

Persistiert werden nur finale Segmente. Ein finales Segment kann zusätzlich die zum Segmentzeitpunkt bestätigte Spieler-/Charakteridentität enthalten:

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
2. `speakerName` ist der Discord-Anzeigename.
3. Actor-/Charakterfelder stammen ausschließlich aus bestätigtem Mapping.
4. Ohne Mapping bleiben Actor-/Charakterfelder `null`.
5. Alte Segmente werden durch spätere Mapping-Änderungen nicht still umgeschrieben.
6. Die KI erhält Spieler-/Charakterkontext, aber keine Freiheit zur Actor-Zuordnung.

## NPC-Kontext / KI-Kandidaten / Undo

Bestehende Regeln bleiben unverändert:

- `npc.context` priorisiert expliziten Cockpit-Actor, dann ausgewählten Token, sonst keinen NPC
- NPC-Kandidaten dürfen nur dem von Foundry vorgegebenen Actor zugeordnet werden
- `npc.memory.candidate` und `session.event.candidate` bleiben manuell prüfbare Vorschläge
- `candidate.review` / `candidate.reviewed` persistieren Annahme/Ablehnung
- `npc.memory.applied`, `change.undo.request`, `change.undo.result` bilden den sicheren Change-/Undo-Pfad
- keine automatische Foundry-Actor-Mutation durch Discord-Identity-/Output-Logik

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
- Discord-Ausgabekanal ist persistent
- erfolgreiche Discord-Ausgabe-Request-IDs sind idempotent
- Reconnect darf gespeicherte Daten und automatische Hinweise nicht duplizieren
- Candidate-Review bleibt persistent
- Provider-/Discord-Fehler müssen sichtbar werden
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

- implementiert
- isolierter Smoke-Test bestanden
- CI-validiert mit `Build DM Cockpit v0.9.28`
- echter Discord-/Foundry-Runtime-Test noch offen

### Discord Output 0.9.29 / Companion 0.13.0

Auf dem Staging-Branch implementiert:

- persistenter frei wechselbarer Zielkanal
- reale Kanal-/Berechtigungsprüfung
- Ausgabe-Karte in Foundry
- automatischer idempotenter Aufnahmehinweis je Session
- manuell erneut sendbarer Aufnahmehinweis
- bewusstes direktes Recap-Posting
- `allowedMentions.parse = []`
- Versand-Audit ohne Nachrichtentext
- isolierter `discord-output-smoke-test.js`

Bis zum Merge und erfolgreichen Main-CI/Paketbuild gilt dieser Block **noch nicht als CI-validiert**. Echter Discord-/Foundry-Runtime-Test bleibt danach zusätzlich offen.
