import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

const PROTOCOL_VERSION = "1.0";
const WS_URL = process.env.DM_COCKPIT_WS_URL?.trim() || "ws://127.0.0.1:43170/v1";
const sessionId = `change-record-${Date.now()}`;
const actorId = `actor_${randomUUID()}`;
const candidateId = `cand_${randomUUID()}`;
const changeId = `change_${randomUUID()}`;

const before = [
  { id: "memory_old", text: "Alter Testeintrag", createdAt: 1 }
];
const after = [
  ...before,
  { id: "memory_new", text: "Neuer Testeintrag", createdAt: 2 }
];

function envelope(type, payload = {}) {
  return {
    v: PROTOCOL_VERSION,
    type,
    id: `change_record_test_${randomUUID()}`,
    ts: new Date().toISOString(),
    sessionId,
    payload
  };
}

function send(ws, type, payload = {}) {
  ws.send(JSON.stringify(envelope(type, payload)));
}

const ws = new WebSocket(WS_URL, { perMessageDeflate: false });
let recordPersisted = false;
let readyReceived = false;
let undoneReceived = false;
let listVerified = false;
let alreadyUndoneVerified = false;
let finished = false;

const timeout = setTimeout(() => {
  if (finished) return;
  console.error("Change-Record-Smoke-Test fehlgeschlagen: Timeout.");
  ws.terminate();
  process.exitCode = 1;
}, 12000);

ws.on("open", () => {
  console.log(`Change-Record-Smoke-Test verbunden: ${WS_URL}`);
  send(ws, "hello", { client: "dm-cockpit-change-record-test", protocolVersion: PROTOCOL_VERSION });
  send(ws, "session.started", { sessionId, startedAt: new Date().toISOString(), capturePolicy: "notice_only" });
  send(ws, "npc.memory.candidate", {
    candidateId,
    actorId,
    actorUuid: `Actor.${actorId}`,
    text: "Testeintrag für Undo.",
    kind: "statement",
    sourceSegmentIds: [`seg_${randomUUID()}`],
    confidence: 1,
    provider: "change-record-test",
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

  if (message.type === "npc.memory.candidate" && message.payload?.candidateId === candidateId) {
    send(ws, "candidate.review", {
      candidateType: "npc.memory.candidate",
      candidateId,
      status: "accepted"
    });
    return;
  }

  if (message.type === "candidate.reviewed" && message.payload?.candidateId === candidateId) {
    send(ws, "npc.memory.applied", {
      changeId,
      actorId,
      flagPath: "flags.dm-cockpit.actionMemory",
      before,
      after,
      sourceCandidateId: candidateId,
      createdAt: new Date().toISOString()
    });
    return;
  }

  if (message.type === "npc.memory.applied" && message.payload?.changeId === changeId && !recordPersisted) {
    recordPersisted = true;
    console.log("Change-Record persistent bestätigt.");
    send(ws, "candidates.list.request", { status: "accepted", sessionId, limit: 20 });
    return;
  }

  if (message.type === "candidates.list.result" && recordPersisted && !listVerified) {
    const candidates = Array.isArray(message.payload?.npcCandidates) ? message.payload.npcCandidates : [];
    const match = candidates.find(candidate => candidate.candidateId === candidateId);
    if (!match || match.changeId !== changeId || match.undoneAt) return;
    listVerified = true;
    console.log("Change-ID am accepted Kandidaten per Liste bestätigt.");
    send(ws, "change.undo.request", { changeId });
    return;
  }

  if (message.type === "change.undo.result" && message.payload?.changeId === changeId && message.payload?.status === "ready" && !readyReceived) {
    if (JSON.stringify(message.payload.before) !== JSON.stringify(before)) return;
    if (JSON.stringify(message.payload.after) !== JSON.stringify(after)) return;
    readyReceived = true;
    console.log("Undo-Vorher/Nachher-Zustand bereitgestellt.");
    send(ws, "change.undo.result", {
      changeId,
      status: "undone",
      undoneAt: new Date().toISOString()
    });
    return;
  }

  if (message.type === "change.undo.result" && message.payload?.changeId === changeId && message.payload?.status === "undone" && !undoneReceived) {
    undoneReceived = true;
    console.log("Undo als persistent rückgängig bestätigt.");
    send(ws, "change.undo.request", { changeId });
    return;
  }

  if (message.type === "change.undo.result" && message.payload?.changeId === changeId && message.payload?.status === "already_undone" && !alreadyUndoneVerified) {
    alreadyUndoneVerified = true;
    finished = true;
    clearTimeout(timeout);
    console.log("Doppeltes Undo wird sicher als bereits rückgängig erkannt.");
    console.log("Change-Record-Smoke-Test erfolgreich: persist -> list -> undo ready -> undone -> idempotent bestätigt.");
    send(ws, "session.ended", { endedAt: new Date().toISOString() });
    setTimeout(() => ws.close(1000, "Change-Record-Test fertig"), 100);
  }
});

ws.on("error", error => {
  clearTimeout(timeout);
  console.error(`Change-Record-Smoke-Test fehlgeschlagen: ${error.message}`);
  process.exitCode = 1;
});

ws.on("close", () => {
  clearTimeout(timeout);
  if (!finished && process.exitCode !== 1) {
    console.error("Change-Record-Smoke-Test fehlgeschlagen: Verbindung vor Abschluss beendet.");
    process.exitCode = 1;
  }
});
