# DM Cockpit – Master Handoff

Stand: 2026-08-09 20:20 CEST

Dieses Dokument ist der menschlich/LLM-lesbare Einstiegspunkt. Für den neuesten maschinenlesbaren Status zusätzlich immer `PROJECT-CHECKPOINT.json` lesen. GitHub `main` ist Source of Truth.

## 1. Repository / Versionen

- Repository: `hacker2090-coder/dm-cockpit`
- Branch: `main`
- lokales Repo: `$HOME\Desktop\dm-cockpit`
- Foundry-Modul-ID: `dm-cockpit`
- Foundry Repository-Version: `0.9.29`
- Companion Repository-Version: `0.13.0`
- Companion WebSocket: `ws://127.0.0.1:43170/v1`
- Health: `http://127.0.0.1:43170/health`
- SQLite: `companion/data/dm-cockpit.sqlite`
- Secrets ausschließlich lokal: `companion/.env`

Letzter CI-validierter Paketbuild:

`10a8aa21483aed55f187df3839aefc5d27bda14f Build DM Cockpit v0.9.29`

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

## 3. Bestätigter Baseline-Kern – nicht wiederholen ohne Regression

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

## 4. Discord Identity Core – 0.9.27 / Companion 0.11.0

Status: **implementiert + automatisiert geprüft + CI-validiert; echter Discord-/Foundry-Runtime-Test noch offen.**

Validierter Build:

`971662a063fe3bd2b97efd6d0174ec4119c036b2 Build DM Cockpit v0.9.27`

Kern:

- Voice-Teilnehmer des relevanten Discord-Calls
- Cockpit-Karte `Spieler & Charaktere`
- ausschließlich GM-bestätigte Discord-Mitglied → Foundry-Actor-Zuordnung
- weltbezogene Persistenz + Companion-SQLite-Mirror
- Discord User ID bleibt Source of Truth der sprechenden Person
- bestätigte Charakteridentität wird in Transkript und KI-Kontext ergänzt
- KI darf Actor-ID oder Zuordnung niemals raten

## 5. Session-/Kampagnen-Identität – 0.9.28 / Companion 0.12.0

Status: **implementiert + automatisiert geprüft + CI-validiert; echter Discord-/Foundry-Runtime-Test noch offen.**

Validierter Build:

`5bc18698a0dad8bfd2bb1a914313888d9e000a20 Build DM Cockpit v0.9.28`

Kern:

- persistente Kampagnen-/One-Shot-/Sessionprofile
- höchstens ein aktives Identitätsprofil
- Nickname-Automatik nur nach ausdrücklicher Profilaktivierung
- serverbezogener Nickname `Charakter | Spieler`, maximal 32 Unicode-Zeichen
- Original-Nickname vor Mutation persistent sichern
- Join/Rejoin Apply
- Leave/Profilewechsel/Deaktivierung/Shutdown Restore
- Restart-/Crash-Recovery
- Restore-Konfliktschutz bei externer manueller Namensänderung
- `Manage Nicknames` und Rollen-Hierarchie werden geprüft
- globaler Discord-Benutzername wird niemals verändert

## 6. Discord-Ausgabe – 0.9.29 / Companion 0.13.0

Status: **implementiert + automatisiert geprüft + CI-validiert; echter Discord-/Foundry-Runtime-Test noch offen.**

Validierter Build:

`10a8aa21483aed55f187df3839aefc5d27bda14f Build DM Cockpit v0.9.29`

Implementiert:

- Cockpit-Karte `Discord-Ausgabe`
- nur Discord-Textkanäle mit aktuellem `View Channel` + `Send Messages`
- Zielkanal frei auswählbar/wechselbar/entfernbar
- Auswahl pro Guild persistent in SQLite
- erneute Rechte-/Existenzprüfung vor Versand
- automatischer Aufnahme-/Transkriptionshinweis beim Sessionstart
- erfolgreicher Auto-Hinweis pro Session idempotent gegen Retry/Reconnect
- `capture.status.noticeShown` erst nach erfolgreichem Versand
- bewusster manueller Hinweis möglich
- bestehender Session-Recap kann nach bewusster GM-Aktion direkt an Discord gesendet werden
- kein automatisches Recap-Posting
- `allowedMentions.parse = []`
- Output-Audit speichert Metadaten, nicht den Nachrichtentext
- erfolgreiche Request-IDs werden nicht doppelt gesendet

Automatisiert geprüft:

- Foundry-/Companion-JavaScript-Syntax
- Protocol-/Scope-JSON
- Identity-Mapping-Smoke
- Identity-Profile-Smoke
- Discord-Output-Smoke: Kanalliste, Persistenz, Recap, Request-Idempotenz, Aufnahmehinweis, Reload, Clear
- sauberer Foundry-Paketbuild 0.9.29

CI-Fehler und Fix vom 2026-08-09:

- Der neue `discord-output-smoke-test.js` importiert `discord.js`.
- Der Release-Workflow installierte in einem frischen GitHub-Actions-Checkout vorher keine Companion-Abhängigkeiten.
- Dadurch konnte der neue Smoke-Test im Main-Workflow nicht korrekt ausgeführt werden und `dm-cockpit.zip` blieb auf dem Blob des 0.9.28-Builds.
- Fix: Release-Workflow installiert Companion-Abhängigkeiten vor der Companion-/Protocol-Validierung.
- Kontrollierter README-Trigger führte danach erfolgreich zu `Build DM Cockpit v0.9.29`.

Noch real gebündelt zu prüfen:

- echte Discord-Kanalliste in Foundry
- Zielkanal wählen/wechseln und Persistenz
- realer Aufnahmehinweis
- realer bewusster Recap-Versand
- gelöschter Kanal / verlorene Senderechte
- kein doppelter Hinweis bei realem Reconnect

## 7. CI-/Packaging-Status

Release-Workflow `.github/workflows/release.yml`:

- `concurrency` + `cancel-in-progress`
- installiert Companion-Abhängigkeiten vor den Companion-Smoke-Tests
- validiert Foundry-Runtime-Quellen
- validiert Companion-JavaScript sowie Protocol-/Scope-JSON
- führt Identity-, Identity-Profile- und Discord-Output-Smoke-Tests aus
- Foundry-ZIP nur bei Foundry-relevanten Änderungen bzw. manuellem Workflow
- Companion-/Protocol-/Scope-only Änderungen erzeugen kein unnötiges ZIP
- Publish-Commit wird durch `github-actions[bot]` erzeugt

0.9.29 ist auf CI-/Packaging-Ebene abgeschlossen.

## 8. Aktueller Discord-Bot-Scope

Verbindlich:

`docs/DISCORD-BOT-EXPANSION-SCOPE-V1.json`

Abgeschlossen auf Implementierungs-/CI-Ebene:

1. `0.9.27 / 0.11.0` – Spieler ↔ Charakter ↔ Sprecheridentität
2. `0.9.28 / 0.12.0` – Session-/Kampagnenprofile + reversible Server-Nicknames
3. `0.9.29 / 0.13.0` – Discord-Ausgabekanal + Aufnahmehinweis + bewusstes Recap-Posting

Nächster autonomer Block:

`session_control_commands_presence_diagnostics_reconnect`

Geplanter Scope:

- manuelle Session-Steuerung getrennt vom bloßen Voice-Join
- `/dm status`
- `/dm start`
- `/dm stop`
- `/dm recap`
- sichtbarer Bot-Presence-/Sessionstatus
- verständliche Diagnose- und Fehlerzustände
- robuster Voice-Reconnect
- Wiederherstellung des Sessionzustands nach Reconnect
- keine doppelten Sessions
- keine doppelten Aufnahmehinweise
- keine doppelten Transkriptsegmente durch Reconnect

Auf später verschoben:

- mehrere GMs
- eigenes Befehlsberechtigungsmodell

## 9. Status-Semantik

- `implementiert`: Code vorhanden und integriert.
- `automatisiert geprüft`: relevante isolierte/syntaktische Tests erfolgreich.
- `CI-validiert`: Main-Workflow bzw. kontrollierter Paketlauf erfolgreich.
- `lokal bestätigt`: reale lokale/Discord-/Foundry-Ausführung durch Nutzer bestätigt.
- `vollständig bestätigt`: der für den Block vorgesehene reale End-to-End-Nachweis ist abgeschlossen.

Für 0.9.27–0.9.29 gilt derzeit: **CI-validiert, aber nicht lokal/vollständig bestätigt.**

## 10. Wichtige Dateien

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
- `companion/src/main.js`
- `companion/src/server.js`
- `companion/src/discord-voice.js`
- `companion/src/player-character-identity.js`
- `companion/src/identity-profile-store.js`
- `companion/src/discord-nickname-manager.js`
- `companion/src/discord-output-store.js`
- `companion/src/discord-output-controller.js`
- `companion/src/discord-output-smoke-test.js`

## 11. Handoff-Regel

Ein neuer Chat prüft zuerst den aktuellen GitHub-Stand und liest `README.md`, `PROJECT-HANDOFF.md`, `PROJECT-CHECKPOINT.json`, `docs/DISCORD-BOT-EXPANSION-SCOPE-V1.json` und `.github/workflows/release.yml`. Bei Widerspruch gewinnt der reale Code auf `main`; danach Dokumentation/Checkpoint korrigieren. Chronologisch beim aktuellen Discord-Bot-Block fortsetzen und bestätigte alte Arbeit nicht erneut aufrollen.
