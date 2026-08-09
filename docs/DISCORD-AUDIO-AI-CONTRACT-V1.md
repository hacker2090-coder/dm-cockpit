# DM Cockpit – Discord Audio & KI – Contract v1

Stand: 2026-08-09

## Ziel

Dieser Vertrag trennt das Foundry-Modul von Discord, Speech-to-Text und Cloud-KI. Dadurch kann der Audio/KI-Teil später lokal oder auf einem VPS laufen und der Anbieter für STT/KI gewechselt werden, ohne das DM-Cockpit-Datenmodell neu zu entwerfen.

## Festgelegte V1-Rahmenbedingungen

- Foundry und Discord laufen derzeit auf demselben PC.
- Bot-Hosting bleibt vorerst offen.
- Bot soll automatisch dem Voice-Channel des konfigurierten GM folgen.
- Keine feste Teilnehmerobergrenze im Protokoll; Ziel ist auch >10 Teilnehmer.
- Ziel-Latenz für Transkriptsegmente: 5–15 Sekunden.
- STT- und KI-Anbieter bleiben austauschbar.
- Dauerhafte Transkripte werden lokal in SQLite gespeichert.
- Roh-Audio ist nur ein Kurzzeitpuffer und wird nach erfolgreicher Transkription gelöscht.
- Capture-Policy ist konfigurierbar. Aktuelle Nutzerentscheidung: `notice_only`.
- `notice_only` wird technisch nicht als rechtliche Einwilligung oder Freigabe interpretiert. Die tatsächliche Berechtigung zur Audioverarbeitung ist davon getrennt.

## Komponenten

### 1. DM Cockpit / Foundry

Aufgaben:

- Live-Transkript darstellen
- aktiven NPC aus Cockpit oder ausgewähltem Token melden
- NPC-Memory-Kandidaten anwenden
- Undo/Änderungsverlauf ausführen
- Sessionstatus anzeigen

Foundry verarbeitet in V1 kein Discord-Audio direkt.

### 2. Companion Service

Ein separater Prozess übernimmt:

- Discord Gateway / Voice
- DAVE/E2EE-fähige Voice-Verbindung
- Sprechertrennung anhand Discord User IDs
- kurzzeitiges Audio-Buffering
- STT-Provider-Adapter
- KI-Provider-Adapter
- SQLite-Archiv
- WebSocket-Schnittstelle zum DM Cockpit

Damit bleibt das Foundry-Modul browserkompatibel und benötigt keine nativen Discord-/Audio-Bibliotheken.

### 3. SQLite

V1 speichert lokal:

- Sessions
- Sprecher
- finale Transkriptsegmente
- Quellenbeziehungen zwischen Transkript und KI-Ergebnissen
- Undo-/Change-Records
- Provider-/Modell-Metadaten für Nachvollziehbarkeit

Roh-Audio gehört nicht in die Datenbank.

## Transport

### Lokal

Empfohlener Standard:

`ws://127.0.0.1:<port>/v1`

Der Companion Service bindet im lokalen Modus ausschließlich an Loopback. Der Port soll konfigurierbar sein.

### Späterer VPS-Betrieb

Bei Remote-Betrieb wird derselbe Nachrichtenvertrag verwendet, aber ausschließlich über TLS:

`wss://<host>/v1`

Remote-Betrieb benötigt Authentifizierung. Secrets werden nie im Repository gespeichert.

## Nachrichtenformat

Jede Nachricht verwendet einen Envelope:

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

Das maschinenlesbare Schema liegt unter:

`schemas/discord-audio-ai-v1.schema.json`

## Kernnachrichten

### `hello` / `hello.ack`

Handshake zwischen Foundry und Companion Service. Dient zur Protokollversion und Feature-Erkennung.

### `session.started`

Startet die logische PnP-Session. Wichtige Metadaten:

- Session-ID
- Guild-ID
- Voice-Channel-ID
- GM Discord User ID
- Capture-Policy
- Provider-Konfiguration als nicht geheime IDs/Namen

### `speaker.upserted`

Registriert oder aktualisiert einen Discord-Sprecher. Primärschlüssel ist die Discord User ID, nicht der Anzeigename.

### `capture.status`

Meldet den Audiozustand sichtbar an das Cockpit:

- idle
- joining
- listening
- paused
- stopping
- error

Zusätzlich werden Capture-Policy und Roh-Audio-Retention gemeldet.

### `transcript.segment`

Kernobjekt für Live-Transkription:

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
  "provider": "provider-id",
  "confidence": 0.94
}
```

V1 verarbeitet für persistente Daten nur finale Segmente. Partials dürfen optional für UI-Livefeedback gesendet werden, werden aber nicht dauerhaft gespeichert.

## 5–15-Sekunden-Latenz

Der Vertrag schreibt keinen konkreten Provider vor. Der Companion Service sammelt Sprache pro Discord-Nutzer in kurzen utterance-/zeitbasierten Fenstern.

Ziel:

- Finalisierung möglichst innerhalb 5–15 Sekunden
- Sprecher unabhängig verarbeiten
- keine globale Audio-Mischspur als Primärquelle
- Backpressure/Queue statt Segmentverlust, falls mehr als 10 Teilnehmer gleichzeitig aktiv sind

## NPC-Kontext

Foundry sendet `npc.context`, wenn sich der relevante NPC ändert.

Priorität:

1. explizit aktiver NPC im DM Cockpit
2. ausgewählter Foundry-Token
3. kein NPC

Der Actor wird mindestens über `actorId` bzw. `actorUuid` referenziert.

## NPC-Memory-Kandidat

KI-Ergebnisse werden nicht als Freitext ohne Herkunft gespeichert. Jeder Kandidat enthält:

- Ziel-Actor
- Memory-Typ
- normalisierten Text
- Quell-Segment-IDs
- optional Confidence
- Provider und Modell
- Zeitstempel

V1-Typen:

- statement
- knowledge
- action
- relationship
- promise
- lie
- deadline
- consequence
- other

## Direktes Speichern + Undo

Die gewünschte V1 speichert akzeptierte KI-Ergebnisse direkt am Actor. Deshalb ist Undo Teil des Datenmodells und kein späteres Extra.

Vor jeder automatischen Actor-Änderung wird ein Change-Record erzeugt:

- Change-ID
- Actor-ID
- Flag-Pfad
- vorheriger Wert
- neuer Wert
- Quelle/Kandidat
- Zeitstempel

Ein Undo stellt den vorherigen Zustand wieder her und wird selbst protokolliert.

## Provider-Abstraktion

Der Kernvertrag enthält keine OpenAI-, Google-, Azure- oder andere vendorspezifische Pflichtfelder.

Der Companion Service erhält zwei Adapter-Schnittstellen:

### TranscriptionProvider

Eingabe:

- Sprecher-ID
- Audiochunk/Stream
- Sprache/Auto-Detect
- Zeitinformationen

Ausgabe:

- finaler/partieller Text
- Zeitgrenzen
- optional Confidence
- Provider-/Modellkennung

### ExtractionProvider

Eingabe:

- finale Transkriptsegmente
- aktueller NPC-Kontext
- bestehende relevante Actor-Memories

Ausgabe:

- strukturierte NPC-Memory-Kandidaten
- Quell-Segment-IDs
- optional Confidence

So kann der Anbieter später verglichen oder gewechselt werden, ohne die Foundry-Seite umzubauen.

## Auto-Join des GM

Der Companion Service speichert eine konfigurierte GM Discord User ID. Bei Voice-State-Änderungen:

1. GM betritt einen Voice-Channel.
2. Bot joint denselben Channel.
3. Capture-Status wechselt auf `joining` und danach `listening`.
4. Wechselt der GM den Channel, folgt der Bot.
5. Verlässt der GM Voice, wird die Session nicht zwingend sofort gelöscht; Capture wird beendet/pausiert und Session-Ende separat behandelt.

Die konkrete Discord-Voice-Implementierung muss DAVE/E2EE unterstützen.

## Capture-Policy

Unterstützte technische Modi:

- `notice_only`
- `explicit_per_session`
- `persistent_participant_consent`

Aktuell ausgewählt: `notice_only`.

Wichtig: Dieses Feld dokumentiert ausschließlich die technische Workflow-Einstellung. Es behauptet nicht, dass eine bestimmte Policy in einer konkreten Situation rechtlich ausreicht.

## Roh-Audio

V1-Regel:

`until_successful_transcription`

Ablauf:

1. Audiochunk wird temporär gehalten.
2. STT liefert erfolgreich ein finales Ergebnis.
3. Finales Segment wird in SQLite persistiert.
4. Zugehöriger Roh-Audiochunk wird gelöscht.
5. Bei Fehler bleibt der Chunk nur für einen begrenzten Retry-Zeitraum; keine dauerhafte Audioarchivierung.

## Fehler- und Wiederanlaufregeln

- Nachrichten besitzen eindeutige IDs.
- finale Transkriptsegmente besitzen eindeutige Segment-IDs.
- SQLite-Schreibvorgänge müssen idempotent gegen doppelte Segment-IDs sein.
- WebSocket-Reconnect darf bereits gespeicherte Segmente nicht duplizieren.
- Providerfehler führen zu Queue/Retry und sichtbarem Status, nicht zu stillem Verlust.
- Discord-Reconnect und Foundry-Reconnect sind getrennte Zustände.

## Nicht Teil dieses TODOs

Noch nicht implementiert:

- tatsächlicher Discord Bot
- DAVE/libdave-Anbindung
- echter STT-Provider
- Live-Transkript-UI
- KI-Extraktion
- SQLite-Code
- Session-Recap

Dieser Schritt definiert ausschließlich den stabilen Vertrag, auf dem diese Komponenten aufbauen.

## Nächster einzelner TODO

**Foundry Live-Transkript V1 als Mock/Transport-Client implementieren.**

Dabei soll das Cockpit bereits `transcript.segment`, `capture.status` und `npc.context` gegen simulierte Daten verarbeiten können, bevor Discord Voice oder ein kostenpflichtiger Cloud-Provider eingebaut wird.
