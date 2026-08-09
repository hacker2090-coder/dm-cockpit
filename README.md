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

0.5.0 Regressionstest:

- 344 Opus-Pakete
- 47.775 Bytes
- 8.220 ms
- erkannter Satz: `Das ist der Regressions Test für DM Cockpit Version 0 Punkt 5 Punkt 0.`
- Confidence: **0.961**
- Satz im Foundry-Live-Transkript sichtbar

Candidate-Smoke-Test:

- `npcCandidates`: 0 → 1
- `sessionEventCandidates`: 0 → 1
- Protocol v1, Broadcast und SQLite-Persistenz bestätigt

## Companion 0.6.0 – auf GitHub, lokaler Nutzer-Test ausstehend

Der aktuelle GitHub-Paketstand ist **0.6.0**.

Neu:

- provider-neutraler `AiExtractionService`
- sicherer Default `AI_PROVIDER=none`
- deterministischer `MockAiExtractionProvider` für Tests
- finale `transcript.segment`-Nachrichten werden über den Protocol-v1-Broadcast der Extraktionsschicht zugeführt
- NPC-Kontext wird pro Session aus `npc.context` verfolgt
- strukturierte Ausgabe als `npc.memory.candidate` und `session.event.candidate`
- `sourceSegmentIds` bleiben als Herkunftsnachweis erhalten
- Provider/Modell/Confidence/Status werden am Kandidaten gespeichert
- doppelte Segment-IDs werden unterdrückt
- Partials werden nicht extrahiert
- weiterhin **keine automatischen Actor-Schreibvorgänge**

Der deterministische Test wurde außerhalb des Nutzer-PCs bereits erfolgreich ausgeführt. Der nächste Schritt ist die lokale Regression mit:

```powershell
Ctrl+C
cd $HOME\Desktop\dm-cockpit
git pull
cd companion
npm.cmd install
npm.cmd run check
npm.cmd run test:ai
```

Danach folgt ein lokaler Ende-zu-Ende-Test mit temporärem `AI_PROVIDER=mock`.

## Geplante AI-Pipeline

```text
Discord Voice
→ DAVE / sprechergetrenntes Opus
→ STT
→ final transcript.segment
→ AiExtractionService
→ npc.memory.candidate / session.event.candidate
→ SQLite + WebSocket
→ später Foundry Candidate UI
```

Zunächst nur strukturierte Vorschläge. Automatische Actor-Änderungen bleiben gesperrt, bis Undo/Change-Record sicher funktioniert.

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

Der aktuelle Checkpoint ist **Schema 3.3**.

## Installation / Updates

Manifest:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Foundry-Installationspaket:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Der Companion liegt separat unter `companion/` und ist nicht Bestandteil des Foundry-ZIPs.
