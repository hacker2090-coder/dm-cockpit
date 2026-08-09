# DM Cockpit – Master Handoff

Stand: 2026-08-09 17:17 CEST

Dieses Dokument ist der menschlich/LLM-lesbare Einstiegspunkt für einen neuen Chat. Für den jeweils neuesten maschinenlesbaren Status zusätzlich immer `PROJECT-CHECKPOINT.json` lesen. GitHub `main` ist Source of Truth.

## 1. Projektziel

DM Cockpit ist ein Foundry-VTT-V14-Modul plus lokaler Companion Service. Ziel ist ein zentrales GM-Live-Cockpit, das Session-Arbeit bündelt und Kontextwechsel zwischen Foundry, Discord und Notizen reduziert.

Produktprinzipien:

- wichtige Live-Aktionen priorisieren;
- seltene Funktionen kompakt/einklappbar halten;
- KI erzeugt Vorschläge, keine stillen Weltänderungen;
- Actor-/Weltänderungen nur mit expliziter GM-Aktion oder sicherem Change-Record/Undo;
- keine Secrets in Chat/GitHub/Checkpoints;
- kein dauerhaftes Roh-Audio.

## 2. Repository / Versionen

- Repository: `hacker2090-coder/dm-cockpit`
- Branch: `main`
- lokales Repo: `$HOME\Desktop\dm-cockpit`
- Foundry-Modul-ID: `dm-cockpit`
- Foundry Repository-Version: `0.9.26`
- Companion Repository-Version: `0.10.0`
- Companion WebSocket: `ws://127.0.0.1:43170/v1`
- Health: `http://127.0.0.1:43170/health`
- SQLite: `companion/data/dm-cockpit.sqlite`
- lokale Secrets: `companion/.env`, gitignored

PowerShell-Regel:

```powershell
cd $HOME\Desktop\dm-cockpit
git pull
cd companion
npm.cmd ...
```

`npm.cmd` verwenden, nicht `npm`.

## 3. Arbeitsregeln

1. Vor Änderungen aktuellen `main` prüfen.
2. GitHub `main` ist technische Source of Truth.
3. Implementiert, statisch getestet, lokal bestätigt und vollständig bestätigt strikt unterscheiden.
4. Nutzer nicht nach jedem Mikroschritt bestätigen lassen; zusammengehörige Tests bündeln.
5. Nutzer nur für echte lokale/externe Tests, Secrets/Zugänge oder nicht ableitbare Entscheidungen einbeziehen.
6. Wenn Nutzeraktion nötig ist, Abschnitt exakt `Ich möchte von dir` verwenden.
7. Regelmäßig `PROJECT-CHECKPOINT.json` + historischen Snapshot unter `checkpoints/` aktualisieren; regulären Checkpoint zusätzlich in ChatGPT Library `/DM Cockpit/` sichern.
8. Keine Tokens/API-Keys/Passwörter in Chat, GitHub oder Checkpoints.
9. Roh-Audio nicht dauerhaft speichern.
10. Keine automatische Actor-/Weltänderung ohne Change-Record/Undo oder ausdrückliche GM-Bestätigung.
11. Bekannte bestätigte Tests nicht ohne Regression wiederholen.
12. UI-/Auswahlfragen bei Bedarf als bearbeitbare HTML-Checkliste mit kopierbarer Zusammenfassung anbieten.

## 4. Architektur

### Foundry

Foundry ist UI und Weltzustand. Aktueller Funktionskern:

- LIVE-Dashboard
- Abenteuer-Flowchart
- spontane Szenen
- Szenen-Presets
- Gegner-Spawnpunkte
- Enemy Reserve Bench
- Handout Queue
- Loot-/Belohnungspakete
- Item-Suche
- Compendium-Schnellsuche
- NPC-Schnellgenerator
- Actor-basiertes NPC Memory
- Discord Live-Transkript
- NPC-Kontext aus Cockpit-Actor oder ausgewähltem Token
- manuelle KI-Kandidatenprüfung
- konfliktgeschütztes NPC-Memory-Undo
- Session-Recap + Discord-Kurzfassung
- technisches UI-/Layout-System 0.9.26

NPC-Memory-Flag:

`flags['dm-cockpit'].actionMemory`

NPC-Schnellprofil:

`flags['dm-cockpit'].quickNpc`

### Companion

Der Companion übernimmt:

- Discord Gateway/Voice
- DAVE/E2EE
- GM-Follow/Auto-Join
- sprechergetrennten Audioempfang
- temporäre Audio-Pufferung
- Deepgram STT
- provider-neutrale KI-Extraktion
- SQLite-Persistenz
- Protocol-v1-WebSocket
- Candidate Review Persistenz
- Change-Record/Undo Backend

### KI / STT

Real bestätigt:

- STT: Deepgram Nova-3, Deutsch, EU
- lokale KI: Ollama `qwen3:4b`
- Qualitätsbenchmark: 11/12 = 91,7 %, Ø 1066 ms, P95 1935 ms
- OpenAI nur optionaler Fallback; kein echter bezahlter OpenAI-Aufruf bestätigt

## 5. Protocol v1

Version `1.0`.

Relevante Nachrichtentypen:

- `hello`, `hello.ack`, `health`
- `session.started`, `session.ended`
- `speaker.upserted`
- `capture.status`
- `transcript.segment`
- `npc.context`
- `npc.memory.candidate`
- `session.event.candidate`
- `candidate.review`, `candidate.reviewed`
- `candidates.list.request`, `candidates.list.result`
- `npc.memory.applied`
- `change.undo.request`, `change.undo.result`
- `error`

Vertrag/Schema:

- `docs/DISCORD-AUDIO-AI-CONTRACT-V1.md`
- `schemas/discord-audio-ai-v1.schema.json`

Actor-ID wird nie vom Modell erfunden. NPC-Kandidaten benötigen gültigen Foundry-`npc.context`.

## 6. SQLite

Wichtige persistente Tabellen:

- `sessions`
- `speakers`
- `transcript_segments`
- `npc_context_events`
- `npc_memory_candidates`
- `session_event_candidates`
- `change_records`

Finale Transkripte/Kandidaten werden persistiert; Roh-Audio nicht dauerhaft.

## 7. Bestätigter Stand

### Companion 0.10.0 – vollständig bestätigt

Nicht erneut testen ohne Regression:

- Discord Login / DAVE / Auto-Join / GM Follow
- speaker-getrennte Audioverarbeitung
- Deepgram-End-to-End
- Ollama Adapter / Preflight / E2E / Qualitätsbenchmark
- Candidate Review Persistenz/Reload
- Change-Record/Undo Backend (`npm.cmd run check`, `npm.cmd run test:change-record`)

### Foundry 0.9.24 – NPC-Memory Undo vollständig bestätigt

Real bestätigt:

- echter Ollama-Kandidat mit echtem Actor-Kontext
- Annehmen/Verwerfen
- angenommen → bestehendes NPC Memory
- Change-Record wird erzeugt
- `Rückgängig` stellt exakten vorherigen `actionMemory`-Zustand wieder her
- keine automatische Übernahme ohne GM-Aktion

### Foundry 0.9.25 – Session-Recap implementiert, Inhaltstest aufgeschoben

Implementiert:

- Recap nur aus angenommenen `session.event.candidate`
- Kategorien: Entscheidungen, Quests/Aufgaben, Loot/Belohnungen, Kämpfe, offene Fragen, wichtige Ereignisse
- Discord-Kurzfassung aus denselben bestätigten Punkten
- Recap kopieren / Discord kopieren
- kein automatisches Discord-Posting

Nutzer hat bestätigt, dass die Recap-Karte sichtbar ist. Der eigentliche Test mit angenommenem Session-Kandidaten + beiden Kopierbuttons wurde ausdrücklich auf später verschoben und soll nicht automatisch erneut verlangt werden.

### Foundry 0.9.26 – UI-/Layout-Umbau

Implementiert und sauber gebaut:

- Zonen `Live`, `Spielleitung`, `Werkzeuge`, `Nachbereitung`
- technische moderne Dashboard-Optik
- Live-Funktionen priorisiert
- Haupt-/Seitenspalten und unterschiedlich gewichtete Karten
- kompaktere Karten/Listen und höhere Informationsdichte
- einheitliche Typografie, Abstände, Icons, Buttons, Inputs
- fixe Bereichsnavigation
- persistente Ein-/Ausklappzustände
- persistenter aktiver Tab
- Kartenreihenfolge innerhalb einer Zone per Drag-Handle
- vertikale Kartenhöhe anpassbar/persistiert
- Such-/Filterleiste bei größeren Listen
- Tooltips
- kartenbezogene Working-/Error-Zustände
- Shortcuts `Alt+1`, `Alt+2`, `Alt+Pfeil hoch/runter`
- dezente Animationen mit Reduced-Motion-Fallback

Nutzer-Runtime-Rückmeldung am 2026-08-09 17:17 CEST: **„Sieht super aus.“** Das bestätigt den visuellen UI-/Layout-Eindruck in Foundry. Nicht als vollständige Bestätigung von Drag-Persistenz, Filter, Resize und sämtlichen Interaktionen auslegen, solange diese nicht explizit getestet wurden.

Bewusst zurückgestellt aus der UI-Auswahl:

- Fokusmodus für einzelne Bereiche
- zusätzlicher Scroll-Verhaltens-Umbau

Verbindlicher Scope: `docs/UI-REDESIGN-SCOPE-V1.json`.

## 8. Source-of-Truth / Packaging – bereinigt

Früheres Problem: Release-Workflow entpackte das vorhandene `dm-cockpit.zip` und kopierte Repository-Dateien darüber. Dadurch konnten alte/nicht versionierte Dateien im Paket überleben.

Behoben:

- `scripts/dm-cockpit.js`
- `styles/dm-cockpit.css`
- `templates/cockpit.hbs`

sind wieder normale versionierte Quellen auf `main`.

Aktueller Workflow:

1. Checkout von `main`.
2. Manifest-referenzierte Skripte/Styles müssen existieren.
3. `templates/cockpit.hbs` muss existieren.
4. alle Foundry-JS-Dateien laufen durch `node --check`.
5. Build startet in leerem `build/dm-cockpit`.
6. ZIP wird ausschließlich aus versionierten Quellen neu erstellt.
7. GitHub Actions veröffentlicht das neue `dm-cockpit.zip` auf `main`.

0.9.26 wurde mit diesem sauberen Workflow erfolgreich gebaut. Das alte ZIP ist kein Build-Eingang mehr.

## 9. Aktueller Pausepunkt

Repository ist konsistent auf Foundry `0.9.26` / Companion `0.10.0`.

Bestätigt:

- kompletter historischer Companion-Baseline-Stack bis 0.10.0
- Foundry NPC-Memory/Undo bis 0.9.24
- 0.9.25 Recap-Karte sichtbar
- 0.9.26 neues UI visuell vom Nutzer positiv in Foundry bestätigt
- sauberer, reproduzierbarer Packaging-Workflow

Noch bewusst offen:

- 0.9.25 Recap-Inhalts-/Copy-Test: vom Nutzer auf später verschoben
- 0.9.26 Interaktions-Smoke-Test für Persistenz/Drag/Resize/Filter: nicht vollständig bestätigt
- dauerhaft durchsuchbares Transkript: geplant/offen
- optionale automatische NPC-Memory-Übernahme: offen, nur mit sicherem Undo
- optional lokales STT: offen

## 10. Was ein neuer Chat zuerst tun soll

1. Aktuellen `main` prüfen; nicht von diesem Text allein ausgehen.
2. `README.md`, `PROJECT-HANDOFF.md`, `PROJECT-CHECKPOINT.json` lesen.
3. Bei UI-Arbeit zusätzlich `docs/UI-REDESIGN-SCOPE-V1.json` lesen.
4. Keine alten bestätigten Tests wiederholen.
5. Den aufgeschobenen 0.9.25 Recap-Inhalts-/Copy-Test nicht ungefragt wieder hervorholen.
6. Vor neuer großer UI-/Funktionsänderung gegebenenfalls den kleinen 0.9.26 Interaktions-Smoke-Test bündeln oder bei einem neuen klaren Nutzerauftrag direkt den gewählten nächsten Block bearbeiten.

## 11. Naheliegende nächste offizielle Arbeitsblöcke

Aus der bisherigen Repository-Roadmap:

1. dauerhaft durchsuchbares Transkript
2. optionale automatische NPC-Memory-Übernahme, ausschließlich mit sicherem Undo
3. optional lokales STT
4. Performance-/Skalierungs-Hardening

Session-Recap + Discord-Kurzfassung sind bereits implementiert; nur ihr aufgeschobener Runtime-Inhaltstest ist noch offen.

## 12. Nicht erneut testen ohne Regression

- Discord-Bot-Erstellung
- Secrets/API-Key-Einrichtung
- Companion 0.1–0.10 Baseline
- Deepgram E2E
- Ollama Preflight/E2E/Qualitätsbenchmark
- Candidate Review Smoke
- echter Ollama-NPC-Kandidat
- Foundry Annehmen/Verwerfen
- Annehmen → NPC Memory
- Foundry 0.9.24 NPC-Memory Undo E2E

## 13. Wichtige Dateien

- `PROJECT-CHECKPOINT.json` – kanonischer Maschinenstatus
- `PROJECT-HANDOFF.md` – dieser Master-Handoff
- `README.md` – aktueller Überblick
- `checkpoints/` – historische Snapshots
- `docs/UI-REDESIGN-SCOPE-V1.json` – verbindlicher UI-Scope
- `module.json` – Foundry Manifest
- `.github/workflows/release.yml` – reproduzierbarer Paket-Build
- `scripts/dm-cockpit.js` – Foundry Grundkern
- `scripts/ui-layout.js` – UI-Layout-/Persistenzschicht
- `styles/ui-layout.css` – aktuelles Designsystem
- `scripts/live-transcript.js` – Live-Transkript
- `scripts/ai-candidate-review.js` – Kandidatenreview + Undo
- `scripts/session-recap.js` – Session-Recap + Discord-Kurzfassung
- `scripts/npc-action-memory.js` – NPC Memory
- `companion/src/server.js` – Protocol-v1-Server
- `companion/src/store.js` – SQLite Store
- `companion/src/change-record-runtime.js` – Change-Record/Undo Backend
- `docs/DISCORD-AUDIO-AI-CONTRACT-V1.md` – Protokollvertrag
- `schemas/discord-audio-ai-v1.schema.json` – Protokollschema

## 14. Handoff-Regel

Ein neuer Chat soll nicht aus früherem Chatgedächtnis weiterarbeiten, sondern zuerst den aktuellen GitHub-Stand lesen. Bei Widerspruch gewinnt der reale Code auf `main`; danach Dokumentation/Checkpoint korrigieren. Chronologisch ab dem aktuellen Stand weiterarbeiten und bestätigte Arbeit nicht erneut aufrollen.
