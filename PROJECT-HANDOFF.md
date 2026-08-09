# DM Cockpit – Master Handoff

Stand: 2026-08-09 22:26 CEST

Dieses Dokument ist der menschlich/LLM-lesbare Einstiegspunkt. Für den neuesten maschinenlesbaren Status zusätzlich immer `PROJECT-CHECKPOINT.json` lesen. GitHub `main` ist technische Source of Truth.

## 1. Repository / Versionen

- Repository: `hacker2090-coder/dm-cockpit`
- Branch: `main`
- lokales Repo des Nutzers: `$HOME\Desktop\dm-cockpit`
- Foundry-Modul-ID: `dm-cockpit`
- Foundry Repository-Version: `0.9.30`
- Companion Repository-Version: `0.14.0`
- Companion WebSocket: `ws://127.0.0.1:43170/v1`
- Health: `http://127.0.0.1:43170/health`
- SQLite: `companion/data/dm-cockpit.sqlite`
- Secrets ausschließlich lokal: `companion/.env`

CI-Validierungsbuild des 0.9.30-Codeblocks:

`90c63fdf1e299d0c5e092507226a7f72b7a98bc1 Build DM Cockpit v0.9.30`

Aktuellster vollständig neu paketierter Main-Stand nach Abschlussdokumentation:

`e4ae4a5534762bbef4fe9e79c05647cc86b647a9 Build DM Cockpit v0.9.30`

Beide Build-Commits wurden durch `github-actions[bot]` erzeugt und ändern ausschließlich `dm-cockpit.zip`.

## 2. Arbeitsregeln

1. Vor Änderungen aktuellen `main` prüfen.
2. GitHub `main` ist technische Source of Truth.
3. Implementiert, automatisiert geprüft, CI-validiert, lokal bestätigt und vollständig bestätigt strikt unterscheiden.
4. Nutzer-Tests bündeln; keine Bestätigung nach Mikroschritten.
5. Nutzer nur für echte lokale/externe Tests, Secrets/Zugänge oder nicht sinnvoll ableitbare Entscheidungen einbeziehen.
6. Wenn Nutzeraktion nötig ist, Abschnitt exakt `Ich möchte von dir` verwenden.
7. Nach sinnvollen Wiederaufnahmepunkten `PROJECT-CHECKPOINT.json` aktualisieren und einen unveränderlichen Snapshot unter `checkpoints/` anlegen.
8. Keine Tokens/API-Keys/Passwörter in Chat, GitHub oder Checkpoints.
9. Roh-Audio nicht dauerhaft speichern.
10. Keine automatische Actor-/Weltänderung ohne Change-Record/Undo oder ausdrückliche GM-Bestätigung.
11. Bereits bestätigte Tests nicht ohne konkrete Regression wiederholen.
12. Aufgeschobene UI-/Recap-Tests nicht ungefragt wieder hervorholen.
13. Größere autonome Blöcke auf einem temporären Staging-Branch bündeln; `main` erst nach Review möglichst einmalig aktualisieren.

PowerShell-Regel:

```powershell
cd $HOME\Desktop\dm-cockpit
git pull
cd companion
npm.cmd ...
```

Kein `&&` verlangen.

## 3. Bestätigter Baseline-Kern – nicht ohne Regression wiederholen

Companion 0.10.0 vollständig bestätigt:

- Discord Login / DAVE / GM Follow / Auto-Join
- speaker-getrennte Audioverarbeitung
- Deepgram Nova-3 Deutsch End-to-End
- Ollama/qwen3:4b Adapter, Preflight, E2E und Qualitätsbenchmark
- Candidate Review Persistenz/Reload
- Change-Record/Undo Backend

Foundry 0.9.24 vollständig bestätigt:

- echter Ollama-Kandidat mit Actor-Kontext
- Annehmen/Verwerfen
- NPC-Memory-Übernahme nach GM-Aktion
- persistenter Change-Record
- konfliktgeschütztes Undo auf exakten vorherigen Zustand

0.9.26 UI wurde visuell positiv bestätigt. Andere nicht ausdrücklich bestätigte Interaktionen bleiben davon unberührt.

## 4. Discord-Ausbau – CI-validierte Blöcke

### 0.9.27 / Companion 0.11.0 – Identity Core

Status: **implemented + automated_tested + ci_validated; runtime_not_user_confirmed.**

- Voice-Teilnehmer
- GM-bestätigte Discord-Mitglied → Foundry-Actor-Zuordnung
- weltbezogene Persistenz + Companion-Mirror
- Discord User ID bleibt Sprecher-Source-of-Truth
- bestätigte Charakteridentität in Transkript/KI-Kontext
- KI darf Actor-Zuordnung niemals raten

Validierter Build:

`971662a063fe3bd2b97efd6d0174ec4119c036b2 Build DM Cockpit v0.9.27`

### 0.9.28 / Companion 0.12.0 – Session-/Kampagnen-Identität

Status: **implemented + automated_tested + ci_validated; runtime_not_user_confirmed.**

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

Status: **implemented + automated_tested + ci_validated; runtime_not_user_confirmed.**

- Cockpit-Karte `Discord-Ausgabe`
- nur Textkanäle mit aktuellem `View Channel` + `Send Messages`
- Zielkanal frei auswählbar/wechselbar/entfernbar
- Auswahl pro Guild persistent in SQLite
- erneute Rechte-/Existenzprüfung vor Versand
- automatischer Aufnahme-/Transkriptionshinweis
- erfolgreicher Auto-Hinweis pro Session idempotent
- `capture.status.noticeShown` erst nach erfolgreichem Versand
- bewusster manueller Hinweis möglich
- Recap nach bewusster GM-Aktion direkt an Discord
- kein automatisches Recap-Posting
- `allowedMentions.parse = []`
- Output-Audit speichert Metadaten, nicht Nachrichtentext
- erfolgreiche Request-IDs werden nicht doppelt gesendet

Validierter Build:

`10a8aa21483aed55f187df3839aefc5d27bda14f Build DM Cockpit v0.9.29`

### 0.9.30 / Companion 0.14.0 – Session Control / Commands / Presence / Diagnostics / Reconnect

Status: **implemented + automated_tested + ci_validated; local_confirmed = false; fully_confirmed = false.**

Implementiert:

- Discord-Voice-Join startet keine logische DM-Cockpit-Session mehr automatisch
- eigene idempotente `SessionControl`-State-Machine
- Start nur bei Voice-ready
- doppelter Start erzeugt keine zweite Session
- doppelter Stop ist ungefährlich
- Voice-Verlust pausiert Capture, beendet aber nicht die logische Session
- Voice-Reconnect behält dieselbe `sessionId`
- Audio-Receiver nur bei aktiver Session + Voice-ready
- späte STT-Ergebnisse einer beendeten/ersetzten Session werden verworfen
- kurzlebige Audiosegment-Deduplizierung vor STT
- `/dm status`
- `/dm start`
- `/dm stop`
- `/dm recap`
- Slash Commands auf die konfigurierte GM-Discord-User-ID begrenzt
- Foundry-Start/Stop ebenfalls GM-guarded
- Bot Presence für bereit / Voice bereit / Session aktiv / pausiert / Diagnose
- `diagnostic.state` für Gateway-/Voice-/Output-/Command-Zustände
- Voice-Reconnect mit begrenztem Backoff
- absichtliches Voice-Verlassen deaktiviert Reconnect vor `connection.destroy()`
- Foundry `discord-command-bridge.js` ist im Modulmanifest geladen
- `/dm recap` verwendet ausschließlich den vorhandenen bestätigten Recap-/Discord-Ausgabepfad
- Companion/Server/Publisher und Protocol-Dokumentation auf 0.14.0 konsistent

Automatisiert im Main-Workflow erfolgreich:

- Foundry-/Companion-JavaScript-Syntax
- Protocol-/Scope-JSON
- Identity-Mapping-Smoke
- Identity-Profile-Smoke
- Discord-Output-Smoke
- Session-Control-Smoke
- Discord-Command-Smoke inklusive Guild-Registrierung, GM-Guard, Presence, Listener-Cleanup
- Voice-Reconnect-Smoke: intentional leave ohne Retry / unerwartetes Destroyed mit Reconnect
- Foundry-Paketbuild 0.9.30

## 5. CI-/Packaging-Status

Release-Workflow `.github/workflows/release.yml`:

- `concurrency` + `cancel-in-progress`
- installiert Companion-Abhängigkeiten vor Companion-Smoke-Tests
- validiert Manifest-referenzierte Foundry-Quellen
- validiert alle Companion-JavaScript-Dateien
- validiert Protocol-/Scope-JSON
- führt Identity-, Identity-Profile-, Discord-Output-, Session-Control-, Discord-Command- und Voice-Reconnect-Smokes aus
- Foundry-ZIP nur bei Foundry-relevanten Änderungen bzw. manuellem Workflow
- Companion-/Protocol-/Scope-only Änderungen erzeugen kein unnötiges ZIP
- Publish-Commit durch `github-actions[bot]`

0.9.30 ist auf Implementierungs-/Automatisierungs-/CI-/Packaging-Ebene abgeschlossen.

## 6. Nächste echte Grenze: gebündelter Runtime-Test

Kein weiterer Mikrotest ist nötig. Der nächste sinnvolle Nachweis ist ein gebündelter echter Discord-/Foundry-Test mit dem Nutzer.

Der Block sollte möglichst in einem Durchlauf prüfen:

1. Companion + Foundry auf aktuellem `main` starten.
2. echte Discord-Kanalliste im Cockpit sehen.
3. Zielkanal wählen und Persistenz prüfen.
4. GM im Discord-Voice-Call; Bot folgt wie bereits bestätigt.
5. `/dm status` vor Sessionstart.
6. `/dm start` und genau eine neue logische Session.
7. genau einen automatischen Aufnahme-/Transkriptionshinweis im Zielkanal.
8. gesprochenes Testsegment erscheint genau einmal im Transkript.
9. echten Voice-Verbindungsabbruch/Reconnect provozieren.
10. nach Reconnect dieselbe `sessionId` und keine zweite Session.
11. kein zweiter automatischer Aufnahmehinweis.
12. kein doppeltes Transkriptsegment.
13. Presence-/Statuswechsel plausibel.
14. `/dm recap` über vorhandenen bestätigten Recap-Pfad.
15. `/dm stop` und Session endet genau einmal.
16. falls praktikabel: gelöschter Zielkanal oder fehlende Senderechte als Fehlerfall.

Dieser Test darf frühere bestätigte Baseline-Funktionen nicht unnötig neu aufrollen.

## 7. Auf später verschoben

Nicht Teil des aktuellen 0.9.30-Blocks:

- mehrere GMs
- allgemeines rollenbasiertes Befehlsberechtigungs-Framework

Der aktuelle konfigurierte-GM-Guard ist absichtlich die V1-Lösung und kein Ersatz für den späteren Berechtigungs-Scope.

## 8. Status-Semantik

- `implemented`: Code vorhanden und integriert.
- `automated_tested`: relevante isolierte/syntaktische Tests erfolgreich.
- `ci_validated`: Main-Workflow bzw. kontrollierter Paketlauf erfolgreich.
- `local_confirmed`: reale lokale/Discord-/Foundry-Ausführung durch Nutzer bestätigt.
- `fully_confirmed`: vorgesehener realer End-to-End-Nachweis abgeschlossen.

Für 0.9.27–0.9.30 gilt derzeit: **implemented + automated_tested + ci_validated, aber nicht local_confirmed / fully_confirmed.**

## 9. Wichtige Dateien

- `PROJECT-CHECKPOINT.json`
- `PROJECT-HANDOFF.md`
- `README.md`
- `checkpoints/`
- `docs/DISCORD-BOT-EXPANSION-SCOPE-V1.json`
- `docs/DISCORD-AUDIO-AI-CONTRACT-V1.md`
- `schemas/discord-audio-ai-v1.schema.json`
- `module.json`
- `.github/workflows/release.yml`
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
- `companion/src/session-control-smoke-test.js`
- `companion/src/discord-command-controller-smoke-test.js`
- `companion/src/discord-voice-reconnect-smoke-test.js`

## 10. Handoff-Regel

Ein neuer Chat prüft zuerst den aktuellen GitHub-Stand und liest `README.md`, `PROJECT-HANDOFF.md`, `PROJECT-CHECKPOINT.json`, `docs/DISCORD-BOT-EXPANSION-SCOPE-V1.json` und `.github/workflows/release.yml`. Bei Widerspruch gewinnt der reale Code auf `main`; danach Dokumentation/Checkpoint korrigieren. Bestätigte alte Arbeit nicht erneut aufrollen.
