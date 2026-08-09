# DM Cockpit V0.9.29

Foundry-VTT-V14-Modul plus lokaler Companion Service für Discord Voice, Live-Transkript, NPC-Kontext, strukturierte KI-Kandidaten, sicheren Change-Record/Undo, Session-Recaps sowie Discord-Spieler-/Foundry-Charakter-Zuordnung mit Session-/Kampagnenprofilen, reversiblen Server-Nicknames und frei wählbarem Discord-Ausgabe-Textkanal.

## Für neue Chats / andere KIs

Zuerst lesen:

1. `PROJECT-HANDOFF.md` – Architektur und Projektüberblick.
2. `PROJECT-CHECKPOINT.json` – kanonischer maschinenlesbarer Status.
3. `checkpoints/` – historische Snapshots.
4. `docs/UI-REDESIGN-SCOPE-V1.json` – Scope des UI-Umbaus.
5. `docs/DISCORD-BOT-EXPANSION-SCOPE-V1.json` – verbindlicher Scope des laufenden Discord-Bot-Ausbaus.

Bei Widerspruch zwischen Dokumentation und Code ist der aktuelle Repository-Code auf `main` technische Source of Truth; der Checkpoint muss anschließend korrigiert werden.

## Bestätigter Baseline-Kern

### Foundry 0.9.24 – vollständig bestätigt

- LIVE-Dashboard
- Abenteuer-Flowchart
- spontane Szenen und Szenen-Presets
- Gegner-Spawnpunkte und Enemy Reserve Bench
- Handout Queue
- Loot-/Belohnungspakete + Item-Suche
- Compendium-Schnellsuche
- NPC-Schnellgenerator
- Actor-basiertes NPC Memory
- Discord Live-Transkript
- NPC-Kontext aus Cockpit-Actor bzw. ausgewähltem Foundry-Token
- KI-Kandidatenkarte
- realer Ollama/Qwen3-Kandidat mit echtem Foundry-Actor-Kontext
- manuelles Annehmen/Verwerfen
- NPC-Memory-Übernahme nur nach GM-Aktion
- persistenter Change-Record + konfliktgeschütztes Rückgängig
- Foundry/GitHub Update-System

### 0.9.25 – Session-Recap

Implementiert; der frühere Inhalts-/Copy-Runtime-Test bleibt ausdrücklich auf später verschoben und wird nicht ungefragt erneut verlangt.

- Recap nur aus angenommenen `session.event.candidate`
- Entscheidungen, Quests/Aufgaben, Loot/Belohnungen, Kämpfe, offene Fragen, wichtige Ereignisse
- Discord-Kurzfassung aus denselben bestätigten Punkten
- Recap kopieren
- Discord-Kurzfassung kopieren

### 0.9.26 – UI-/Layout-Umbau

Implementiert und als sauberes Paket gebaut. Der Nutzer hat das neue UI am 2026-08-09 visuell positiv bestätigt. Drag-/Persistenz-/Resize-/Filter-Interaktionen gelten dadurch nicht automatisch als vollständig getestet.

- Zonen `Live`, `Spielleitung`, `Werkzeuge`, `Nachbereitung`
- technische Dashboard-Optik und höhere Informationsdichte
- fixe Bereichsnavigation
- persistente Ein-/Ausklappzustände und aktiver Tab
- Kartenreihenfolge innerhalb einer Zone per Drag-Handle
- vertikale Kartenhöhe mit lokaler Persistenz
- Such-/Filterleiste bei größeren Listen
- Tooltips, Working-/Error-Zustände und Tastaturshortcuts

## 0.9.27 / Companion 0.11.0 – Spieler-/Charakter-Sprecheridentität

Status: **implementiert und CI-validiert; echter Discord-/Foundry-Runtime-Test noch offen.**

- Voice-Teilnehmer des relevanten Discord-Calls
- Cockpit-Karte `Spieler & Charaktere`
- GM-bestätigte Discord-Mitglied-zu-Foundry-Actor-Zuordnung
- weltbezogene Persistenz + Companion-SQLite-Spiegelung
- `playerName`, `actorId`, `actorUuid`, `characterName` in finalen Transkriptsegmenten
- bestätigte Charakteridentität als KI-Kontext
- keine Actor-Zuordnung durch die KI

CI-validierter Build:

`971662a063fe3bd2b97efd6d0174ec4119c036b2 Build DM Cockpit v0.9.27`

## 0.9.28 / Companion 0.12.0 – Session-/Kampagnen-Identität

Status: **implementiert und CI-validiert; echter Discord-/Foundry-Runtime-Test noch offen.**

- persistente Profile `Kampagne`, `One-Shot`, `Session`
- Cockpit-Karte `Session-Identität`
- höchstens ein aktives Identitätsprofil
- Nickname-Automatik nur nach ausdrücklicher Profil-Aktivierung
- Server-Nickname standardmäßig `Charakter | Spieler`, max. 32 Unicode-Zeichen
- Original-Nickname vor Mutation persistent gesichert
- Join/Rejoin Apply
- Call-Leave, Profilwechsel, Deaktivierung und Shutdown Restore
- Restart-/Crash-Recovery
- Restore-Konfliktschutz bei externen manuellen Namensänderungen
- `Manage Nicknames`- und Rollen-Hierarchie-Prüfung
- globale Discord-Benutzernamen werden niemals geändert

CI-validierter Build:

`5bc18698a0dad8bfd2bb1a914313888d9e000a20 Build DM Cockpit v0.9.28`

## 0.9.29 / Companion 0.13.0 – Discord-Ausgabe

Implementierter und auf `main` integrierter neuer Block. Der automatisierte Main-/Paketlauf wird über den kanonischen Checkpoint festgehalten; ein echter Discord-/Foundry-Runtime-Test bleibt bis zum gebündelten Nutzertest offen.

### Frei wechselbarer Zielkanal

- neue Cockpit-Karte `Discord-Ausgabe`
- erreichbare Server-Textkanäle werden vom Companion über Discord ermittelt
- angeboten werden nur Kanäle mit aktuellem `View Channel`- und `Send Messages`-Zugriff
- Zielkanal kann jederzeit neu gewählt oder entfernt werden
- Auswahl wird pro Discord-Guild in SQLite persistent gespeichert
- vor jedem Versand wird der gespeicherte Kanal erneut validiert

### Aufnahme-/Transkriptionshinweis

- bei einer neu gestarteten Voice-Session versucht der Companion einen transparenten Hinweis in den ausgewählten Kanal zu senden
- erfolgreicher automatischer Hinweis ist pro Session idempotent und wird bei Retry/Reconnect nicht doppelt gesendet
- `capture.status.noticeShown` wird nur nach tatsächlich erfolgreichem Versand `true`
- Hinweis kann im Cockpit zusätzlich bewusst erneut gesendet werden
- Hinweis nennt einen aktiven Profilnamen, sofern vorhanden
- Hinweis macht transparent, dass live transkribiert wird und Roh-Audio nicht dauerhaft gespeichert wird

### Recap direkt an Discord

Die bestehende Recap-Karte behält ihre Copy-Funktionen und erhält zusätzlich:

- `An Discord senden`

Dabei gilt:

- nur eine bewusste GM-Aktion löst den Versand aus
- es gibt kein automatisches Recap-Posting
- Grundlage bleibt die bestehende Discord-Kurzfassung aus ausschließlich angenommenen Session-Kandidaten
- Kurzfassung bleibt auf 1800 Zeichen begrenzt

### Sicherheit / Persistenz

- `allowedMentions.parse = []` bei DM-Cockpit-Ausgaben
- dadurch keine unbeabsichtigten `@everyone`, `@here`, Rollen- oder User-Pings aus Recap-/KI-Text
- Versand-Audit speichert Request-ID, Art, Session/Kanal, Discord-Message-ID, Status, Textlänge und Fehler
- der eigentliche Nachrichtentext wird nicht als Output-Audit gespeichert
- erfolgreiche Request-IDs werden nicht erneut gesendet
- isolierter `discord-output-smoke-test.js` prüft Kanalliste, Persistenz, Recap, Idempotenz, Aufnahmehinweis, Reload und Clear

Noch real zu prüfen:

- echte Kanalliste im Foundry-Cockpit
- Zielkanal wählen/wechseln und Persistenz nach Reload
- echter automatischer Aufnahmehinweis
- echtes bewusstes Recap-Posting
- Verhalten bei gelöschtem Kanal bzw. verlorenen Senderechten
- kein doppelter automatischer Hinweis bei realem Reconnect

## Source of Truth / Packaging

GitHub `main` ist technische Source of Truth.

Der Release-Workflow:

- baut ausschließlich aus versionierten Repository-Quellen
- validiert Manifest-referenzierte Skripte/Styles und alle Foundry-JavaScript-Dateien
- installiert die Companion-Abhängigkeiten vor den Companion-Smoke-Tests
- validiert Companion-JavaScript sowie Protocol-/Scope-JSON
- führt Identity-, Identity-Profile- und Discord-Output-Smoke-Tests aus
- serialisiert `main`-Runs per GitHub-Actions-`concurrency`
- baut das Foundry-ZIP nur bei Foundry-relevanten Änderungen
- Companion-/Protocol-/Scope-only Änderungen erzeugen kein unnötiges ZIP

Größere autonome Blöcke werden auf einem Staging-Branch gebündelt und `main` anschließend einmalig fast-forward aktualisiert.

## Companion 0.13.0

Der vollständig bestätigte 0.10.0-Baseline-Kern bleibt unverändert bestätigt:

- Discord Voice / DAVE / GM Follow
- speaker-getrennte Audioverarbeitung
- Deepgram Nova-3 Deutsch
- lokales Ollama `qwen3:4b`
- Candidate Review + SQLite-Persistenz
- Change-Record/Undo-Protokoll

Spätere Companion-Stufen:

- 0.11.0: Spieler-/Charakter-Sprecheridentität
- 0.12.0: Identity-Profile + reversible Discord-Server-Nicknames
- 0.13.0: persistenter Discord-Ausgabekanal + Aufnahmehinweis + bewusstes Recap-Posting

OpenAI bleibt optionaler Fallback; kein echter bezahlter OpenAI-Aufruf wurde bestätigt.

## Datenschutz / Sicherheitsregeln

- Discord Bot Token niemals in GitHub oder Chat speichern.
- Deepgram/API Keys niemals in GitHub oder Chat speichern.
- Secrets bleiben ausschließlich lokal in `companion/.env`.
- Roh-Audio wird nicht dauerhaft gespeichert.
- Actor-/Weltänderungen nicht automatisch ohne Change-Record/Undo oder klare GM-Bestätigung ausführen.
- Spieler-/Charakterzuordnungen werden vom GM bestätigt; die KI darf keine Actor-ID raten.
- Discord-Nickname-Automatik greift nur bei aktivem Profil.
- Discord-Recaps werden nur nach bewusster GM-Aktion gepostet.

## Installation / Updates

Manifest:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Foundry-Installationspaket:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Der Companion liegt separat unter `companion/` und ist nicht Bestandteil des Foundry-ZIPs.
