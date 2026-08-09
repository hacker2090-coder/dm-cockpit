import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

const PROTOCOL_VERSION = "1.0";
const WS_URL = process.env.DM_COCKPIT_WS_URL?.trim() || "ws://127.0.0.1:43170/v1";
const HEALTH_URL = process.env.DM_COCKPIT_HEALTH_URL?.trim() || "http://127.0.0.1:43170/health";
const sessionId = `candidate-smoke-${Date.now()}`;
const npcCandidateId = `npc_${randomUUID()}`;
const sessionCandidateId = `session_${randomUUID()}`;

function envelope(type, payload = {}, currentSessionId = sessionId) {
  return {
    v: PROTOCOL_VERSION,
    type,
    id: `smoke_${randomUUID()}`,
    ts: new Date().toISOString(),
    sessionId: currentSessionId,
    payload
  };
}

async function readHealth() {
  const response = await fetch(HEALTH_URL);
  if (!response.ok) throw new Error(`Health HTTP ${response.status}`);
  return response.json();
}

const before = await readHealth();
const beforeNpc = Number(before?.stats?.npcCandidates ?? -1);
const beforeSession = Number(before?.stats?.sessionEventCandidates ?? -1);

if (beforeNpc < 0 || beforeSession < 0) {
  throw new Error("Health enthält die Candidate-Zähler nicht.");
}

const ws = new WebSocket(WS_URL);
const received = new Set();

const timeout = setTimeout(() => {
  console.error("Candidate-Smoke-Test fehlgeschlagen: Timeout.");
  ws.terminate();
  process.exitCode = 1;
}, 7000);

function send(type, payload = {}, currentSessionId = sessionId) {
  ws.send(JSON.stringify(envelope(type, payload, currentSessionId)));
}

async function finishIfComplete() {
  if (!received.has("npc") || !received.has("session")) return;

  await new Promise(resolve => setTimeout(resolve, 150));
  const after = await readHealth();
  const afterNpc = Number(after?.stats?.npcCandidates ?? -1);
  const afterSession = Number(after?.stats?.sessionEventCandidates ?? -1);

  if (afterNpc < beforeNpc + 1) {
    throw new Error(`NPC-Candidate-Zähler stieg nicht: ${beforeNpc} -> ${afterNpc}`);
  }
  if (afterSession < beforeSession + 1) {
    throw new Error(`Session-Candidate-Zähler stieg nicht: ${beforeSession} -> ${afterSession}`);
  }

  console.log(`NPC Candidates: ${beforeNpc} -> ${afterNpc}`);
  console.log(`Session Event Candidates: ${beforeSession} -> ${afterSession}`);
  console.log("Candidate-Smoke-Test erfolgreich: Protocol v1, Broadcast und SQLite-Persistenz bestätigt.");

  clearTimeout(timeout);
  ws.close(1000, "Candidate-Smoke-Test fertig");
}

ws.on("open", () => {
  console.log(`Candidate-Smoke-Test verbunden: ${WS_URL}`);

  send("hello", {
    client: "dm-cockpit-candidate-smoke-test",
    protocolVersion: PROTOCOL_VERSION
  }, null);

  send("session.started", {
    sessionId,
    startedAt: new Date().toISOString(),
    capturePolicy: "notice_only"
  });

  send("npc.memory.candidate", {
    candidateId: npcCandidateId,
    actorId: "candidate-smoke-test-actor",
    actorUuid: "Actor.candidate-smoke-test-actor",
    text: "Smoke-Test: NPC-Memory-Kandidat wurde persistiert.",
    kind: "knowledge",
    sourceSegmentIds: ["candidate-smoke-segment-npc"],
    confidence: 1,
    provider: "candidate-smoke-test",
    model: "none",
    status: "pending",
    createdAt: new Date().toISOString()
  });

  send("session.event.candidate", {
    candidateId: sessionCandidateId,
    text: "Smoke-Test: Session-Event-Kandidat wurde persistiert.",
    kind: "event",
    sourceSegmentIds: ["candidate-smoke-segment-session"],
    confidence: 1,
    provider: "candidate-smoke-test",
    model: "none",
    status: "pending",
    createdAt: new Date().toISOString()
  });
});

ws.on("message", raw => {
  let message;
  try {
    message = JSON.parse(raw.toString("utf8"));
  } catch {
    return;
  }

  if (message.type === "error") {
    console.error(`Companion-Fehler: ${message.payload?.code ?? "unknown"} - ${message.payload?.message ?? ""}`);
    process.exitCode = 1;
    clearTimeout(timeout);
    ws.close();
    return;
  }

  if (message.type === "npc.memory.candidate" && message.payload?.candidateId === npcCandidateId) {
    received.add("npc");
    console.log("NPC-Memory-Kandidat als Broadcast empfangen.");
  }

  if (message.type === "session.event.candidate" && message.payload?.candidateId === sessionCandidateId) {
    received.add("session");
    console.log("Session-Event-Kandidat als Broadcast empfangen.");
  }

  finishIfComplete().catch(error => {
    console.error(`Candidate-Smoke-Test fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
    clearTimeout(timeout);
    ws.close();
  });
});

ws.on("error", error => {
  clearTimeout(timeout);
  console.error(`Candidate-Smoke-Test fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});
