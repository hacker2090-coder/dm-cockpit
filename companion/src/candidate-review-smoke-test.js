import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

const PROTOCOL_VERSION = "1.0";
const WS_URL = process.env.DM_COCKPIT_WS_URL?.trim() || "ws://127.0.0.1:43170/v1";
const sessionId = `candidate-review-${Date.now()}`;
const actorId = `actor_${randomUUID()}`;
const npcCandidateId = `cand_${randomUUID()}`;
const sessionCandidateId = `cand_${randomUUID()}`;

function envelope(type, payload = {}) {
  return {
    v: PROTOCOL_VERSION,
    type,
    id: `candidate_review_test_${randomUUID()}`,
    ts: new Date().toISOString(),
    sessionId,
    payload
  };
}

function send(ws, type, payload = {}) {
  ws.send(JSON.stringify(envelope(type, payload)));
}

const ws = new WebSocket(WS_URL, { perMessageDeflate: false });
let npcBroadcast = false;
let sessionBroadcast = false;
let npcReviewed = false;
let sessionReviewed = false;
let acceptedListVerified = false;
let finished = false;

const timeout = setTimeout(() => {
  if (finished) return;
  console.error("Candidate-Review-Smoke-Test fehlgeschlagen: Timeout.");
  ws.terminate();
  process.exitCode = 1;
}, 12000);

function maybeReview() {
  if (!npcBroadcast || !sessionBroadcast) return;
  if (!npcReviewed) {
    send(ws, "candidate.review", {
      candidateType: "npc.memory.candidate",
      candidateId: npcCandidateId,
      status: "accepted"
    });
  }
  if (!sessionReviewed) {
    send(ws, "candidate.review", {
      candidateType: "session.event.candidate",
      candidateId: sessionCandidateId,
      status: "rejected"
    });
  }
}

function maybeRequestAcceptedList() {
  if (!npcReviewed || !sessionReviewed || acceptedListVerified) return;
  send(ws, "candidates.list.request", { status: "accepted", sessionId, limit: 20 });
}

ws.on("open", () => {
  console.log(`Candidate-Review-Smoke-Test verbunden: ${WS_URL}`);
  send(ws, "hello", { client: "dm-cockpit-candidate-review-test", protocolVersion: PROTOCOL_VERSION });
  send(ws, "session.started", { sessionId, startedAt: new Date().toISOString(), capturePolicy: "notice_only" });
  send(ws, "npc.memory.candidate", {
    candidateId: npcCandidateId,
    actorId,
    actorUuid: `Actor.${actorId}`,
    text: "Der Händler verspricht der Gruppe einen Schlüssel.",
    kind: "promise",
    sourceSegmentIds: [`seg_${randomUUID()}`],
    confidence: 0.91,
    provider: "review-test",
    model: "deterministic",
    status: "pending",
    createdAt: new Date().toISOString()
  });
  send(ws, "session.event.candidate", {
    candidateId: sessionCandidateId,
    text: "Die Gruppe will morgen zurückkehren.",
    kind: "task",
    sourceSegmentIds: [`seg_${randomUUID()}`],
    confidence: 0.88,
    provider: "review-test",
    model: "deterministic",
    status: "pending",
    createdAt: new Date().toISOString()
  });
});

ws.on("message", raw => {
  let message;
  try {
    message = JSON.parse(raw.toString("utf8"));
  } catch (_error) {
    return;
  }

  if (message.type === "npc.memory.candidate" && message.payload?.candidateId === npcCandidateId) {
    npcBroadcast = true;
    console.log("NPC-Kandidat als pending empfangen.");
    maybeReview();
    return;
  }

  if (message.type === "session.event.candidate" && message.payload?.candidateId === sessionCandidateId) {
    sessionBroadcast = true;
    console.log("Session-Kandidat als pending empfangen.");
    maybeReview();
    return;
  }

  if (message.type === "candidate.reviewed") {
    if (message.payload?.candidateId === npcCandidateId && message.payload?.status === "accepted") {
      npcReviewed = true;
      console.log("NPC-Kandidat als accepted bestätigt.");
    }
    if (message.payload?.candidateId === sessionCandidateId && message.payload?.status === "rejected") {
      sessionReviewed = true;
      console.log("Session-Kandidat als rejected bestätigt.");
    }
    maybeRequestAcceptedList();
    return;
  }

  if (message.type === "candidates.list.result" && message.payload?.status === "accepted" && !acceptedListVerified) {
    const npc = Array.isArray(message.payload?.npcCandidates) ? message.payload.npcCandidates : [];
    const match = npc.find(candidate => candidate.candidateId === npcCandidateId && candidate.status === "accepted");
    if (!match) return;
    acceptedListVerified = true;
    console.log("Persistierter accepted-NPC-Kandidat per Liste bestätigt.");
    send(ws, "candidates.list.request", { status: "rejected", sessionId, limit: 20 });
    return;
  }

  if (message.type === "candidates.list.result" && message.payload?.status === "rejected" && acceptedListVerified) {
    const events = Array.isArray(message.payload?.sessionEventCandidates) ? message.payload.sessionEventCandidates : [];
    const match = events.find(candidate => candidate.candidateId === sessionCandidateId && candidate.status === "rejected");
    if (!match || finished) return;

    finished = true;
    clearTimeout(timeout);
    console.log("Persistierter rejected-Session-Kandidat per Liste bestätigt.");
    console.log("Candidate-Review-Smoke-Test erfolgreich: pending -> review -> SQLite-Status -> list result bestätigt.");
    send(ws, "session.ended", { endedAt: new Date().toISOString() });
    setTimeout(() => ws.close(1000, "Candidate-Review-Test fertig"), 100);
  }
});

ws.on("error", error => {
  clearTimeout(timeout);
  console.error(`Candidate-Review-Smoke-Test fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});

ws.on("close", () => {
  clearTimeout(timeout);
  if (!finished && process.exitCode !== 1) {
    console.error("Candidate-Review-Smoke-Test fehlgeschlagen: Verbindung vor Abschluss beendet.");
    process.exitCode = 1;
  }
});
