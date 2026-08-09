# DM Cockpit – Master Handoff

Stand: 2026-08-09 19:15 CEST

Dieses Dokument ist der menschlich/LLM-lesbare Einstiegspunkt. Für den neuesten maschinenlesbaren Status zusätzlich immer `PROJECT-CHECKPOINT.json` lesen. GitHub `main` ist Source of Truth.

## 1. Repository / Versionen

- Repository: `hacker2090-coder/dm-cockpit`
- Branch: `main`
- lokales Repo: `$HOME\Desktop\dm-cockpit`
- Foundry-Modul-ID: `dm-cockpit`
- Foundry Repository-Version: `0.9.28`
- Companion Repository-Version: `0.12.0`
- Companion WebSocket: `ws://127.0.0.1:43170/v1`
- Health: `http://127.0.0.1:43170/health`
- SQLite: `companion/data/dm-cockpit.sqlite`
- Secrets ausschließlich lokal: `companion/.env`

Letzter CI-validierter Paketbuild:

`5bc18698a0dad8bfd2bb1a914313888d9e000a20 Build DM Cockpit v0.9.28`

## 2. Arbeitsregeln

1. Vor Änderungen aktuellen `main` prüfen.
2. GitHub `main` ist technische Source of Truth.
3. Implementiert, CI-validiert, lokal bestätigt und vollständig bestätigt strikt unterscheiden.
4. Nutzer-Tests bündeln; keine Bestätigung nach Mikroschritten.
5. Nutzer nur für echte lokale/externe Tests, Secrets/Zugänge oder nicht sinnvoll ableitbare Entscheidungen einbeziehen.
6. Wenn Nutzeraktion nötig ist, Abschnitt exakt `Ich möchte von dir` verwenden.
7. Nach sinnvollen Wiederaufnahmepunkten `PROJECT-CHECKPOINT.json`, historischen Snapshot unter `checkpoints/` und denselben JSON-Stand im Chat erzeugen.
8. Keine Tokens/API-Keys/Passwörter in Chat, GitHub oder Checkpoints.
9. Roh-Audio nicht dauerhaft speichern.
10. Keine automatische Actor-/Weltänderung ohne Change-Record/Undo oder ausdrückliche GM-Bestätigung.
11. Bereits bestätigte Tests nicht ohne konkrete Regression wiederholen.
12. Aufgeschobene UI-/Recap-Tests nicht ungefragt wieder hervorholen.
13. Größere autonome Blöcke auf einem temporären Branch bündeln; `main` erst nach Review einmalig fast-forwarden, um unnötige GitHub-Actions-Läufe/Fehlmails zu vermeiden.

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

Aufgeschoben:

- 0.9.25 Session-Recap Inhalts-/Copy-Test
- 0.9.26 Drag/Persistenz/Resize/Filter-Interaktions-Smoke

0.9.26 UI wurde visuell positiv bestätigt (`Sieht super aus`).

## 4. Discord Identity Core – 0.9.27 / Companion 0.11.0

Status: **implementiert + CI-validiert, echter Discord-/Foundry-Runtime-Test noch offen.**

Validierter Build:

`971662a063fe3bd2b97efd6d0174ec4119c036b2 Build DM Cockpit v0.9.27`

Implementiert:

- Teilnehmer des relevanten Discord-Voice-Calls
- Cockpit-Karte `Spieler & Charaktere`
- GM-bestätigte Discord-Mitglied → Foundry-Actor-Zuordnung
- weltbezogene Persistenz in Foundry + Companion-SQLite-Mirror
- `playerName`, `actorId`, `actorUuid`, `characterName` in finalen Transkriptsegmenten
- bestätigte Charakteridentität als Kontext für Ollama/OpenAI
- keine KI-generierte Actor-/Spielerzuordnung
- alte falsche `audioCaptureImplemented:false`-Angabe bereinigt

Noch real lokal zu prüfen:

- echte Teilnehmer erscheinen in Foundry
- echte Mapping-Auswahl
- Live-Transkript trägt richtige Charakteridentität
- realer Call-Wechsel/Reconnect

## 5. Session-/Kampagnen-Identität – 0.9.28 / Companion 0.12.0

Status: **implementiert + isoliert smoke-getestet + CI-validiert, echter Discord-/Foundry-Runtime-Test noch offen.**

Validierter Build:

`5bc18698a0dad8bfd2bb1a914313888d9e000a20 Build DM Cockpit v0.9.28`

Foundry:

- neue Karte `Session-Identität`
- Profile als `Kampagne`, `One-Shot` oder `Session`
- Profil enthält Snapshot der aktuell GM-bestätigten Spieler-/Charakterzuordnungen
- Profil speichern ≠ aktivieren
- nur ein ausdrücklich aktiviertes Profil schaltet Nickname-Automatik scharf

Companion:

- persistente `identity_profiles`
- persistente Profilmitglieder
- persistente `discord_nickname_overrides`
- reversibler Nickname-Manager
- Session-Nickname standardmäßig `Charakter | Spieler`
- maximal 32 Unicode-Zeichen; Charaktername hat Priorität
- aktueller Discord-Anzeigename wird als Spieleranteil bevorzugt
- ursprünglicher Server-Nickname wird **vor** Mutation persistent gesichert
- Join/Rejoin → Session-Nickname anwenden
- Call-Leave → Originalname restaurieren
- Profilwechsel/Deaktivierung → alte Session-Namen restaurieren
- sauberer Companion-Shutdown → Restore vor Discord-/SQLite-Ende
- Restart-/Crash-Recovery über persistente Leases
- externe manuelle Namensänderung → `restore_conflict`, kein blindes Überschreiben
- späterer bewusster Rejoin kann den neuen manuellen Namen atomar als Restore-Basis übernehmen
- `Manage Nicknames` + Discord-Rollenhierarchie werden geprüft
- DAVE-Konfiguration im Voice-Join bleibt erhalten

Automatisiert geprüft:

- Profil-Persistenz
- nur ein aktives Profil
- 32-Zeichen-Formatter
- Join Apply
- identischer Snapshot ohne Doppel-Write
- Leave Restore
- Restore-Konfliktschutz
- Rejoin nach Konflikt
- Profilwechsel
- Deaktivierung
- Restart-/Crash-Recovery
- Foundry-/Companion-JS-Syntax
- Protocol-/Scope-JSON
- sauberer Foundry-Paketbuild 0.9.28

Noch real lokal zu prüfen:

- Profil in echtem Foundry speichern/aktivieren
- echte Discord-Nickname-Mutation
- Leave/Rejoin im echten Call
- Restore nach echtem Companion-Neustart
- Mapping → Profil → Nickname → Live-Transkript End-to-End

## 6. Protocol v1 – aktuelle Discord-Erweiterungen

Protocol bleibt `1.0` und wurde additiv erweitert.

Identity Core:

- `voice.participants`
- `voice.participants.request`
- `player.character.mapping.set`
- `player.character.mapping.request`
- `player.character.mapping.result`

Session Identity:

- `identity.profile.save`
- `identity.profile.list.request`
- `identity.profile.list.result`
- `identity.profile.activate`
- `identity.profile.deactivate`
- `identity.profile.state.request`
- `identity.profile.state`
- `nickname.status`

Vertrag/Schema:

- `docs/DISCORD-AUDIO-AI-CONTRACT-V1.md`
- `schemas/discord-audio-ai-v1.schema.json`

## 7. CI-/Packaging-Status

Frühere 0.9.27-Fehlermails wurden untersucht und behoben.

Aktueller Workflow:

- `concurrency` + `cancel-in-progress`
- Companion-/Protocol-/Scope-Änderungen werden validiert, erzeugen aber keinen unnötigen Foundry-ZIP-Build
- Foundry-ZIP nur bei Foundry-relevanten Änderungen bzw. manuellem Workflow
- Identity-Mapping- und Identity-Profile-Smoke-Tests laufen in CI
- größere autonome Blöcke werden auf Staging-Branch gebündelt
- 0.9.27 und 0.9.28 wurden nach dem Fix sauber gebaut

## 8. Aktueller Discord-Bot-Scope

Verbindlich:

`docs/DISCORD-BOT-EXPANSION-SCOPE-V1.json`

Bereits auf Implementierungs-/CI-Ebene abgeschlossen:

1. Voice-Teilnehmer → Spieler/Charakter-Mapping → Sprecherattribution
2. Kampagnen-/Sessionprofil → reversible Discord-Server-Nicknames

Aktueller autonomer Block:

**Discord-Ausgabe-Textkanal + Aufnahme-/Transkriptionshinweis + bewusstes Recap-Posting**

Ziel:

- verfügbare Discord-Textkanäle nur mit tatsächlichem Bot-Zugriff anzeigen
- Zielkanal im Cockpit jederzeit neu auswählbar speichern
- Aufnahme-/Transkriptionshinweis bewusst an Zielkanal senden
- bestehende Discord-Kurzfassung nach ausdrücklicher GM-Aktion direkt posten
- kein automatisches Recap-Posting

Danach:

- Session-Steuerung
- Slash-Commands
- Presence/Status
- Diagnosemodus
- Reconnect-Hardening

Auf später verschoben:

- mehrere GMs
- Befehlsberechtigungsmodell

## 9. Weitere offene Repository-Arbeit

Unabhängig vom Discord-Bot-Ausbau:

- dauerhaft durchsuchbares Transkript
- optionale automatische NPC-Memory-Übernahme nur mit sicherem Undo
- optional lokales STT
- Performance-/Skalierungs-Hardening

Nicht blockierend dokumentarisch stale:

- `docs/UI-REDESIGN-SCOPE-V1.json` enthält noch eine alte `source_of_truth_precondition` aus der Zeit vor der Packaging-Bereinigung.

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
- `styles/player-character-mapping.css`
- `styles/session-identity-profile.css`
- `companion/src/main.js`
- `companion/src/server.js`
- `companion/src/discord-voice.js`
- `companion/src/player-character-identity.js`
- `companion/src/identity-profile-store.js`
- `companion/src/discord-nickname-manager.js`
- `companion/src/identity-mapping-smoke-test.js`
- `companion/src/identity-profile-smoke-test.js`

## 11. Handoff-Regel

Ein neuer Chat prüft zuerst den aktuellen GitHub-Stand und liest `README.md`, `PROJECT-HANDOFF.md`, `PROJECT-CHECKPOINT.json` sowie bei Discord-Arbeit `docs/DISCORD-BOT-EXPANSION-SCOPE-V1.json`. Bei Widerspruch gewinnt der reale Code auf `main`; danach Dokumentation/Checkpoint korrigieren. Chronologisch beim aktuellen Discord-Bot-Block fortsetzen und bestätigte alte Arbeit nicht erneut aufrollen.
