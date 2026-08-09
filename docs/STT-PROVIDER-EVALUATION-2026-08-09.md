# STT Provider Evaluation – 2026-08-09

Ziel für DM Cockpit:

- Discord Voice liefert bereits sprechergetrennte Opus-Pakete pro Discord User ID.
- Ziel-Latenz: ungefähr 5–15 Sekunden.
- Zielgröße: mehr als 10 Teilnehmer.
- Roh-Audio soll nicht dauerhaft gespeichert werden.
- Provider muss austauschbar bleiben.

## Entscheidung für den ersten Integrations-Test

**Deepgram Nova-3** wird als erster STT-Adapter implementiert.

Das ist keine dauerhafte Bindung. `SttService` bleibt provider-neutral und wählt den Adapter über `STT_PROVIDER`.

## Warum Deepgram zuerst

### Direkter technischer Fit zu Discord

Discord Voice verwendet Opus mit 48 kHz und zwei Kanälen. Deepgram Streaming STT akzeptiert rohes/headerloses Opus direkt, wenn `encoding=opus`, `sample_rate=48000` und die Kanalzahl angegeben werden.

Damit ist für den ersten realen STT-Pfad kein FFmpeg und kein Opus→PCM-Decode notwendig.

Quellen:

- Discord Voice: https://docs.discord.com/developers/topics/voice-connections
- Deepgram Encoding: https://developers.deepgram.com/docs/encoding
- Deepgram Sample Rate: https://developers.deepgram.com/docs/sample-rate
- Deepgram Channels: https://developers.deepgram.com/docs/channels

### Deutsch

Nova-3 unterstützt Deutsch (`de`) im Streaming-Betrieb.

Quelle:

- https://developers.deepgram.com/docs/models-languages-overview

### EU-Endpunkt

Für den ersten Adapter wird standardmäßig der EU-Endpunkt verwendet:

`wss://api.eu.deepgram.com/v1/listen`

Deepgram dokumentiert dafür EU-Datenverarbeitung; vorhandene API-Keys funktionieren auch mit dem regionalen Endpunkt.

Quelle:

- https://developers.deepgram.com/reference/custom-endpoints

### Parallelität

Deepgram dokumentiert für Nova-3 Streaming bis zu 150 gleichzeitige Verbindungen im Pay-As-You-Go-Tarif, auch am EU-Endpunkt. Das liegt deutlich über dem DM-Cockpit-Ziel von >10 Teilnehmern.

Quelle:

- https://developers.deepgram.com/reference/api-rate-limits

### Kosten

Die aktuelle Deepgram-Preisseite nennt für Nova-3 Streaming ungefähr 0,29 USD/Stunde bei monolingualem PAYG bzw. 0,35 USD/Stunde multilingual. Neue PAYG-Konten werden aktuell mit 200 USD Testguthaben beworben.

Quelle:

- https://deepgram.com/pricing

## Vergleich: Google Speech-to-Text

Google Speech-to-Text V2 Standard Recognition ist technisch ebenfalls ausreichend und unterstützt große Streaming-Parallelität. Der aktuelle Einstiegspreis liegt laut Google bei 0,016 USD pro Audiominute bis 500.000 Minuten/Monat. Dynamic Batch ist günstiger, passt aber nicht zum Live-Ziel.

Quellen:

- https://cloud.google.com/speech-to-text/pricing
- https://docs.cloud.google.com/speech-to-text/docs/quotas

Bewertung für DM Cockpit: funktional geeignet, aber für den ersten Prototyp teurer und ohne den gleichen direkten Vorteil des bereits vorhandenen Discord-Opus-Pfads.

## Vergleich: OpenAI Transcription

OpenAI bietet aktuelle Realtime-/Transcription-Modelle wie `gpt-4o-mini-transcribe` und `gpt-4o-transcribe`. Realtime-Transcription unterstützt aktuell PCM 24 kHz sowie G.711 PCMU/PCMA als Eingabeformate. Unser Discord-Empfang liegt bereits als Opus 48 kHz vor, daher wäre für diesen Pfad zusätzliche Audio-Konvertierung nötig.

Quellen:

- https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe
- https://platform.openai.com/docs/api-reference/realtime

Bewertung für DM Cockpit: weiterhin interessanter alternativer Adapter, insbesondere falls spätere KI-Funktionen ohnehin über OpenAI laufen. Für den ersten Audio→Text-Test ist Deepgram technisch direkter.

## Architekturentscheidung

Companion 0.4.0:

- `STT_PROVIDER=none` ist Standard.
- `STT_PROVIDER=deepgram` aktiviert den ersten realen Adapter.
- `DEEPGRAM_API_KEY` bleibt ausschließlich lokal in `companion/.env`.
- Standard: EU-Endpunkt, Nova-3, Sprache Deutsch.
- Discord User ID bleibt die Sprecheridentität; Provider-Diarization ist daher nicht nötig.
- Audio bleibt nur im RAM.
- STT-Jobs haben eine begrenzte Queue, begrenzte Parallelität und begrenzte Retries.
- Erfolgreiche finale Transkripte werden über Protocol v1 an den bestehenden Companion-Server zurückgegeben, dort in SQLite gespeichert und an Foundry weitergeleitet.

## Nächster Test

1. Companion 0.4.0 lokal aktualisieren und Syntaxcheck durchführen.
2. Deepgram-Testkonto/API-Key erstellen.
3. Lokal `STT_PROVIDER=deepgram` und `DEEPGRAM_API_KEY` setzen.
4. Companion + Foundry starten.
5. Im Discord Voice einen kurzen deutschen Satz sprechen.
6. Prüfen:
   - `[stt] <Name>: "..."` im Terminal,
   - Satz im Foundry Live-Transkript,
   - `segments` im SQLite-Health-Status steigt.

Erst danach folgen KI-Extraktion/NPC-Memory-Automatik.
