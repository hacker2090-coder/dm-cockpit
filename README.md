# DM Cockpit V0.9.28

Foundry-VTT-V14-Modul plus lokaler Companion Service für Discord Voice, Live-Transkript, NPC-Kontext, strukturierte KI-Kandidaten, sicheren Change-Record/Undo, Session-Recaps sowie Discord-Spieler-/Foundry-Charakter-Zuordnung mit aktivierbaren Session-/Kampagnenprofilen.

## Für neue Chats / andere KIs

Zuerst lesen:

1. `PROJECT-HANDOFF.md` – Architektur und Projektüberblick.
2. `PROJECT-CHECKPOINT.json` – kanonischer maschinenlesbarer Status.
3. `checkpoints/` – historische Snapshots.
4. `docs/UI-REDESIGN-SCOPE-V1.json` – Scope des UI-Umbaus.
5. `docs/DISCORD-BOT-EXPANSION-SCOPE-V1.json` – verbindlicher Scope des laufenden Discord-Bot-Ausbaus.

Bei einem Widerspruch zwischen Dokumentation und Code ist der aktuelle Repository-Code auf `main` die technische Quelle der Wahrheit; der Checkpoint muss anschließend korrigiert werden.

## Bestätigter Funktionskern bis Foundry 0.9.26

### Aus 0.9.24 vollständig bestätigt

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

Implementiert, Runtime-Inhalts-/Copy-Test weiterhin ausdrücklich auf später verschoben:

- Recap nur aus angenommenen `session.event.candidate`
- Entscheidungen, Quests/Aufgaben, Loot/Belohnungen, Kämpfe, offene Fragen, wichtige Ereignisse
- Discord-Kurzfassung aus denselben bestätigten Punkten
- Recap kopieren
- Discord-Kurzfassung kopieren
- kein automatisches Discord-Posting

### 0.9.26 – UI-/Layout-Umbau

Implementiert und als sauberes Paket gebaut. Der Nutzer hat das neue UI am 2026-08-09 in Foundry visuell positiv bestätigt. Drag-/Persistenz-/Resize-/Filter-Interaktionen gelten dadurch nicht automatisch als vollständig getestet.

- technische Dashboard-Optik mit klarer visueller Hierarchie
- Zonen `Live`, `Spielleitung`, `Werkzeuge`, `Nachbereitung`
- Live-Funktionen oben priorisiert
- bessere Haupt-/Seitenspalten und weniger gleichförmiges Kartenraster
- kompaktere Karten, Listen und Statusanzeigen
- einheitliche Typografie, Abstände, Icons, Buttons, Eingabefelder und Flächenebenen
- schnelle Bereichsnavigation als fixe Leiste
- einklappbare Bereiche mit lokal gespeichertem Zustand
- zuletzt aktiver Tab wird lokal gemerkt
- persönliche Reihenfolge innerhalb einer Zone per Drag-Handle
- Kartenhöhe vertikal anpassbar und lokal gespeichert
- automatische Bereichssuche bei größeren Listen
- Tooltips aus vorhandenen Beschriftungen
- sichtbare Working-/Error-Zustände auf Kartenebene
- Alt+1 = Live, Alt+2 = Abenteuer, Alt+Pfeil hoch/runter = Karten-Navigation
- dezente Zustandsanimationen mit `prefers-reduced-motion`-Fallback

## 0.9.27 / Companion 0.11.0 – Discord-Spieler ↔ Foundry-Charakter

Status: **implementiert und CI-validiert; echter Discord-/Foundry-Runtime-Test durch den Nutzer steht noch aus.**

- Companion ermittelt die Mitglieder des aktuell vom Bot verfolgten Voice-Channels.
- Foundry erhält `voice.participants` und zeigt im Cockpit eine Karte `Spieler & Charaktere`.
- Der GM ordnet Discord-Mitglieder bewusst Foundry-Actors zu; die KI darf diese Zuordnung nicht selbst bestimmen.
- Zuordnungen werden pro Foundry-Welt gespeichert und zusätzlich in Companion-SQLite gespiegelt.
- Finale Transkriptsegmente können `playerName`, `actorId`, `actorUuid` und `characterName` enthalten.
- Die Sprecherquelle bleibt die Discord-User-ID; die Actor-/Charakteridentität stammt nur aus der bestätigten GM-Zuordnung.
- Ollama und der optionale OpenAI-Adapter erhalten die bestätigte Charakteridentität als zusätzlichen Kontext.
- Nicht zugeordnete Sprecher bleiben ohne Actor-/Charakterfelder; es wird nichts geraten.
- SQLite-Migration ergänzt bestehende Datenbanken additiv um die neuen Identity-Felder und die Mapping-Tabelle.
- `identity-mapping-smoke-test.js` prüft Legacy-Migration, Mapping-Persistenz, Identity-Registry und Transcript-Attribution.

CI-validierter Paketbuild dieses Meilensteins:

`971662a063fe3bd2b97efd6d0174ec4119c036b2 Build DM Cockpit v0.9.27`

## 0.9.28 / Companion 0.12.0 – Session-/Kampagnen-Identität

Status vor dem echten Nutzertest: **implementiert und isoliert automatisiert geprüft. Der kanonische Main-/CI-Stand steht immer in `PROJECT-CHECKPOINT.json`.**

Neu:

- Cockpit-Karte `Session-Identität`.
- Profile können als `Kampagne`, `One-Shot` oder `Session` gespeichert werden.
- Ein Profil enthält einen Snapshot der aktuell vom GM bestätigten Spieler-/Charakterzuordnungen.
- Es kann immer nur ein Identitätsprofil aktiv sein.
- **Nur ein ausdrücklich aktiviertes Profil darf Discord-Server-Nicknames verändern.**
- Session-Nickname wird mit Charaktername zuerst gebildet, standardmäßig `Charakter | Spieler`.
- Der aktuelle Discord-Anzeigename wird als Spieleranteil bevorzugt; ein gespeicherter Mapping-Name ist nur Fallback.
- Der Session-Nickname wird auf maximal 32 Unicode-Zeichen begrenzt; der Charaktername hat Priorität.
- Der ursprüngliche Discord-Server-Nickname wird **vor** der Änderung persistent in SQLite gesichert.
- Betritt ein zugeordneter Spieler während eines aktiven Profils den relevanten Call, wird der Session-Nickname angewendet.
- Verlässt der Spieler den Call, wird sein vorheriger Server-Nickname wiederhergestellt.
- Wird das Profil deaktiviert, werden noch aktive Session-Namen zurückgesetzt.
- Beim sauberen Companion-Shutdown wird vor Discord-/DB-Ende ein Restore versucht.
- Persistierte Nickname-Leases ermöglichen Restart-/Crash-Recovery.
- Wenn der aktuelle Nickname außerhalb von DM Cockpit manuell verändert wurde, überschreibt der Restore ihn **nicht blind**. Der Zustand wird als Restore-Konflikt sichtbar gehalten.
- Bei einem späteren bewussten Rejoin/Apply wird der neue manuelle Basisname atomar in den nächsten persistenten Lease übernommen.
- Discord-Rollenhierarchie und `Manage Nicknames` werden vor einer Änderung geprüft.
- DAVE/Voice-Baseline bleibt im Join-Pfad erhalten.

Automatisch geprüft ohne echten Discord-Server:

- Profil-Persistenz
- nur ein aktives Profil
- 32-Zeichen-Nickname-Formatter
- Join → Nickname anwenden
- aktueller Discord-Anzeigename vor altem gespeichertem Spielernamen
- identischer Teilnehmer-Snapshot → kein doppelter Write
- Leave → ursprünglichen Namen restaurieren
- Schutz manueller Namensänderungen
- atomarer Rejoin nach Restore-Konflikt
- Profilwechsel mit korrekter Restore-Basis
- Profil-Deaktivierung
- Restart-/Crash-Recovery aus persistentem Lease

Noch **nicht lokal durch den Nutzer bestätigt**:

- reale Profile in Foundry speichern/aktivieren
- echte Discord-Nickname-Änderung mit Rollen/Berechtigungen
- Leave/Rejoin im realen Voice-Call
- realer Restore nach Companion-Neustart
- Zusammenspiel Mapping → Profil → Nickname → Live-Transkript

## Source of Truth / Packaging

GitHub `main` ist technische Source of Truth.

Aktueller Workflow:

- baut aus normalen versionierten Repository-Quellen, niemals aus einem alten ZIP als Eingangsquelle;
- prüft Manifest-referenzierte Foundry-Skripte/Styles und alle Foundry-JavaScript-Dateien;
- prüft Companion-JavaScript, Protocol-/Scope-JSON und die Identity-Smoke-Tests;
- serialisiert `main`-Runs per GitHub-Actions-`concurrency`, damit parallele Paket-Pushes sich nicht gegenseitig überholen;
- Companion-/Protocol-/Scope-Änderungen werden validiert, lösen aber keinen unnötigen Foundry-ZIP-Neubau aus;
- ein neues `dm-cockpit.zip` wird nur bei Foundry-Paketänderungen bzw. einem manuellen Workflow-Lauf gebaut.

Für größere autonome Blöcke werden restliche Änderungen auf einem Staging-Branch gebündelt und `main` anschließend einmalig fast-forward aktualisiert, um unnötige Main-Workflow-Läufe zu vermeiden.

## Companion 0.12.0

Der bereits bestätigte 0.10.0-Kern bleibt unverändert bestätigt:

- Discord Voice / DAVE / GM Follow
- speaker-getrennte Audioverarbeitung
- Deepgram Nova-3 Deutsch
- lokales Ollama `qwen3:4b`
- Candidate Review + SQLite-Persistenz
- Change-Record/Undo-Protokoll

0.11.0 ergänzt Spieler-/Charakter-Sprecheridentität.

0.12.0 ergänzt:

- persistente Identity-Profile
- persistenten Original-/Session-Nickname-Zustand
- reversiblen Nickname-Manager
- Konfliktschutz vor Überschreiben manueller Namensänderungen
- geordnetes Shutdown-Restore
- Identity-Profile-/Nickname-Smoke-Test

OpenAI bleibt optionaler Fallback; kein echter bezahlter OpenAI-Aufruf wurde bestätigt.

## Datenschutz / Sicherheitsregeln

- Discord Bot Token niemals in GitHub oder Chat speichern.
- Deepgram/API Keys niemals in GitHub oder Chat speichern.
- Secrets bleiben ausschließlich lokal in `companion/.env`.
- Roh-Audio wird nicht dauerhaft gespeichert.
- Actor-/Weltänderungen nicht automatisch ohne Change-Record/Undo oder klare GM-Bestätigung ausführen.
- Spieler-/Charakterzuordnungen werden vom GM bestätigt; die KI darf keine Actor-ID raten.
- Discord-Nickname-Automatik greift nur bei aktivem Profil und verändert nie den globalen Discord-Benutzernamen.

## Installation / Updates

Manifest:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Foundry-Installationspaket:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Der Companion liegt separat unter `companion/` und ist nicht Bestandteil des Foundry-ZIPs.
