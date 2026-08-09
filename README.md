# DM Cockpit V0.9.26

Foundry-VTT-V14-Modul plus lokaler Companion Service für Discord Voice, Live-Transkript, NPC-Kontext, strukturierte KI-Kandidaten, sicheren Change-Record/Undo und Session-Recaps.

## Für neue Chats / andere KIs

Zuerst lesen:

1. `PROJECT-HANDOFF.md` – Architektur und Projektüberblick.
2. `PROJECT-CHECKPOINT.json` – kanonischer maschinenlesbarer Status.
3. `checkpoints/` – historische Snapshots.
4. `docs/UI-REDESIGN-SCOPE-V1.json` – verbindlicher Scope des aktuellen UI-Umbaus.

Bei einem Widerspruch zwischen Dokumentation und Code ist der aktuelle Repository-Code auf `main` die technische Quelle der Wahrheit; der Checkpoint muss anschließend korrigiert werden.

## Foundry 0.9.26

### Bestätigter Funktionskern aus 0.9.24

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

Implementiert, Runtime-Test weiterhin vom Nutzer auf später verschoben:

- Recap nur aus angenommenen `session.event.candidate`
- Entscheidungen, Quests/Aufgaben, Loot/Belohnungen, Kämpfe, offene Fragen, wichtige Ereignisse
- Discord-Kurzfassung aus denselben bestätigten Punkten
- Recap kopieren
- Discord-Kurzfassung kopieren
- kein automatisches Discord-Posting

### 0.9.26 – UI-/Layout-Umbau

Implementiert und als sauberes Paket gebaut. Der Nutzer hat das neue UI am 2026-08-09 in Foundry gesehen und den visuellen Eindruck mit „Sieht super aus“ bestätigt. Das gilt als visuelle Runtime-Bestätigung; Drag-/Persistenz-/Resize-/Filter-Interaktionen sind damit nicht automatisch vollständig getestet.

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

Nicht Teil dieses Umbaus:

- Fokusmodus für einzelne Bereiche
- zusätzlicher Scroll-Verhaltens-Umbau über die bestehende Bereichsnavigation hinaus

## Source of Truth / Packaging

Die frühere Paketlogik, die das vorhandene `dm-cockpit.zip` entpackte und Dateien darüberkopierte, ist entfernt.

Aktueller Stand:

- `scripts/dm-cockpit.js`, `styles/dm-cockpit.css` und `templates/cockpit.hbs` sind wieder normale versionierte Repository-Quellen.
- Der Release-Workflow startet aus einem leeren Build-Verzeichnis.
- Das alte ZIP ist kein Build-Eingang mehr.
- Manifest-referenzierte Skripte und Styles werden vor dem Build auf Existenz geprüft.
- Alle Foundry-JavaScript-Dateien laufen im Workflow vor dem Packaging durch `node --check`.
- Erst danach wird `dm-cockpit.zip` vollständig neu erzeugt.

Damit ist GitHub `main` wieder strukturell Source of Truth für den ausgelieferten Foundry-Code.

## Companion 0.10.0

Vollständig lokal bestätigt:

- Discord Voice / DAVE / GM Follow
- speaker-getrennte Audioverarbeitung
- Deepgram Nova-3 Deutsch
- lokales Ollama `qwen3:4b`
- Candidate Review + SQLite-Persistenz
- Change-Record/Undo-Protokoll

OpenAI bleibt optionaler Fallback; kein echter bezahlter OpenAI-Aufruf wurde bestätigt.

## Datenschutz / Sicherheitsregeln

- Discord Bot Token niemals in GitHub oder Chat speichern.
- Deepgram/API Keys niemals in GitHub oder Chat speichern.
- Secrets bleiben ausschließlich lokal in `companion/.env`.
- Roh-Audio wird nicht dauerhaft gespeichert.
- Actor-/Weltänderungen nicht automatisch ohne Change-Record/Undo oder klare GM-Bestätigung ausführen.

## Installation / Updates

Manifest:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/module.json`

Foundry-Installationspaket:

`https://raw.githubusercontent.com/hacker2090-coder/dm-cockpit/main/dm-cockpit.zip`

Der Companion liegt separat unter `companion/` und ist nicht Bestandteil des Foundry-ZIPs.
