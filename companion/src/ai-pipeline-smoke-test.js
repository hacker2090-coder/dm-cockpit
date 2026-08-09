import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

const PROTOCOL_VERSION = "1.0";
const WS_URL = process.env.DM_COCKPIT_WS_URL?.trim() || "ws://127.0.0.1:43170/v1";
const HEALTH_URL = process.env.DM_COCKPIT_HEALTH_URL?.trim() || "http://127.0.0.1:43170/health";
const EXPECT_PROVIDER = process.env.AI_PIPELINE_EXPECT_PROVIDER?.trim() || "mock";
const TEST_TEXT = process.env.AI_PIPELINE_TEST_TEXT?.trim() || "Ich verspreche dem Händler, morgen zurückzukommen.";
const TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.AI_PIPELINE_TIMEOUT_MS || "6000", 10) || 6000);
const PERSIST_TIMEOUT_MS = Math.max(3000, Number.parseInt(process.env.AI_PIPELINE_PERSIST_TIMEOUT_MS || String(TIMEOUT_MS), 10) || TIMEOUT_MS);
const sessionId = `ai-pipeline-${Date.now()}`;
const segmentId = `seg_${randomUUID()}`;
const actorId = `actor_${randomUUID()}`;

function envelope(type, payload = {}) {
  return {
    v: PROTOCOL_VERSION,
    type,
    id: `ai_test_${randomUUID()}`,
    ts: new Date().toISOString(),
    sessionId,
    payload
  };
}

function send(ws, type, payload = {}) {
  ws.send(JSON.stringify(envelope(type, payload)));
}

async function health() {
  const response = await fetch(HEALTH_URL);
  if (!response.ok) throw new Error(`Health HTTP ${response.status}`);
  return response.json();
}

async function waitForPersisted(before, timeoutMs = PERSIST_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await health();
    if (
      Number(current?.stats?.npcCandidates ?? 0) > Number(before?.stats?.npcCandidates ?? 0)
      && Number(current?.stats?.sessionEventCandidates ?? 0) > Number(before?.stats?.sessionEventCandidates ?? 0)
    ) return current;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("Kandidaten wurden nicht rechtzeitig in SQLite sichtbar.");
}

const before = await health();
const ws = new WebSocket(WS_URL, { perMessageDeflate: false });
let npcCandidate = null;
let sessionCandidate = null;
let finished = false;

const timeout = setTimeout(() => {
  if (finished) return;
  console.error(`AI-Pipeline-Test fehlgeschlagen: keine automatischen '${EXPECT_PROVIDER}'-Kandidaten empfangen. Läuft der Companion mit AI_PROVIDER=${EXPECT_PROVIDER}?`);
  ws.terminate();
  process.exitCode = 1;
}, TIMEOUT_MS);

async function finishIfComplete() {
  if (finished || !npcCandidate || !sessionCandidate) return;
  finished = true;
  clearTimeout(timeout);

  try {
    const after = await waitForPersisted(before);
    console.log(`NPC Candidates: ${before.stats.npcCandidates} -> ${after.stats.npcCandidates}`);
    console.log(`Session Event Candidates: ${before.stats.sessionEventCandidates} -> ${after.stats.sessionEventCandidates}`);
    console.log(`AI-Pipeline-Smoke-Test erfolgreich (${EXPECT_PROVIDER}): transcript.segment -> Extraktion -> Protocol v1 -> Broadcast -> SQLite bestätigt.`);
    send(ws, "session.ended", { endedAt: new Date().toISOString() });
    setTimeout(() => ws.close(1000, "AI-Pipeline-Test fertig"), 100);
  } catch (error) {
    console.error(`AI-Pipeline-Test fehlgeschlagen: ${error.message}`);
    process.exitCode = 1;
    ws.close(1011, "Persistenztest fehlgeschlagen");
  }
}

ws.on("open", () => {
  console.log(`AI-Pipeline-Test verbunden: ${WS_URL}`);
  console.log(`Erwarteter AI-Provider: ${EXPECT_PROVIDER}`);
  send(ws, "hello", { client: "dm-cockpit-ai-pipeline-test", protocolVersion: PROTOCOL_VERSION });
  send(ws, "session.started", {
    sessionId,
    startedAt: new Date().toISOString(),
    capturePolicy: "notice_only"
  });
  send(ws, "npc.context", {
    source: "cockpit",
    actorId,
    actorUuid: `Actor.${actorId}`,
    actorName: "Testhändler",
    changedAt: new Date().toISOString()
  });

  const endedAt = new Date();
  const startedAt = new Date(endedAt.getTime() - 5000);
  send(ws, "transcript.segment", {
    segmentId,
    discordUserId: "ai-pipeline-test-user",
    speakerName: "AI Pipeline Test",
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    text: TEST_TEXT,
    final: true,
    language: "de",
    provider: "pipeline-test",
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

  const sources = Array.isArray(message.payload?.sourceSegmentIds) ? message.payload.sourceSegmentIds : [];
  if (!sources.includes(segmentId) || message.payload?.provider !== EXPECT_PROVIDER) return;

  if (message.type === "npc.memory.candidate" && message.payload?.actorId === actorId) {
    npcCandidate = message.payload;
    console.log(`NPC-Memory-Kandidat empfangen: ${npcCandidate.kind}`);
  }
  if (message.type === "session.event.candidate") {
    sessionCandidate = message.payload;
    console.log(`Session-Event-Kandidat empfangen: ${sessionCandidate.kind}`);
  }
  void finishIfComplete();
});

ws.on("error", error => {
  clearTimeout(timeout);
  console.error(`AI-Pipeline-Test fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});

ws.on("close", () => {
  clearTimeout(timeout);
  if (!finished && process.exitCode !== 1) {
    console.error("AI-Pipeline-Test fehlgeschlagen: Verbindung wurde vor Abschluss beendet.");
    process.exitCode = 1;
  }
});
