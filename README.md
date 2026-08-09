# DM Cockpit V0.9.21

Foundry-VTT-V14-Modul plus lokaler Companion Service für Discord Voice, Live-Transkript, NPC-Kontext und strukturierte KI-Kandidaten.

## Aktueller Stand

### Foundry V0.9.21 – funktional bestätigt

Bestätigte Kernfunktionen:

- LIVE-Dashboard
- Abenteuer-Flowchart
- spontane Szenen und Szenen-Presets
- Gegner-Spawnpunkte und Enemy Reserve Bench
- Handout Queue
- Loot-/Belohnungspakete + Item-Suche
- Compendium-Schnellsuche
- NPC-Schnellgenerator
- Actor-basiertes NPC Memory
- Discord Live-Transkript UI/Transport-Client
- NPC-Kontext aus Cockpit-Actor bzw. ausgewähltem Foundry-Token
- Foundry/GitHub Update-System

Foundry bleibt auf **V0.9.21**. Der Companion wird unabhängig davon versioniert.

## Companion – bestätigte Baseline 0.5.0

Auf dem Nutzer-PC vollständig bestätigt:

- Foundry ↔ WebSocket ↔ Companion ↔ SQLite
- Discord Bot Login
- DAVE/E2EE Voice
- Auto-Join und Follow beim konfigurierten GM
- sprechergetrennter Discord-Opus-Empfang
- keine dauerhafte Roh-Audio-Speicherung
- Deepgram Nova-3 STT auf Deutsch
- echter Discord → Deepgram → Protocol v1 → Foundry-Live-Transkript-Pfad
- `npc.memory.candidate` Broadcast + SQLite-Persistenz
- `session.event.candidate` Broadcast + SQLite-Persistenz

Bestätigter 0.5.0-Regressionstest:

- 344 Opus-Pakete
- 47.775 Bytes
- 8.220 ms
- Confidence **0.961**
- erkannter Satz im Foundry-Live-Transkript sichtbar
- Candidate-Zähler erfolgreich von 0 → 1 für beide Candidate-Typen

## Companion 0.6.0 – auf GitHub, Nutzer-PC-Test ausstehend

Neu:

- provider-neutraler `AiExtractionService`
- sicherer Default `AI_PROVIDER=none`
- deterministischer `MockAiExtractionProvider` für lokale Tests
- finale `transcript.segment`-Nachrichten gehen über Protocol v1 in die Extraktionsschicht
- NPC-Kontext pro Session + Latest-Context-Fallback, damit eine Auswahl vor Sessionstart nicht verloren geht
- strukturierte Ausgabe als `npc.memory.candidate` und `session.event.candidate`
- `sourceSegmentIds` als Herkunftsnachweis
- Provider/Modell/Confidence/Status am Kandidaten
- Deduplizierung per Segment-ID
- Partials werden ignoriert
- weiterhin **keine automatischen Actor-Schreibvorgänge**

Der isolierte AI-Test ist bereits erfolgreich gelaufen. Der End-to-End-Smoke-Test ist vorbereitet und syntaktisch geprüft.

### Lokaler 0.6.0-Test

```powershell
Ctrl+C
cd $HOME\Desktop\dm-cockpit
git pull
cd companion
npm.cmd install
npm.cmd run check
npm.cmd run test:ai
```

Danach wird der Companion einmal temporär mit `AI_PROVIDER=mock` gestartet und in einer zweiten PowerShell ausgeführt:

```powershell
npm.cmd run test:ai-pipeline
```

Der Pipeline-Test prüft automatisch:

**npc.context + final transcript.segment → AiExtractionService → NPC-/Session-Kandidat → Protocol v1 → SQLite**

## Geplante nächste Stufen

1. 0.6.0 lokal bestätigen
2. realen AI/LLM-Provider auswählen und anbinden
3. Kandidaten-UI in Foundry mit Annehmen/Verwerfen
4. Undo/Change-Record Runtime
5. erst danach optionale automatische NPC-Memory-Übernahme
6. durchsuchbares Transkript
7. Session-Historie, Recap und Discord-Kurzfassung

## Datenschutz / Secrets

- Discord Bot Token niemals in GitHub oder Chat speichern.
- Deepgram API Key niemals in GitHub oder Chat speichern.
- spätere AI/API Keys ebenfalls ausschließlich lokal halten.
- Secrets bleiben in `companion/.env`.
- Roh-Audio wird nicht dauerhaft gespeichert.
- `notice_only` ist nur eine technische Capture-Policy und keine rechtliche Einwilligung.

## Projekt-Checkpoint

Kanonischer Projektstand:

`PROJECT-CHECKPOINT.json`

Historische Snapshots:

`checkpoints/`

Aktueller Checkpoint: **Schema 3.5**.

## Installation / Updates

Manifest:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Foundry-Installationspaket:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Der Companion liegt separat unter `companion/` und ist nicht Bestandteil des Foundry-ZIPs.
