# DM Cockpit V0.9.27

Foundry-VTT-V14-Modul plus lokaler Companion Service für Discord Voice, Live-Transkript, NPC-Kontext, strukturierte KI-Kandidaten, sicheren Change-Record/Undo, Session-Recaps und die neue Discord-Spieler-/Foundry-Charakter-Sprecherzuordnung.

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

Status: **implementiert und automatisiert prüfbar; echter Discord-/Foundry-Runtime-Test durch den Nutzer steht noch aus.**

Neu im ersten Discord-Bot-Ausbaublock:

- Companion ermittelt die Mitglieder des aktuell vom Bot verfolgten Voice-Channels.
- Foundry erhält `voice.participants` und zeigt im Cockpit eine Karte `Spieler & Charaktere`.
- Der GM ordnet Discord-Mitglieder bewusst Foundry-Actors zu; die KI darf diese Zuordnung nicht selbst bestimmen.
- Zuordnungen werden pro Foundry-Welt gespeichert und zusätzlich in Companion-SQLite gespiegelt.
- Finale Transkriptsegmente können `playerName`, `actorId`, `actorUuid` und `characterName` enthalten.
- Die Sprecherquelle bleibt die Discord-User-ID; die Actor-/Charakteridentität stammt nur aus der bestätigten GM-Zuordnung.
- Ollama und der optionale OpenAI-Adapter erhalten die bestätigte Charakteridentität als zusätzlichen Kontext.
- Nicht zugeordnete Sprecher bleiben ohne Actor-/Charakterfelder; es wird nichts geraten.
- Der alte falsche Status `audioCaptureImplemented: false` wurde auf den realen Stand korrigiert.
- SQLite-Migration ergänzt bestehende Datenbanken additiv um die neuen Identity-Felder und die Mapping-Tabelle.
- `identity-mapping-smoke-test.js` prüft Legacy-Migration, Mapping-Persistenz, Identity-Registry und Transcript-Attribution ohne echten Discord-Server.

Noch nicht als Runtime bestätigt:

- echte Teilnehmerliste aus dem realen Discord-Call in Foundry
- Auswahl/Änderung einer Zuordnung in der echten Foundry-UI
- tatsächliches Live-Transkript mit korrekt angezeigtem Charakterbezug
- Verhalten bei Discord-Reconnect/Call-Wechseln

Noch nicht Teil dieses Blocks:

- automatische Discord-Nickname-Änderung und Rücksetzung
- Kampagnen-/Session-Identitätsprofile
- frei wechselbarer Discord-Ausgabe-Textkanal
- direkte Recap-Nachricht an Discord
- Slash-Commands / manuelle Session-Steuerung / Presence

## Source of Truth / Packaging

GitHub `main` ist technische Source of Truth.

Aktueller Workflow:

- baut aus normalen versionierten Repository-Quellen, niemals aus einem alten ZIP als Eingangsquelle;
- prüft Manifest-referenzierte Foundry-Skripte/Styles und alle Foundry-JavaScript-Dateien;
- prüft Companion-JavaScript, Protocol-/Scope-JSON und den Identity-Smoke-Test;
- serialisiert `main`-Runs per GitHub-Actions-`concurrency`, damit parallele Paket-Pushes sich nicht gegenseitig überholen;
- Companion-/Protocol-/Scope-Änderungen werden validiert, lösen aber keinen unnötigen Foundry-ZIP-Neubau aus;
- ein neues `dm-cockpit.zip` wird nur bei Foundry-Paketänderungen bzw. einem manuellen Workflow-Lauf gebaut.

## Companion 0.11.0

Der bereits bestätigte 0.10.0-Kern bleibt unverändert bestätigt:

- Discord Voice / DAVE / GM Follow
- speaker-getrennte Audioverarbeitung
- Deepgram Nova-3 Deutsch
- lokales Ollama `qwen3:4b`
- Candidate Review + SQLite-Persistenz
- Change-Record/Undo-Protokoll

Neu in 0.11.0 ist der Identity-/Voice-Teilnehmer-Unterbau. Dieser ist noch nicht als echter lokaler Discord-/Foundry-Runtime-Test bestätigt.

OpenAI bleibt optionaler Fallback; kein echter bezahlter OpenAI-Aufruf wurde bestätigt.

## Datenschutz / Sicherheitsregeln

- Discord Bot Token niemals in GitHub oder Chat speichern.
- Deepgram/API Keys niemals in GitHub oder Chat speichern.
- Secrets bleiben ausschließlich lokal in `companion/.env`.
- Roh-Audio wird nicht dauerhaft gespeichert.
- Actor-/Weltänderungen nicht automatisch ohne Change-Record/Undo oder klare GM-Bestätigung ausführen.
- Spieler-/Charakterzuordnungen werden vom GM bestätigt; die KI darf keine Actor-ID raten.

## Installation / Updates

Manifest:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Foundry-Installationspaket:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Der Companion liegt separat unter `companion/` und ist nicht Bestandteil des Foundry-ZIPs.
