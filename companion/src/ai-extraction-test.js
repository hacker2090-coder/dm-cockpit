import assert from "node:assert/strict";
import { AiExtractionService } from "./ai-extraction-service.js";

const emitted = [];
const service = new AiExtractionService({
  providerName: "mock",
  onCandidate: async (type, payload, context) => {
    emitted.push({ type, payload, context });
  }
});

service.start();

const segment = {
  segmentId: "seg_ai_test_001",
  discordUserId: "user_test",
  speakerName: "Testspieler",
  startedAt: "2026-08-09T11:00:00.000Z",
  endedAt: "2026-08-09T11:00:06.000Z",
  text: "Ich verspreche dem Händler, morgen zurückzukommen.",
  final: true,
  language: "de",
  provider: "test",
  confidence: 1
};

const context = {
  sessionId: "session_ai_test",
  npcContext: {
    actorId: "actor_händler",
    actorUuid: "Actor.actor_händler",
    name: "Händler"
  }
};

const result = await service.submit(segment, context);
assert.equal(result.status, "ok");
assert.equal(emitted.length, 2);

const npc = emitted.find(entry => entry.type === "npc.memory.candidate");
const session = emitted.find(entry => entry.type === "session.event.candidate");

assert.ok(npc, "NPC-Memory-Kandidat fehlt.");
assert.ok(session, "Session-Event-Kandidat fehlt.");
assert.equal(npc.payload.kind, "promise");
assert.equal(npc.payload.actorId, "actor_händler");
assert.equal(npc.payload.actorUuid, "Actor.actor_händler");
assert.deepEqual(npc.payload.sourceSegmentIds, [segment.segmentId]);
assert.equal(npc.payload.provider, "mock");
assert.equal(npc.payload.model, "deterministic-v1");
assert.equal(npc.payload.status, "pending");

assert.equal(session.payload.kind, "task");
assert.deepEqual(session.payload.sourceSegmentIds, [segment.segmentId]);
assert.equal(session.payload.provider, "mock");
assert.equal(session.payload.model, "deterministic-v1");
assert.equal(session.payload.status, "pending");

const duplicate = await service.submit(segment, context);
assert.equal(duplicate.status, "ignored");
assert.equal(duplicate.reason, "duplicate_segment");
assert.equal(emitted.length, 2, "Duplikat darf keine weiteren Kandidaten erzeugen.");

const partial = await service.submit({ ...segment, segmentId: "seg_ai_partial", final: false }, context);
assert.equal(partial.status, "ignored");
assert.equal(emitted.length, 2, "Partials dürfen keine Kandidaten erzeugen.");

const noNpcResult = await service.submit({
  ...segment,
  segmentId: "seg_ai_no_npc",
  text: "Wir haben entschieden, den Nordweg zu nehmen."
}, { sessionId: "session_ai_test", npcContext: null });
assert.equal(noNpcResult.status, "ok");
assert.equal(emitted.filter(entry => entry.type === "npc.memory.candidate").length, 1);
assert.equal(emitted.filter(entry => entry.type === "session.event.candidate").length, 2);
assert.equal(emitted.at(-1).payload.kind, "decision");

console.log("AI-Extraction-Test erfolgreich.");
console.log("Bestätigt: provider-neutraler Service, Mock-Provider, NPC-/Session-Kandidaten, Quellenbindung, NPC-Kontext, Final-only und Deduplizierung.");
