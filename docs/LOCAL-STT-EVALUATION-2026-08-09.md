# DM Cockpit – lokale STT-Evaluation (2026-08-09)

Status: **Entwurf / noch nicht auf dem Nutzer-PC getestet**

Ziel: Prüfen, ob nach der lokalen LLM-Extraktion auch Speech-to-Text ohne laufende Cloud-Gebühren betrieben werden kann, ohne die bestehende bestätigte Deepgram-Strecke zu beschädigen.

## Ergebnis

**Technisch sinnvoller erster lokaler STT-Kandidat: `faster-whisper` auf CPU mit multilingualem Whisper `small` und `int8`.**

Warum nicht sofort GPU:

- Der Ziel-PC hat eine RTX 3060 Ti mit 8 GB VRAM.
- Qwen3 4B über Ollama belegt bereits mehrere GB VRAM.
- Gleichzeitiges lokales STT + lokales LLM auf derselben 8-GB-GPU kann unnötig VRAM-Druck erzeugen.
- faster-whisper veröffentlicht einen CPU-Benchmark des Whisper-`small`-Modells auf einem **Intel i7-12700K**: 13 Minuten Audio in etwa 1m42s mit int8. Das ist deutlich schneller als Echtzeit und sehr nah an der CPU-Klasse des Ziel-PCs.
- Deshalb ist CPU-STT als erste kostenlose Variante architektonisch attraktiver: CPU übernimmt STT, GPU bleibt für Qwen/Ollama frei.

Quelle: https://github.com/SYSTRAN/faster-whisper

## Kandidaten

### 1. faster-whisper – bevorzugter Prototyp

Vorteile:

- MIT-Lizenz
- Python 3.9+
- CTranslate2-basierte Whisper-Inferenz
- int8 auf CPU möglich
- offizieller Benchmark auf i7-12700K vorhanden
- benötigt laut Projekt kein separat installiertes FFmpeg; Audio-Decoding erfolgt über PyAV, das FFmpeg-Bibliotheken mitbringt
- Modell kann einmal geladen und für viele Segmente wiederverwendet werden

Nachteile / offene Punkte:

- DM Cockpit besitzt derzeit **rohe Discord-Opus-Pakete**, keine WAV/MP3-Datei
- ein Decode-Schritt Opus → PCM bleibt deshalb notwendig
- Python-Sidecar/Worker muss zuverlässig gestartet, überwacht und beendet werden

Quelle: https://github.com/SYSTRAN/faster-whisper

### 2. whisper.cpp – guter Fallback

Vorteile:

- sehr leichtgewichtiges C/C++-Projekt
- Windows-Unterstützung
- CPU- und NVIDIA-GPU-Unterstützung
- Quantisierung und VAD verfügbar
- offline

Nachteile für unseren aktuellen Pfad:

- das dokumentierte `whisper-cli` erwartet 16-Bit-WAV; rohe Discord-Opus-Pakete müssen also ebenfalls vorher decodiert/konvertiert werden
- Integration als dauerhaft laufender Companion-Worker ist etwas stärker eigenständig zu bauen

Quelle: https://github.com/ggml-org/whisper.cpp

### 3. OpenAI Whisper Python – Referenz, nicht erste Wahl

OpenAI dokumentiert ungefähr:

- `small`: ~2 GB VRAM
- `medium`: ~5 GB VRAM
- `turbo`: ~6 GB VRAM

Auf einem 8-GB-GPU-System, auf dem parallel Qwen/Ollama laufen soll, ist GPU-Whisper daher nicht unser erster Pfad.

Quelle: https://github.com/openai/whisper

## Audio-Decode: eigentlicher Integrationspunkt

Aktueller DM-Cockpit-Pfad:

```text
Discord Voice
  -> DAVE
  -> sprechergetrennte rohe Opus-Pakete
  -> Segment im RAM
  -> Deepgram akzeptiert Opus direkt
```

Lokales Whisper benötigt PCM/Audio-Samples. Vorgeschlagener lokaler Pfad:

```text
Discord Voice
  -> DAVE
  -> sprechergetrennte Opus-Pakete
  -> libopus Decoder in Node
  -> PCM int16 48 kHz Stereo im RAM
  -> lokaler faster-whisper Worker
     -> Downmix/Resample auf Whisper-Eingabe
     -> Transkript
  -> bestehender transcript.segment Pfad
```

Für Node existiert `@discordjs/opus` mit Windows-x64-Unterstützung und `OpusEncoder.decode(...)`. Das Paket ist MIT-lizenziert und für Discord-Voice-Workloads gedacht.

Quelle: https://www.npmjs.com/package/@discordjs/opus

Wichtig: `@discordjs/opus` ist ein natives Modul. **Es wird nicht ungeprüft in den produktiven Companion aufgenommen**, bevor Installation und Decode unter dem tatsächlich verwendeten Node 24 auf dem Nutzer-PC separat bestätigt sind.

## Vorgeschlagene Worker-Architektur

Nicht pro Segment einen Python-Prozess starten. Das würde das Whisper-Modell jedes Mal neu laden.

Stattdessen:

```text
Companion Node
  -> LocalSttService
     -> OpusDecodeAdapter
     -> persistent LocalWhisperWorker
        - Python
        - faster-whisper
        - Modell einmal laden
        - CPU / int8
        - Sprache de
        - keine Audiodateien
     <- TranscriptResult
  -> vorhandenes transcript.segment
```

Der Worker soll nur RAM-Daten erhalten. Keine temporären Roh-Audiodateien auf Platte.

## Erster Modellvorschlag

```text
faster-whisper
model = small
language = de
compute_type = int8
device = cpu
```

Begründung:

- geringe Integrations- und VRAM-Risiken
- Ziel-Latenz des Projekts liegt bei ungefähr 5–15 Sekunden
- veröffentlichter CPU-Benchmark deutet darauf hin, dass `small/int8` auf i7-12700K deutlich schneller als Echtzeit transkribieren kann
- GPU bleibt frei für Qwen3

Das ist eine **technische Prognose, noch keine Nutzer-PC-Bestätigung**.

## Qualitäts-/Performance-Gate

Lokales STT ersetzt Deepgram erst, wenn ein späterer Vergleichstest mindestens prüft:

1. deutsche Alltagssprache
2. D&D-/TTRPG-Begriffe und Eigennamen
3. mehrere Discord-Sprecher getrennt
4. kurze 2–5-Sekunden-Segmente
5. 10–20-Sekunden-Segmente
6. Hintergrundrauschen
7. Zahlen, Fristen und Eigennamen
8. mittlere Latenz
9. P95-Latenz
10. CPU-Last während Foundry + Discord + Ollama

Deepgram bleibt bis dahin der bestätigte Fallback.

## Sicherheitsregeln

- keine dauerhafte Roh-Audio-Speicherung
- lokale STT-Aktivierung explizit über Provider-Setting
- bestehender `STT_PROVIDER=deepgram`-Pfad bleibt unangetastet, bis der lokale Pfad real bestätigt ist
- keine automatische Migration der `.env`
- keine nativen Abhängigkeiten ungeprüft installieren

## Nächste implementierbare Stufe ohne Nutzer-PC

1. `LocalSttService`-Schnittstelle spezifizieren
2. Python-Worker-Protokoll definieren
3. Fake-Worker-Test bauen
4. Opus-Decode-Adapter hinter Feature Flag vorbereiten
5. erst dann real `@discordjs/opus` + faster-whisper auf Nutzer-PC testen
