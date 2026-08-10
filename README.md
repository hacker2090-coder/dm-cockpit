# DM Cockpit V0.9.30

Foundry-VTT-V14-Modul plus lokaler Companion Service für Discord Voice, Live-Transkript, NPC-Kontext, strukturierte KI-Kandidaten, sicheren Change-Record/Undo, Session-Recaps sowie Discord-Spieler-/Foundry-Charakter-Zuordnung mit Session-/Kampagnenprofilen, reversiblen Server-Nicknames, frei wählbarem Discord-Ausgabe-Textkanal und manueller Session-Steuerung über Discord/Foundry.

> **Release-Status:** 0.9.30 / Companion 0.14.0 ist implementiert, automatisiert geprüft und CI-validiert. Der echte Discord-/Foundry-Runtime-Test ist **teilweise bestätigt**. Sessionstart, einmaliger Aufnahmehinweis, STT, Voice-Reconnect, gleiche Session-ID und Duplikatschutz nach Reconnect wurden real bestätigt. Fortsetzungspunkt ist `/dm recap`; `local_confirmed` und `fully_confirmed` bleiben bis zum Abschluss des Bundles ausdrücklich unvollständig.

CI-Validierungsbuild des 0.9.30-Codeblocks:

`90c63fdf1e299d0c5e092507226a7f72b7a98bc1 Build DM Cockpit v0.9.30`

Letzter vollständig neu paketierter 0.9.30-Stand vor dem Repository-Wartungsblock:

`e4ae4a5534762bbef4fe9e79c05647cc86b647a9 Build DM Cockpit v0.9.30`

## Für neue Chats / andere KIs

Zuerst lesen:

1. `PROJECT-CHECKPOINT.json` – kanonischer maschinenlesbarer Status und exakter Fortsetzungspunkt.
2. `PROJECT-HANDOFF.md` – Architektur und Projektüberblick.
3. `checkpoints/` – historische Snapshots.
4. `docs/DISCORD-BOT-EXPANSION-SCOPE-V1.json` – verbindlicher Discord-Bot-Scope.
5. `docs/UI-REDESIGN-SCOPE-V1.json` – UI-Scope; die frühere Source-of-Truth-Blockade ist inzwischen aufgelöst.
6. `docs/NEXT-IMPLEMENTATION-BACKLOG-V1.json` – getrennte Liste aus Runtime-Pending, echten noch nicht implementierten Funktionen und explizit aufgeschobenen Punkten.

Bei Widerspruch zwischen Dokumentation und Code ist der aktuelle Repository-Code auf `main` technische Source of Truth. Der Checkpoint muss anschließend korrigiert werden.

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

Die frühere UI-Scope-Warnung, dass `scripts/dm-cockpit.js`, `styles/dm-cockpit.css` und `templates/cockpit.hbs` nicht sauber versioniert seien, ist erledigt: diese Kernquellen liegen auf `main` vor und der Release-Workflow baut aus einem frischen Build-Verzeichnis.

## 0.9.27 / Companion 0.11.0 – Spieler-/Charakter-Sprecheridentität

Status: **implementiert und CI-validiert; der vollständige eigene Identity-Runtime-Block ist noch nicht separat abgeschlossen.**

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

Status: **implementiert und CI-validiert; der vollständige eigene Nickname-/Identity-Runtime-Block ist noch nicht separat abgeschlossen.**

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

Status: **implementiert, automatisiert geprüft und CI-validiert; teilweise real bestätigt.**

CI-validierter Build:

`10a8aa21483aed55f187df3839aefc5d27bda14f Build DM Cockpit v0.9.29`

### Implementiert

- Cockpit-Karte `Discord-Ausgabe`
- nur erreichbare Textkanäle mit aktuellem `View Channel` + `Send Messages`
- Zielkanal jederzeit wählbar/wechselbar/entfernbar
- Auswahl pro Discord-Guild persistent in SQLite
- erneute Rechte-/Existenzprüfung vor Versand
- automatischer Aufnahme-/Transkriptionshinweis pro Session
- erfolgreicher Auto-Hinweis idempotent gegen Retry/Reconnect
- bewusster manueller Hinweis möglich
- Recap nur nach bewusster GM-Aktion direkt an Discord
- `allowedMentions.parse = []`
- Output-Audit speichert Metadaten, nicht Nachrichtentext
- erfolgreiche Request-IDs werden nicht doppelt gesendet

### Real bereits bestätigt

- echter Zielkanal konnte im Cockpit ausgewählt und übernommen werden
- `/dm start` erzeugte genau einen automatischen Transkriptionshinweis im Zielkanal
- nach echtem Voice-Reconnect blieb es bei genau diesem einen Hinweis

### Noch real offen

- Zielkanal-Persistenz über Neustart/Reload
- echtes bewusstes Recap-Posting
- Verhalten bei gelöschtem Kanal bzw. verlorenen Senderechten

## 0.9.30 / Companion 0.14.0 – Session-Steuerung, Commands, Presence, Diagnose und Reconnect

Status: **implementiert, automatisiert geprüft und CI-validiert; Runtime teilweise bestätigt.**

CI-Validierungsbuild:

`90c63fdf1e299d0c5e092507226a7f72b7a98bc1 Build DM Cockpit v0.9.30`

### Manuelle logische Session

- Discord-Voice-Join allein startet keine DM-Cockpit-Session
- Session und Voice-Verbindung sind getrennte Zustände
- Sessionstart setzt genau eine logische `sessionId`
- doppelter Start ist idempotent und erzeugt keine zweite Session
- doppelter Stop ist idempotent
- Audio-Receiver wird nur bei aktiver Session und bereiter Voice-Verbindung angebunden
- verspätete STT-Ergebnisse einer bereits beendeten/ersetzten Session werden verworfen

### Discord Slash Commands

Registriert werden serverbezogen:

- `/dm status`
- `/dm start`
- `/dm stop`
- `/dm recap`

Im aktuellen Ausbau sind die Befehle auf die konfigurierte GM-Discord-User-ID begrenzt. Ein allgemeines Rollen-/Berechtigungsframework bleibt bewusst ein späterer Scope-Punkt.

`/dm recap` erzeugt keinen separaten KI-Recap. Der Befehl fordert in Foundry die bestehende, ausschließlich aus angenommenen Session-Ereignissen gebildete Discord-Kurzfassung an und nutzt den vorhandenen bewussten Discord-Ausgabepfad.

### Bot Presence und Diagnose

Der Bot kann seinen Betriebszustand sichtbar machen:

- bereit
- Voice bereit
- Session aktiv
- Session pausiert / Voice-Reconnect
- Diagnose nötig

`/dm status` berichtet Session, Capture, Gateway, Voice, Reconnect und gewählten Ausgabekanal. `diagnostic.state` transportiert Gateway-/Voice-/Output-Fehlerzustände an Foundry.

### Robuster Voice-Reconnect

- begrenzte Reconnect-Versuche mit Backoff
- Reconnect verwendet denselben Ziel-Voice-Channel
- laufende logische Session behält dieselbe `sessionId`
- Reconnect startet keine zweite logische Session
- automatischer Aufnahmehinweis bleibt idempotent
- kurzlebige Audiosegment-Deduplizierung schützt zusätzlich gegen doppelte STT-Verarbeitung
- absichtliches Voice-Verlassen deaktiviert Reconnect vor `connection.destroy()`

### Real bereits bestätigt

- Companion 0.14.0 startet mit Deepgram und Discord Gateway bereit
- Foundry 0.9.30 lädt ohne sichtbaren Fehler
- Voice-Join startet keine logische Session automatisch
- `/dm start` funktioniert
- echte Session-ID wurde erzeugt
- genau ein automatischer Aufnahmehinweis
- echtes Sprachsegment erscheint in Foundry
- manueller Bot-Disconnect führt zum automatischen Reconnect
- dieselbe Session-ID bleibt nach Reconnect aktiv
- `/dm status` meldet danach Session aktiv, Capture aktiv, Gateway ready, Voice ready und Reconnect bereit
- kein zweiter Aufnahmehinweis nach Reconnect
- neues Sprachsegment nach Reconnect erscheint genau einmal

Die interne Logmeldung `Capture-Status: paused` nach Voice-Ready ist derzeit nur eine missverständliche Controller-Statussemantik, kein bestätigter Funktionsfehler: `/dm status` meldete `Capture: aktiv` und STT arbeitete nach Reconnect weiter.

### Noch real offen

1. `/dm recap`
2. `/dm stop`
3. zweites `/dm stop` für Idempotenz
4. Presence-/Diagnosezustände abschließend beobachten
5. Ausgabekanal-Persistenz über Neustart
6. gelöschter/unbeschreibbarer Zielkanal, falls praktikabel
7. abschließender E2E-Abschluss

Bereits bestätigte Reconnect-/STT-Punkte werden ohne konkreten Regressionshinweis nicht erneut getestet.

## Was noch nicht im aktiven Produktkern ist

Der maschinenlesbare Backlog steht in `docs/NEXT-IMPLEMENTATION-BACKLOG-V1.json`.

Empfohlene Reihenfolge **nach Abschluss des 0.9.30-Runtime-Bundles**:

1. **0.9.31 – Flowchart-Verbindungen und Knotenstatus**: `edges` werden aktuell nur datenkompatibel erhalten; Verbindungen sind im aktiven Grundkern nicht bearbeitbar/visualisiert.
2. **0.9.32 – Trigger-System V1**: der alte Trigger-Code gehört weiterhin zum deaktivierten Legacy-Bestand und ist nicht Teil des aktiven Kerns.
3. **0.9.33 – DM-Szeneninfos + bewusste Szenensteuerung/-Synchronisation**: frühere entsprechende Legacy-Funktionen sind im aktiven Grundkern nicht enthalten.

Weiterhin ausdrücklich auf später verschoben:

- mehrere GMs
- allgemeines rollenbasiertes Befehlsberechtigungs-Framework
- UI-Fokusmodus
- weiterer Scroll-Umbau

## Repository-Konsistenz

`tools/repository-consistency-check.mjs` prüft im Release-Workflow unter anderem:

- Foundry-/Companion-Version gegen `PROJECT-CHECKPOINT.json`
- README-Hauptversion gegen `module.json`
- vorhandene Manifest-/Runtime-Quellen
- gültige Repository-/Branch-Angaben im Discord-Scope
- dass die erledigte UI-Source-of-Truth-Blockade nicht wieder als offen dokumentiert wird

Der statische Fallback `V0.9.9` in `templates/cockpit.hbs` ist kosmetisch veraltet. `scripts/module-version-badge.js` setzt im laufenden Foundry die echte Version aus `module.json`; der Konsistenzcheck meldet den Fallback deshalb nur als Warnung und nicht als Runtime-Fehler.

## Source of Truth / Packaging

GitHub `main` ist technische Source of Truth. Nicht integrierte größere Arbeitsblöcke liegen auf einem benannten Staging-Branch.

Der Release-Workflow:

- baut ausschließlich aus versionierten Repository-Quellen
- validiert Manifest-referenzierte Skripte/Styles und alle Foundry-JavaScript-Dateien
- prüft Repository-/Checkpoint-/Scope-Konsistenz
- installiert Companion-Abhängigkeiten vor Companion-Smoke-Tests
- validiert Companion-JavaScript sowie Protocol-/Scope-JSON
- führt Identity-, Identity-Profile-, Discord-Output-, Session-Control-, Discord-Command- und Voice-Reconnect-Smoke-Tests aus
- serialisiert `main`-Runs per GitHub-Actions-`concurrency`
- baut das Foundry-ZIP nur bei Foundry-relevanten Änderungen
- Companion-/Protocol-/Scope-/Tool-only Änderungen erzeugen kein unnötiges ZIP

Größere autonome Blöcke werden auf einem Staging-Branch gebündelt und `main` anschließend nach Review möglichst einmalig fast-forward aktualisiert.

## Companion 0.14.0

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
- 0.14.0: manuelle Session-State-Machine + `/dm`-Commands + Presence/Diagnose + robuster Voice-Reconnect

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
- Reconnect darf keine neue logische Session, keinen zweiten automatischen Aufnahmehinweis und keine doppelten Transkriptsegmente erzeugen.

## Installation / Updates

Manifest:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Foundry-Installationspaket:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Der Companion liegt separat unter `companion/` und ist nicht Bestandteil des Foundry-ZIPs.
