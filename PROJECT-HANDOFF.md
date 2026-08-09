# DM Cockpit – Master Handoff

Stand: 2026-08-09 18:32 CEST

Dieses Dokument ist der menschlich/LLM-lesbare Einstiegspunkt für einen neuen Chat. Für den neuesten maschinenlesbaren Status zusätzlich immer `PROJECT-CHECKPOINT.json` lesen. GitHub `main` ist Source of Truth.

## 1. Projektziel

DM Cockpit ist ein Foundry-VTT-V14-Modul plus lokaler Companion Service. Ziel ist ein zentrales GM-Live-Cockpit, das Session-Arbeit bündelt und Kontextwechsel zwischen Foundry, Discord und Notizen reduziert.

Produktprinzipien:

- wichtige Live-Aktionen priorisieren;
- seltene Funktionen kompakt/einklappbar halten;
- KI erzeugt Vorschläge, keine stillen Weltänderungen;
- Actor-/Weltänderungen nur mit expliziter GM-Aktion oder sicherem Change-Record/Undo;
- Spieler-/Charakterzuordnungen werden vom GM bestätigt und nie von der KI geraten;
- keine Secrets in Chat/GitHub/Checkpoints;
- kein dauerhaftes Roh-Audio.

## 2. Repository / Versionen

- Repository: `hacker2090-coder/dm-cockpit`
- Branch: `main`
- lokales Repo: `$HOME\Desktop\dm-cockpit`
- Foundry-Modul-ID: `dm-cockpit`
- Foundry Repository-Version: `0.9.27`
- Companion Repository-Version: `0.11.0`
- Companion WebSocket: `ws://127.0.0.1:43170/v1`
- Health: `http://127.0.0.1:43170/health`
- SQLite: `companion/data/dm-cockpit.sqlite`
- lokale Secrets: `companion/.env`, gitignored

Letzter CI-validierter Paketbuild:

`971662a063fe3bd2b97efd6d0174ec4119c036b2 Build DM Cockpit v0.9.27`

PowerShell-Regel:

```powershell
cd $HOME\Desktop\dm-cockpit
git pull
cd companion
npm.cmd ...
```

`npm.cmd` verwenden, nicht `npm`. Keine `&&`-Ketten verlangen.

## 3. Arbeitsregeln

1. Vor Änderungen aktuellen `main` prüfen.
2. GitHub `main` ist technische Source of Truth.
3. Implementiert, CI/statisch getestet, lokal bestätigt und vollständig bestätigt strikt unterscheiden.
4. Nutzer nicht nach jedem Mikroschritt bestätigen lassen; zusammengehörige Tests bündeln.
5. Nutzer nur für echte lokale/externe Tests, Secrets/Zugänge oder nicht ableitbare Entscheidungen einbeziehen.
6. Wenn Nutzeraktion nötig ist, Abschnitt exakt `Ich möchte von dir` verwenden.
7. Nach sinnvollen Wiederaufnahmepunkten `PROJECT-CHECKPOINT.json` + historischen Snapshot unter `checkpoints/` aktualisieren und denselben JSON-Stand im Chat bereitstellen.
8. Keine Tokens/API-Keys/Passwörter in Chat, GitHub oder Checkpoints.
9. Roh-Audio nicht dauerhaft speichern.
10. Keine automatische Actor-/Weltänderung ohne Change-Record/Undo oder ausdrückliche GM-Bestätigung.
11. Bekannte bestätigte Tests nicht ohne konkrete Regression wiederholen.
12. Aufgeschobene UI-/Recap-Tests nicht ungefragt wieder hervorholen.

## 4. Aktuelle Architektur

### Foundry 0.9.27

Bestehender Funktionskern:

- LIVE-Dashboard
- Abenteuer-Flowchart
- spontane Szenen / Szenen-Presets
- Gegner-Spawnpunkte / Enemy Reserve Bench
- Handout Queue
- Loot-/Belohnungspakete / Item-Suche / Compendium-Suche
- NPC-Schnellgenerator
- Actor-basiertes NPC Memory
- Discord Live-Transkript
- NPC-Kontext
- manuelle KI-Kandidatenprüfung
- konfliktgeschütztes NPC-Memory-Undo
- Session-Recap + Discord-Kurzfassung
- UI-/Layout-System 0.9.26
- neu: Karte `Spieler & Charaktere` für Discord-Spieler-/Foundry-Actor-Zuordnung

Neue Identity-Quellen:

- `scripts/player-character-mapping.js`
- `styles/player-character-mapping.css`

### Companion 0.11.0

Der bestätigte 0.10.0-Unterbau bleibt bestehen:

- Discord Gateway/Voice
- DAVE/E2EE
- GM-Follow/Auto-Join
- sprechergetrennter Audioempfang
- temporäre Audio-Pufferung
- Deepgram STT
- provider-neutrale KI-Extraktion
- SQLite-Persistenz
- Candidate Review
- Change-Record/Undo

Neu in 0.11.0:

- Voice-Teilnehmer-Snapshot des relevanten Calls
- weltbezogene Spieler-/Charakterzuordnungen
- Companion-SQLite-Spiegelung der Zuordnungen
- Identity-Registry `companion/src/player-character-identity.js`
- strukturierte Spieler-/Actor-/Charakterfelder in finalen Transkriptsegmenten
- bestätigte Charakteridentität als Kontext für Ollama und optional OpenAI

## 5. Protocol v1 – Identity-Erweiterung

Version bleibt `1.0`; der Nachrichtenvertrag wurde additiv erweitert.

Neu:

- `voice.participants`
- `voice.participants.request`
- `player.character.mapping.set`
- `player.character.mapping.request`
- `player.character.mapping.result`

`transcript.segment` kann zusätzlich enthalten:

- `playerName`
- `actorId`
- `actorUuid`
- `characterName`

Semantik:

- Discord User ID ist die Quelle der menschlichen Sprecheridentität.
- Foundry Actor/Charakter kommt ausschließlich aus der vom GM bestätigten Zuordnung.
- Die KI darf niemals Actor-ID oder Spieler-/Charakterzuordnung selbst erfinden.
- Die Zuordnung ist keine automatische IC/OOC-Klassifikation.

Vertrag/Schema:

- `docs/DISCORD-AUDIO-AI-CONTRACT-V1.md`
- `schemas/discord-audio-ai-v1.schema.json`

## 6. SQLite

Persistente Tabellen enthalten weiterhin:

- `sessions`
- `speakers`
- `transcript_segments`
- `npc_context_events`
- `npc_memory_candidates`
- `session_event_candidates`
- `change_records`

Neu:

- `player_character_mappings`

Additiv migrierte Felder:

- `speakers.server_nickname`
- `transcript_segments.player_name`
- `transcript_segments.actor_id`
- `transcript_segments.actor_uuid`
- `transcript_segments.character_name`

Roh-Audio wird nicht dauerhaft gespeichert.

## 7. Bestätigungsstatus

### Vollständig bestätigt – nicht wiederholen ohne Regression

Companion 0.10.0:

- Discord Login / DAVE / Auto-Join / GM Follow
- speaker-getrennte Audioverarbeitung
- Deepgram-End-to-End
- Ollama Adapter / Preflight / E2E / Qualitätsbenchmark
- Candidate Review Persistenz/Reload
- Change-Record/Undo Backend

Foundry 0.9.24:

- echter Ollama-Kandidat mit Actor-Kontext
- Annehmen/Verwerfen
- NPC-Memory-Übernahme nach GM-Aktion
- Change-Record
- konfliktgeschütztes Undo auf exakten vorherigen Zustand

### Teilbestätigt / aufgeschoben

Foundry 0.9.25 Session-Recap:

- implementiert und Karte sichtbar;
- Inhalts-/Copy-Test vom Nutzer ausdrücklich auf später verschoben.

Foundry 0.9.26 UI:

- visuell in Foundry mit „Sieht super aus“ bestätigt;
- Drag/Persistenz/Resize/Filter nicht als vollständig getestet behandeln.

### Neu: 0.9.27 / 0.11.0 Discord Identity Core

Status: **implementiert und CI-validiert, echter Discord-/Foundry-Runtime-Test noch offen.**

CI-validiert:

- Foundry-JS `node --check`
- Companion-JS `node --check`
- Protocol-/Scope-JSON Parse
- Identity-Mapping-Smoke-Test
- sauberer Foundry-Paketbuild 0.9.27

Der Smoke-Test deckt ab:

- Migration einer Legacy-SQLite-Struktur
- Mapping-Persistenz
- Identity-Registry
- Transcript-Attribution
- Entfernen/Clear

Noch real lokal zu prüfen, gebündelt und erst wenn sinnvoll:

- echte Discord-Call-Teilnehmer erscheinen im Cockpit
- GM-Zuordnung Discord-Spieler -> Foundry-Charakter
- Live-Transkript trägt die richtige Charakteridentität
- realer Call-Wechsel/Reconnect

## 8. CI-/Packaging-Incident 2026-08-09

Während der ersten 0.9.27-Commits kamen wiederholte GitHub-Actions-Fehlermails.

Ermittelte Ursachen:

1. Viele schnelle `main`-Commits konnten parallele Runs starten, die jeweils `dm-cockpit.zip` neu bauten und zurück auf `main` pushen wollten.
2. Companion-/Protocol-Änderungen lösten unnötige Foundry-ZIP-Neubauten aus.
3. Der neue Identity-Smoke-Test verglich eine `node:sqlite`-Query-Zeile mit Null-Prototype per Strict-Deep-Equal gegen ein normales Objekt.

Behoben:

- Workflow-`concurrency` mit `cancel-in-progress`;
- Companion-/Protocol-/Scope-Änderungen werden validiert, aber bauen kein Foundry-ZIP;
- Foundry-ZIP nur bei Foundry-relevanten Pfadänderungen oder manuellem Workflow;
- SQLite-Testzeile vor Vergleich in normales Objekt normalisiert.

Bestätigung des Fixes:

- mehrere Companion-Commits erzeugten danach keine unnötigen ZIP-Build-Commits;
- kontrollierter Foundry-Lauf erzeugte erfolgreich `Build DM Cockpit v0.9.27` (`971662a...`).

## 9. Aktueller Discord-Bot-Scope

Verbindlich:

`docs/DISCORD-BOT-EXPANSION-SCOPE-V1.json`

Ausgewählt und in Arbeit:

- Slash-Commands
- manuelle Session-Steuerung
- Aufnahme-/Transkriptionshinweis
- Presence/Status
- robuster Reconnect
- Recap nach bewusster GM-Aktion an Discord
- Session-Status in Discord
- Spieler-/Charakter-Mapping
- sichere Cockpit-Konfiguration
- Diagnosemodus
- bereinigte Statusangaben
- jederzeit wechselbarer Discord-Ausgabe-Textkanal
- Call-Mitglieder -> Foundry-Charakter -> Sprecherattribution -> später Session-Nickname

Auf später verschoben:

- mehrere GMs
- Befehlsberechtigungsmodell

## 10. Aktueller Wiederaufnahmepunkt

Meilenstein 1 ist abgeschlossen auf Implementierungs-/CI-Ebene:

`Voice-Teilnehmer -> Spieler/Charakter-Mapping -> Sprecherattribution`

Nächster autonomer Block:

`Kampagnen-/Session-Identitätsprofil -> ursprünglichen Server-Nickname persistent sichern -> Charaktername zuerst setzen -> Rejoin idempotent behandeln -> bei Call-Leave/Sessionende zuverlässig zurücksetzen`

Wichtig:

- Nickname-Ziel ist nur der serverbezogene Discord-Nickname, nie der globale Benutzername.
- Nickname-Veränderung darf nur bei ausdrücklich aktivem Profil/Sessionzustand stattfinden.
- Vor jeder Änderung muss der ursprüngliche Nickname persistent gespeichert werden.
- Crash-Recovery und doppeltes Restore müssen idempotent sein.

Danach geplant:

1. frei wechselbarer Discord-Ausgabe-Textkanal
2. Aufnahmehinweis / bewusstes Recap-Posting
3. Session-Steuerung / Slash-Commands / Presence / Diagnose / Reconnect-Hardening

## 11. Weitere offene Repository-Arbeit

Unabhängig vom aktuellen Discord-Bot-Ausbau weiterhin offen:

- dauerhaft durchsuchbares Transkript
- optionale automatische NPC-Memory-Übernahme nur mit sicherem Undo
- optional lokales STT
- Performance-/Skalierungs-Hardening

Nicht blockierend, dokumentarisch noch stale:

- `docs/UI-REDESIGN-SCOPE-V1.json` enthält eine alte `source_of_truth_precondition` aus der Zeit vor der Packaging-Bereinigung.

## 12. Nicht erneut testen ohne Regression

- Discord-Bot-Erstellung / Secrets-Einrichtung
- Companion 0.10.0 Baseline
- Deepgram E2E
- Ollama Preflight/E2E/Qualitätsbenchmark
- Candidate Review Smoke
- Foundry 0.9.24 NPC-Memory Undo E2E
- 0.9.25 Recap-Inhalts-/Copy-Test solange aufgeschoben

## 13. Wichtige Dateien

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
- `styles/player-character-mapping.css`
- `companion/src/main.js`
- `companion/src/discord-voice.js`
- `companion/src/player-character-identity.js`
- `companion/src/store.js`
- `companion/src/identity-mapping-smoke-test.js`

## 14. Handoff-Regel

Ein neuer Chat soll zuerst den aktuellen GitHub-Stand lesen und nicht aus altem Chatgedächtnis weiterarbeiten. Bei Widerspruch gewinnt der reale Code auf `main`; danach Dokumentation/Checkpoint korrigieren. Chronologisch beim aktuellen Discord-Bot-Block weiterarbeiten und bestätigte alte Arbeit nicht erneut aufrollen.
