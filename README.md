# DM Cockpit V0.9.21

Foundry-VTT-V14-Modul plus lokaler Companion Service für Discord Voice, Live-Transkript, NPC-Kontext und die geplante KI-Auswertung.

## Aktueller Stand

### Foundry V0.9.21 – funktional bestätigt

Bestätigte Kernfunktionen:

- LIVE-Dashboard
- Abenteuer-Flowchart
- spontane Szenen
- Szenen-Presets
- Gegner-Spawnpunkte
- Enemy Reserve Bench
- Handout Queue
- Loot-/Belohnungspakete + Item-Suche
- Compendium-Schnellsuche
- NPC-Schnellgenerator
- Actor-basiertes NPC Memory
- Discord Live-Transkript UI/Transport-Client
- NPC-Kontext aus ausgewähltem Cockpit-Actor bzw. ausgewähltem Foundry-Token
- Foundry/GitHub Update-System

Foundry bleibt auf **V0.9.21**. Der Companion wird unabhängig davon versioniert.

## Discord Audio & Companion

### Companion 0.1.0 – bestätigt

Der lokale Basispfad wurde auf dem Ziel-PC Ende-zu-Ende bestätigt:

**Foundry ↔ WebSocket ↔ Companion ↔ SQLite**

### Companion 0.2.0 – bestätigt

Auf echtem Discord bestätigt:

- Bot-Login
- DAVE/E2EE Voice
- Auto-Join beim konfigurierten GM
- Follow bei Voice-Channel-Wechsel
- Leave, wenn der GM Voice verlässt

### Companion 0.3.0 – bestätigt

Echter Discord-Audioempfang wurde bestätigt:

- Sprechertrennung per Discord User ID
- Discord-Opus nur temporär im RAM
- Testsegmente mit realen Audio-Paketen/Bytes erfolgreich
- keine dauerhaften Roh-Audiodateien

### Companion 0.4.0 – echter Deepgram-STT-Test bestätigt

Der reale Sprache-zu-Text-Pfad funktioniert:

**Discord Voice → DAVE → sprechergetrenntes Opus → Deepgram → Text**

Bestätigter Test:

- Sprecher: `hacker 2090`
- 233 Opus-Pakete
- 32.124 Bytes
- 5.980 ms
- erkannt: `Dies ist ein Test für das DM Cockpit. Kannst Du mich verstehen?`
- Confidence: **0.931**

STT-Architektur:

- provider-neutraler `SttService`
- sicherer Default `STT_PROVIDER=none`
- erster Adapter: Deepgram Nova-3
- Deutsch
- Deepgram EU-Endpunkt
- Discord Opus 48 kHz Stereo direkt als Input
- begrenzte Parallelität, Queue und Retries
- `mip_opt_out=true` wird im Deepgram-Adapter erzwungen
- Provider/API-Key bleiben lokal in `companion/.env`

Der Rückpfad über Protocol v1 zu SQLite/Foundry ist implementiert. Der WebSocket/SQLite-Pfad war bereits zuvor per Mock Ende-zu-Ende bestätigt.

## Companion 0.5.0 – auf GitHub, noch nicht lokal regressionsgetestet

Der aktuelle GitHub-Paketstand ist **0.5.0**.

Neu vorbereitet:

- SQLite-Tabelle `npc_memory_candidates`
- SQLite-Tabelle `session_event_candidates`
- Indizes für Kandidaten
- `addNpcMemoryCandidate`
- `addSessionEventCandidate`
- Health-Stats `npcCandidates` und `sessionEventCandidates`
- Protocol-Handler `npc.memory.candidate`
- Protocol-Handler `session.event.candidate`
- Persistenz und WebSocket-Broadcast der Kandidaten
- Schema-Support für Session-Event-Kandidaten

Noch **nicht** implementiert:

- kein LLM/AI-Extraktionsprovider
- keine automatische Analyse von Transkriptsegmenten
- keine automatische Kandidaten-Erzeugung aus Sprache
- keine Kandidaten-UI in Foundry
- keine automatische Actor-Änderung
- keine Undo-Ausführung

## Nächster einzelner Schritt

**Companion 0.5.0 auf dem Nutzer-PC regressionsprüfen.**

Dabei prüfen:

1. `git pull`
2. `cd companion`
3. `npm.cmd install`
4. `npm.cmd run check`
5. `npm.cmd start`
6. Discord Voice/DAVE weiterhin funktionsfähig
7. kurzer Deepgram-STT-Test weiterhin erfolgreich
8. `/health` meldet `serviceVersion: 0.5.0`
9. `/health` enthält `npcCandidates` und `sessionEventCandidates`

Erst danach folgt die **AI-Kandidaten-Pipeline**.

## Geplante AI-Pipeline

Zunächst nur strukturierte Vorschläge, **keine automatischen Actor-Schreibvorgänge**.

Zieltypen:

- `npc.memory.candidate`
  - Aussagen
  - Wissen
  - Aktionen
  - Beziehungen
  - Versprechen
  - Lügen
  - Fristen
  - Konsequenzen
- `session.event.candidate`
  - Entscheidungen
  - Quests/Aufgaben
  - Loot/Belohnungen
  - offene Fragen
  - Kämpfe
  - wichtige Ereignisse

Danach:

1. Kandidaten-UI in Foundry
2. manuelles Annehmen/Verwerfen
3. Undo/Change-Record Runtime
4. erst dann optionale automatische NPC-Memory-Updates
5. dauerhaft durchsuchbares Transkript
6. Session-Historie, Recap und Discord-Kurzfassung

## Datenschutz / Secrets

- Discord Bot Token niemals in GitHub oder Chat speichern.
- Deepgram API Key niemals in GitHub oder Chat speichern.
- Secrets bleiben ausschließlich lokal in `companion/.env`.
- Roh-Audio wird nicht dauerhaft gespeichert.
- `notice_only` ist nur eine technische Capture-Policy und keine rechtliche Einwilligung.

## Projekt-Checkpoint

Der aktuelle kanonische chatübergreifende Projektstand liegt in:

`PROJECT-CHECKPOINT.json`

Historische Snapshots liegen unter:

`checkpoints/`

Der aktuelle Checkpoint ist **Schema 3.0** und enthält bestätigte Funktionen, Architekturhistorie, Companion-/STT-Stand, offene Funktionen und die Roadmap.

## Dokumentation

- `PROJECT-CHECKPOINT.json`
- `docs/DISCORD-AUDIO-AI-CONTRACT-V1.md`
- `docs/STT-PROVIDER-EVALUATION-2026-08-09.md`
- `schemas/discord-audio-ai-v1.schema.json`
- `companion/README.md`

## Installation / Updates

Manifest:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Foundry-Installationspaket:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Der Companion liegt separat unter `companion/` und ist nicht Bestandteil des Foundry-ZIPs.
