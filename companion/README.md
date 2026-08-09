# DM Cockpit Companion Service 0.1.0

Lokaler Zwischendienst zwischen Foundry/DM Cockpit und den späteren Discord-, Speech-to-Text- und KI-Komponenten.

Dieser Stand enthält **noch keinen Discord-Bot und keine Cloud-KI**. Er dient ausschließlich dazu, den bereits definierten Protocol-v1-Vertrag über einen echten lokalen WebSocket umzusetzen und persistente SQLite-Grundlagen bereitzustellen.

## Voraussetzungen

- Node.js 22.16.0 oder neuer
- npm
- DM Cockpit V0.9.21 oder neuer

## Installation

Im Repository:

```powershell
cd companion
npm install
npm run check
```

## Start

```powershell
npm start
```

Standardmäßig startet der Service nur auf dem lokalen Rechner:

- WebSocket: `ws://127.0.0.1:43170/v1`
- Health: `http://127.0.0.1:43170/health`
- SQLite: `companion/data/dm-cockpit.sqlite`

Der WebSocket-Port ist damit nicht automatisch im LAN oder Internet erreichbar.

## Foundry-Verbindung testen

1. Companion mit `npm start` laufen lassen.
2. Foundry-Testwelt öffnen.
3. DM Cockpit → **Discord Live-Transkript** öffnen.
4. URL auf `ws://127.0.0.1:43170/v1` lassen.
5. **Verbinden** klicken.
6. Der Status muss auf **Verbunden** wechseln.

Beim Handshake antwortet der Companion mit `hello.ack` und einem `capture.status` mit Zustand `idle`.

## Echten Transport + SQLite mit Mock testen

Während Companion und Foundry verbunden sind, in einem zweiten Terminal:

```powershell
cd companion
npm run mock
```

Erwartet:

- Terminal meldet `Handshake OK`.
- Terminal meldet `Mock-Test erfolgreich`.
- Im Foundry-Live-Transkript erscheint ein Sprecher **Companion Mock**.
- Text: `Dieser Satz kam über den echten lokalen Companion-WebSocket und wurde in SQLite gespeichert.`
- `http://127.0.0.1:43170/health` zeigt danach mindestens eine Session, einen Sprecher und ein Transkriptsegment in `stats`.

Damit werden WebSocket-Transport und SQLite-Persistenz gemeinsam getestet, ohne Discord oder kostenpflichtige Provider.

## Bereits persistiert

SQLite enthält Tabellen für:

- Sessions
- Sprecher
- finale Transkriptsegmente
- NPC-Kontext-Ereignisse
- zukünftige Undo-/Change-Records

Partielle Transkriptsegmente werden nicht dauerhaft gespeichert.

## Konfiguration über Umgebungsvariablen

- `DM_COCKPIT_HOST` – Standard `127.0.0.1`
- `DM_COCKPIT_PORT` – Standard `43170`
- `DM_COCKPIT_WS_PATH` – Standard `/v1`
- `DM_COCKPIT_DB_PATH` – optional eigener SQLite-Pfad
- `DM_COCKPIT_WS_URL` – nur für `npm run mock`, Standard `ws://127.0.0.1:43170/v1`

Für einen späteren Remote/VPS-Betrieb reicht dieser lokale Sicherheitsmodus noch nicht aus; dafür sind WSS und Authentifizierung vorgesehen.

## Noch nicht enthalten

- Discord Gateway / Voice
- DAVE/E2EE
- Audio-Buffer
- Speech-to-Text
- KI-Extraktion
- automatische NPC-Memory-Änderungen
- Undo-Ausführung
- Transkript-Suche
- Recap / Discord-Kurzfassung
