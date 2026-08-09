# DM Cockpit V0.9.21

Foundry-Modul plus lokaler Companion Service für Discord Voice, Transkript, NPC-Kontext und spätere KI-Automatik.

## Aktueller bestätigter Stand

### Foundry V0.9.21 – bestätigt

- LIVE-Dashboard
- Abenteuer-Flowchart
- spontane Szenen / Szenen-Presets
- Gegner-Spawnpunkte / Enemy Reserve Bench
- Handout Queue
- Loot-/Belohnungspakete + Item-Suche
- Compendium-Schnellsuche
- NPC-Schnellgenerator
- Actor-basiertes NPC Memory
- Discord Live-Transkript
- NPC-Kontext aus ausgewähltem Actor

### Companion 0.1.0 – bestätigt

**Foundry ↔ WebSocket ↔ Companion ↔ SQLite** wurde auf dem Ziel-PC Ende-zu-Ende bestätigt.

### Companion 0.2.0 – bestätigt

Auf echtem Discord bestätigt:

- Bot-Login
- DAVE/E2EE Voice
- Auto-Join beim konfigurierten GM
- Follow bei Channel-Wechsel
- Leave, wenn GM Voice verlässt

### Companion 0.3.0 – bestätigt

Echter Discord-Audioempfang wurde am 09.08.2026 bestätigt:

- Sprechertrennung über Discord User ID
- Opus-Puffer nur im RAM
- bestätigte Testsegmente: 362 Pakete / 49.801 Bytes und 105 Pakete / 14.643 Bytes
- keine Roh-Audiodateien auf Platte

## Companion 0.4.0 – Speech-to-Text implementiert

Neu:

- provider-neutraler `SttService`
- sicherer Standard `STT_PROVIDER=none`
- erster Adapter: Deepgram Nova-3
- deutscher STT-Pfad
- Standard über Deepgram EU-Endpunkt
- Discord-Opus 48 kHz Stereo wird direkt an den Provider weitergegeben
- begrenzte Parallelität, Queue und Retries
- Discord-Sprechername wird aufgelöst
- interner Protocol-v1-Publisher
- finales STT-Ergebnis läuft zurück über den bestätigten Companion-Pfad zu SQLite und Foundry

Zielpfad:

**Discord Voice → DAVE → sprechergetrenntes Opus → STT → Protocol v1 → SQLite → Foundry Live-Transkript**

Cloud-STT ist standardmäßig deaktiviert. Erst mit lokaler Konfiguration von `STT_PROVIDER` und Provider-Key wird Audio extern verarbeitet.

Details:

- `companion/README.md`
- `docs/STT-PROVIDER-EVALUATION-2026-08-09.md`
- `docs/DISCORD-AUDIO-AI-CONTRACT-V1.md`
- `schemas/discord-audio-ai-v1.schema.json`

## Nächster einzelner Test

**Companion 0.4.0 mit einem realen Deepgram-Testkey prüfen:**

1. Companion lokal aktualisieren und `npm.cmd run check` ausführen.
2. Deepgram API-Key ausschließlich lokal in `companion/.env` eintragen.
3. `STT_PROVIDER=deepgram` setzen.
4. Foundry Live-Transkript verbinden.
5. Discord-Voice betreten und einen kurzen deutschen Satz sprechen.
6. Prüfen: `[stt] <Name>: "..."` im Terminal.
7. Derselbe Satz muss in Foundry erscheinen.
8. SQLite `segments` muss steigen.

## Danach

Nach bestätigtem echten STT folgt als eigener Schritt die **KI-Extraktion als Candidate-Pipeline**. Noch keine automatischen Actor-Schreibvorgänge, bis der Undo-/Change-Pfad sauber aktiv ist.

## Updates

Manifest:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Installationspaket:
`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Der Companion liegt separat unter `companion/` und ist nicht Bestandteil des Foundry-ZIPs. Die Foundry-Version bleibt V0.9.21.
