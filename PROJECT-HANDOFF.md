# DM Cockpit – Master Handoff

Stand: 2026-08-10 18:06 CEST

Dieses Dokument ist der menschlich/LLM-lesbare Einstiegspunkt. Für den neuesten maschinenlesbaren Status immer zuerst `PROJECT-CHECKPOINT.json` lesen. GitHub `main` ist technische Source of Truth.

## 1. Aktueller Repository-Stand

- Repository: `hacker2090-coder/dm-cockpit`
- Branch: `main`
- Foundry-Modul-ID: `dm-cockpit`
- Foundry Repository-Version: `0.9.30`
- Companion Repository-Version: `0.14.0`
- Companion WebSocket: `ws://127.0.0.1:43170/v1`
- Health: `http://127.0.0.1:43170/health`
- SQLite: `companion/data/dm-cockpit.sqlite`
- Secrets ausschließlich lokal: `companion/.env`

CI-Validierungsbuild des 0.9.30-Codeblocks:

`90c63fdf1e299d0c5e092507226a7f72b7a98bc1 Build DM Cockpit v0.9.30`

Letzter vollständig neu paketierter 0.9.30-Stand vor dem Repository-Wartungsblock:

`e4ae4a5534762bbef4fe9e79c05647cc86b647a9 Build DM Cockpit v0.9.30`

## 2. Arbeitsregeln

1. Vor Änderungen aktuellen `main` prüfen.
2. GitHub `main` ist technische Source of Truth.
3. `implemented`, `automated_tested`, `ci_validated`, `local_confirmed` und `fully_confirmed` strikt trennen.
4. Nutzer-Tests bündeln; keine Bestätigung nach Mikroschritten.
5. Nutzer nur für echte lokale/externe Tests, Secrets/Zugänge oder nicht sinnvoll ableitbare Entscheidungen einbeziehen.
6. Wenn Nutzeraktion nötig ist, Abschnitt exakt `Ich möchte von dir` verwenden und nur eine nötige Aktion auf einmal verlangen.
7. Nach sinnvollen Wiederaufnahmepunkten `PROJECT-CHECKPOINT.json` aktualisieren und einen unveränderlichen Snapshot unter `checkpoints/` anlegen.
8. Keine Tokens/API-Keys/Passwörter in Chat, GitHub oder Checkpoints.
9. Roh-Audio nicht dauerhaft speichern.
10. Keine automatische Actor-/Weltänderung ohne Change-Record/Undo oder ausdrückliche GM-Bestätigung.
11. Bereits bestätigte Tests nicht ohne konkrete Regression wiederholen.
12. 0.9.25 Recap-Inhalts-/Copy-Test und 0.9.26 Drag/Persistenz/Resize/Filter-Smoke nicht ungefragt wieder hervorholen.
13. Größere autonome Blöcke auf einem temporären Staging-Branch bündeln; `main` nach Review möglichst per Fast-Forward aktualisieren.
14. PowerShell-Befehle getrennt angeben; `npm.cmd` verwenden; kein `&&`.

## 3. Vollständig bestätigte Baseline

### Companion 0.10.0

- Discord Login / DAVE / GM Follow
- speaker-getrennte Audioverarbeitung
- Deepgram Nova-3 Deutsch End-to-End
- Ollama/qwen3:4b Adapter, Preflight, E2E und Qualitätsbenchmark
- Candidate Review Persistenz/Reload
- Change-Record/Undo Backend

### Foundry 0.9.24

- LIVE-Dashboard und Kernwerkzeuge
- echter Ollama-Kandidat mit Actor-Kontext
- Annehmen/Verwerfen
- NPC-Memory-Übernahme nach GM-Aktion
- persistenter Change-Record
- konfliktgeschütztes Undo auf exakten vorherigen Zustand

### Foundry 0.9.26

UI visuell positiv bestätigt. Nicht ausdrücklich getestete Drag-/Persistenz-/Resize-/Filter-Interaktionen gelten dadurch nicht automatisch als vollständig bestätigt.

## 4. Discord-Ausbau – Implementierungsstatus

### 0.9.27 / Companion 0.11.0 – Identity Core

Status: **implemented + automated_tested + ci_validated.** Der vollständige eigene Identity-Runtime-Block ist nicht separat abgeschlossen.

- Voice-Teilnehmer
- GM-bestätigte Discord-Mitglied → Foundry-Actor-Zuordnung
- weltbezogene Persistenz + Companion-Mirror
- Discord User ID bleibt Sprecher-Source-of-Truth
- bestätigte Charakteridentität in Transkript/KI-Kontext
- KI darf Actor-Zuordnung niemals raten

Validierter Build:

`971662a063fe3bd2b97efd6d0174ec4119c036b2 Build DM Cockpit v0.9.27`

### 0.9.28 / Companion 0.12.0 – Session-/Kampagnen-Identität

Status: **implemented + automated_tested + ci_validated.** Der vollständige eigene Nickname-/Identity-Runtime-Block ist nicht separat abgeschlossen.

- persistente Kampagnen-/One-Shot-/Sessionprofile
- höchstens ein aktives Identitätsprofil
- Nickname-Automatik nur nach ausdrücklicher Profilaktivierung
- serverbezogener Nickname `Charakter | Spieler`
- Original-Nickname vor Mutation persistent sichern
- Join/Rejoin Apply
- Leave/Profilewechsel/Deaktivierung/Shutdown Restore
- Restart-/Crash-Recovery
- Restore-Konfliktschutz
- `Manage Nicknames` und Rollen-Hierarchie
- globaler Discord-Benutzername wird niemals verändert

Validierter Build:

`5bc18698a0dad8bfd2bb1a914313888d9e000a20 Build DM Cockpit v0.9.28`

### 0.9.29 / Companion 0.13.0 – Discord-Ausgabe

Status: **implemented + automated_tested + ci_validated + teilweise real bestätigt.**

Real bestätigt:

- echter Zielkanal wurde im Cockpit ausgewählt/übernommen
- `/dm start` erzeugte genau einen automatischen Transkriptionshinweis
- nach echtem Voice-Reconnect blieb es bei genau einem Hinweis

Noch offen:

- Zielkanal-Persistenz über Neustart/Reload
- bewusstes Recap-Posting
- gelöschter Kanal / verlorene Senderechte

Validierter Build:

`10a8aa21483aed55f187df3839aefc5d27bda14f Build DM Cockpit v0.9.29`

### 0.9.30 / Companion 0.14.0 – Session Control / Commands / Presence / Diagnostics / Reconnect

Status: **implemented + automated_tested + ci_validated + teilweise local_confirmed; fully_confirmed = false.**

Implementiert:

- Discord-Voice-Join startet keine logische DM-Cockpit-Session
- idempotente `SessionControl`-State-Machine
- `/dm status`, `/dm start`, `/dm stop`, `/dm recap`
- Commands und Foundry-Session-Control auf konfigurierte GM-Discord-User-ID/GM begrenzt
- Presence für bereit / Voice bereit / Session aktiv / pausiert / Diagnose
- `diagnostic.state`
- Voice-Reconnect mit begrenztem Backoff
- gleiche `sessionId` über Voice-Reconnect
- absichtliches Leave verhindert unerwünschten Reconnect
- Audio-Receiver nur bei aktiver Session + Voice-ready
- späte STT-Ergebnisse verworfen
- kurzlebige Audiosegment-Deduplizierung

Real bereits bestätigt:

- Companion 0.14.0 startet, Deepgram und Discord Gateway bereit
- Foundry 0.9.30 lädt ohne sichtbaren Fehler
- Voice-Join startet keine Session automatisch
- `/dm start` funktioniert
- Session-ID `voice_da888149-64c2-4194-bbde-176b59793bf6`
- genau ein automatischer Aufnahme-/Transkriptionshinweis
- echtes Sprachsegment erscheint in Foundry
- manueller Bot-Disconnect → automatischer Voice-Reconnect
- dieselbe Session-ID bleibt nach Reconnect aktiv
- `/dm status` danach: Session aktiv, Capture aktiv, Gateway ready, Voice ready, Reconnect bereit, Ausgabekanal `#test-channel`
- weiterhin nur ein Aufnahmehinweis
- zweiter Testsatz nach Reconnect erscheint genau einmal

Beobachtung:

`[discord-voice] Capture-Status: paused` kann nach Voice-Ready im Companion-Log stehen. Das ist bisher kein bestätigter Funktionsfehler, weil `/dm status` `Capture: aktiv` meldete und STT nach Reconnect real weiterlief.

## 5. Exakter Fortsetzungspunkt des Runtime-Tests

Nicht wiederholen:

- Reconnect-Grundfunktion
- gleiche Session-ID über Reconnect
- einmaliger Aufnahmehinweis
- STT vor und nach Reconnect

Als Nächstes:

1. `/dm recap`
2. `/dm stop`
3. zweites `/dm stop` für Idempotenz
4. Presence-/Diagnosezustände abschließend beobachten
5. Ausgabekanal-Persistenz über Neustart
6. gelöschter/unbeschreibbarer Zielkanal, falls praktikabel
7. abschließender E2E-Abschluss

Wenn Programme geschlossen wurden, nur minimale Voraussetzungen neu starten. Bereits bestandene Reconnect-/STT-Schritte nicht ohne konkreten Regressionshinweis erneut durchführen.

## 6. Repository-Audit vom 2026-08-10

Der Audit hat bewusst **keinen Runtime-Code geändert**.

Neu:

- `docs/NEXT-IMPLEMENTATION-BACKLOG-V1.json`
- `tools/repository-consistency-check.mjs`
- Release-Workflow prüft zusätzlich Repository-/Checkpoint-/Scope-Konsistenz
- `docs/UI-REDESIGN-SCOPE-V1.json` wurde korrigiert: die frühere Source-of-Truth-Blockade ist erledigt
- historischer Audit-Snapshot: `checkpoints/2026-08-10T18-06-repository-audit-next-backlog.json`

Die zentralen Foundry-Quellen `scripts/dm-cockpit.js`, `styles/dm-cockpit.css` und `templates/cockpit.hbs` liegen normal versioniert auf `main`. Der Release-Workflow baut das Paket aus einem frischen Build-Verzeichnis.

Der statische Template-Fallback `V0.9.9` ist kosmetisch veraltet. `scripts/module-version-badge.js` setzt zur Laufzeit die echte Manifestversion; deshalb ist dies kein bestätigter Runtime-Blocker.

## 7. Was noch nicht im aktiven Produktkern ist

Verbindlicher maschinenlesbarer Überblick: `docs/NEXT-IMPLEMENTATION-BACKLOG-V1.json`.

Empfohlene Reihenfolge **erst nach Abschluss des aktuellen 0.9.30-Runtime-Bundles**:

### Kandidat 0.9.31 – Flowchart-Verbindungen und Knotenstatus

Im aktiven `scripts/dm-cockpit.js` werden `edges` derzeit nur zur Datenkompatibilität erhalten. Verbindungen werden nicht angezeigt oder bearbeitet. Das ist der beste nächste Produktblock, weil er direkt einen bestehenden Kernbereich erweitert.

### Kandidat 0.9.32 – Trigger-System V1

Das Trigger-System gehört weiterhin zum deaktivierten Legacy-Bestand und ist nicht Teil des aktiven Grundkerns.

### Kandidat 0.9.33 – DM-Szeneninfos + Szenensteuerung/-Synchronisation

Frühere DM-Szeneninfos und Foundry-Szenensteuerung/-Synchronisation sind im aktiven Grundkern nicht enthalten.

Ausdrücklich weiter auf später verschoben:

- mehrere GMs
- allgemeines rollenbasiertes Befehlsberechtigungs-Framework
- UI-Fokusmodus
- weiterer Scroll-Umbau

## 8. Repository-Konsistenzcheck

`tools/repository-consistency-check.mjs` prüft unter anderem:

- `module.json` / Companion-Version gegen `PROJECT-CHECKPOINT.json`
- README-Hauptversion gegen `module.json`
- vorhandene Manifest-/Runtime-Quellen
- Repository-/Branch-Angaben des Discord-Scope
- erledigte UI-Source-of-Truth-Blockade

Ein veralteter statischer Template-Badge-Fallback wird nur als Warnung gemeldet, weil die reale Versionsanzeige zur Laufzeit dynamisch aus `module.json` gesetzt wird.

## 9. CI / Packaging

Release-Workflow `.github/workflows/release.yml`:

- `concurrency` + `cancel-in-progress`
- prüft versionierte Runtime-Quellen
- prüft Repository-/Checkpoint-/Scope-Konsistenz
- installiert Companion-Abhängigkeiten
- validiert Protocol-/Scope-JSON
- validiert Foundry-/Companion-JavaScript
- führt Identity-, Identity-Profile-, Discord-Output-, Session-Control-, Discord-Command- und Voice-Reconnect-Smokes aus
- baut Foundry-ZIP nur bei Foundry-relevanten Änderungen bzw. manuellem Workflow
- Publish-Commit durch `github-actions[bot]`

## 10. Wichtige Dateien

- `PROJECT-CHECKPOINT.json`
- `PROJECT-HANDOFF.md`
- `README.md`
- `checkpoints/`
- `docs/NEXT-IMPLEMENTATION-BACKLOG-V1.json`
- `docs/DISCORD-BOT-EXPANSION-SCOPE-V1.json`
- `docs/UI-REDESIGN-SCOPE-V1.json`
- `docs/DISCORD-AUDIO-AI-CONTRACT-V1.md`
- `schemas/discord-audio-ai-v1.schema.json`
- `.github/workflows/release.yml`
- `tools/repository-consistency-check.mjs`
- `module.json`
- `scripts/dm-cockpit.js`
- `scripts/live-transcript.js`
- `scripts/player-character-mapping.js`
- `scripts/session-identity-profile.js`
- `scripts/discord-output.js`
- `scripts/discord-command-bridge.js`
- `companion/src/main.js`
- `companion/src/server.js`
- `companion/src/discord-voice.js`
- `companion/src/session-control.js`
- `companion/src/discord-command-controller.js`
- `companion/src/discord-output-controller.js`

## 11. Handoff-Regel

Ein neuer Chat prüft zuerst aktuellen GitHub-`main` und liest `PROJECT-CHECKPOINT.json`, `PROJECT-HANDOFF.md`, `README.md`, `docs/NEXT-IMPLEMENTATION-BACKLOG-V1.json`, die relevanten Scope-Dateien und `.github/workflows/release.yml`. Bei Widerspruch gewinnt der reale Code auf `main`; danach Dokumentation/Checkpoint korrigieren. Bestätigte alte Arbeit nicht erneut aufrollen.
