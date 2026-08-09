import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { CompanionStore } from "./store.js";

const PROTOCOL_VERSION = "1.0";
const SERVICE_VERSION = "0.1.0";
const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = process.env.DM_COCKPIT_HOST?.trim() || "127.0.0.1";
const PORT = Number.parseInt(process.env.DM_COCKPIT_PORT || "43170", 10);
const WS_PATH = process.env.DM_COCKPIT_WS_PATH?.trim() || "/v1";
const DB_PATH = resolve(process.env.DM_COCKPIT_DB_PATH?.trim() || resolve(APP_DIR, "data", "dm-cockpit.sqlite"));

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`Ungültiger DM_COCKPIT_PORT: ${process.env.DM_COCKPIT_PORT}`);
}

const store = new CompanionStore(DB_PATH);
const clients = new Set();

function now() {
  return new Date().toISOString();
}

function id(prefix = "msg") {
  return `${prefix}_${randomUUID()}`;
}

function envelope(type, payload = {}, sessionId = null) {
  return {
    v: PROTOCOL_VERSION,
    type,
    id: id("msg"),
    ts: now(),
    sessionId,
    payload
  };
}

function send(ws, type, payload = {}, sessionId = null) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(envelope(type, payload, sessionId)));
  return true;
}

function broadcast(type, payload = {}, sessionId = null) {
  const message = JSON.stringify(envelope(type, payload, sessionId));
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(message);
  }
}

function sendError(ws, message, code = "bad_request", sessionId = null) {
  send(ws, "error", { code, message }, sessionId);
}

function validEnvelope(value) {
  return value
    && typeof value === "object"
    && value.v === PROTOCOL_VERSION
    && typeof value.type === "string"
    && typeof value.id === "string"
    && value.payload
    && typeof value.payload === "object";
}

function handleProtocolMessage(ws, message) {
  if (!validEnvelope(message)) {
    sendError(ws, `Nur Protocol v${PROTOCOL_VERSION} wird unterstützt.`, "invalid_envelope");
    return;
  }

  const payload = message.payload;
  const sessionId = message.sessionId ? String(message.sessionId) : null;
  const receivedAt = now();

  switch (message.type) {
    case "hello":
      send(ws, "hello.ack", {
        service: "dm-cockpit-companion",
        serviceVersion: SERVICE_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        features: [
          "health",
          "session.started",
          "session.ended",
          "speaker.upserted",
          "capture.status",
          "transcript.segment",
          "npc.context",
          "sqlite"
        ],
        database: "sqlite",
        persistentTranscript: true
      }, null);
      send(ws, "capture.status", {
        state: "idle",
        policy: "notice_only",
        rawAudioRetention: "until_successful_transcription",
        noticeShown: false,
        legalAuthorizationConfirmedExternally: false
      }, sessionId);
      break;

    case "health":
      send(ws, "health", {
        ok: true,
        serviceVersion: SERVICE_VERSION,
        protocolVersion: PROTOCOL_VERSION,
        connectedClients: clients.size,
        databasePath: DB_PATH,
        stats: store.stats()
      }, sessionId);
      break;

    case "session.started":
      store.upsertSession(sessionId ?? payload.sessionId, payload, receivedAt);
      break;

    case "session.ended":
      store.endSession(sessionId ?? payload.sessionId, payload, receivedAt);
      break;

    case "speaker.upserted":
      store.upsertSpeaker(payload, receivedAt);
      break;

    case "transcript.segment":
      if (payload.final !== false) store.upsertTranscriptSegment(sessionId, payload, receivedAt);
      broadcast("transcript.segment", payload, sessionId);
      break;

    case "npc.context":
      store.addNpcContext(message.id, sessionId, payload, receivedAt);
      break;

    case "capture.status":
      broadcast("capture.status", payload, sessionId);
      break;

    default:
      sendError(ws, `Nachrichtentyp '${message.type}' ist im Companion-Skeleton noch nicht implementiert.`, "unsupported_type", sessionId);
      break;
  }
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);

  if (req.method === "GET" && url.pathname === "/health") {
    const body = JSON.stringify({
      ok: true,
      service: "dm-cockpit-companion",
      serviceVersion: SERVICE_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      websocket: `ws://${HOST}:${PORT}${WS_PATH}`,
      connectedClients: clients.size,
      databasePath: DB_PATH,
      stats: store.stats()
    });
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(body);
    return;
  }

  res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ ok: false, error: "not_found" }));
});

const wss = new WebSocketServer({
  noServer: true,
  clientTracking: false,
  maxPayload: 1024 * 1024,
  perMessageDeflate: false
});

httpServer.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (url.pathname !== WS_PATH) {
    socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, ws => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", ws => {
  clients.add(ws);
  console.log(`[companion] Foundry verbunden (${clients.size} Client${clients.size === 1 ? "" : "s"}).`);

  ws.on("message", raw => {
    let message;
    try {
      message = JSON.parse(raw.toString("utf8"));
    } catch (_error) {
      sendError(ws, "Ungültiges JSON.", "invalid_json");
      return;
    }

    try {
      handleProtocolMessage(ws, message);
    } catch (error) {
      console.error("[companion] Protokollfehler", error);
      sendError(ws, error?.message || "Interner Companion-Fehler.", "internal_error", message?.sessionId ?? null);
    }
  });

  ws.on("error", error => console.warn("[companion] WebSocket-Fehler", error.message));
  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[companion] Foundry getrennt (${clients.size} Clients).`);
  });
});

httpServer.listen(PORT, HOST, () => {
  console.log("DM Cockpit Companion gestartet");
  console.log(`  WebSocket: ws://${HOST}:${PORT}${WS_PATH}`);
  console.log(`  Health:    http://${HOST}:${PORT}/health`);
  console.log(`  SQLite:    ${DB_PATH}`);
});

function shutdown(signal) {
  console.log(`\n[companion] ${signal} – fahre herunter …`);
  for (const ws of clients) {
    try {
      ws.close(1001, "Companion shutdown");
    } catch (_error) {
      // Ignorieren.
    }
  }
  wss.close();
  httpServer.close(() => {
    store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
