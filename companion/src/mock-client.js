import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

const PROTOCOL_VERSION = "1.0";
const URL = process.env.DM_COCKPIT_WS_URL?.trim() || "ws://127.0.0.1:43170/v1";
const sessionId = `mock-session-${Date.now()}`;

function envelope(type, payload = {}, currentSessionId = sessionId) {
  return {
    v: PROTOCOL_VERSION,
    type,
    id: `mock_${randomUUID()}`,
    ts: new Date().toISOString(),
    sessionId: currentSessionId,
    payload
  };
}

function send(ws, type, payload = {}, currentSessionId = sessionId) {
  ws.send(JSON.stringify(envelope(type, payload, currentSessionId)));
}

const ws = new WebSocket(URL);
let receivedBroadcast = false;

const timeout = setTimeout(() => {
  console.error("Mock-Test fehlgeschlagen: keine Antwort vom Companion Service.");
  ws.terminate();
  process.exitCode = 1;
}, 5000);

ws.on("open", () => {
  console.log(`Mock-Client verbunden: ${URL}`);
  send(ws, "hello", {
    client: "dm-cockpit-companion-mock",
    protocolVersion: PROTOCOL_VERSION
  }, null);

  send(ws, "session.started", {
    sessionId,
    startedAt: new Date().toISOString(),
    capturePolicy: "notice_only"
  });

  send(ws, "speaker.upserted", {
    discordUserId: "mock-companion-user-1",
    displayName: "Companion Mock",
    globalName: "Companion Mock",
    isBot: false
  });

  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - 4200);
  send(ws, "transcript.segment", {
    segmentId: `seg_${randomUUID()}`,
    discordUserId: "mock-companion-user-1",
    speakerName: "Companion Mock",
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    text: "Dieser Satz kam über den echten lokalen Companion-WebSocket und wurde in SQLite gespeichert.",
    final: true,
    language: "de",
    provider: "local-mock",
    confidence: 1
  });
});

ws.on("message", raw => {
  let message;
  try {
    message = JSON.parse(raw.toString("utf8"));
  } catch (_error) {
    return;
  }

  if (message.type === "hello.ack") {
    console.log(`Handshake OK: Companion ${message.payload?.serviceVersion ?? "?"}`);
  }

  if (message.type === "transcript.segment" && message.payload?.provider === "local-mock") {
    receivedBroadcast = true;
    console.log("Mock-Segment wurde vom Companion zurückgesendet und persistiert.");
    send(ws, "session.ended", { endedAt: new Date().toISOString() });
    clearTimeout(timeout);
    setTimeout(() => ws.close(1000, "Mock-Test fertig"), 100);
  }
});

ws.on("close", () => {
  clearTimeout(timeout);
  if (!receivedBroadcast) {
    console.error("Mock-Test fehlgeschlagen: Segment-Broadcast nicht empfangen.");
    process.exitCode = 1;
  } else {
    console.log("Mock-Test erfolgreich.");
  }
});

ws.on("error", error => {
  clearTimeout(timeout);
  console.error(`Mock-Test fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
