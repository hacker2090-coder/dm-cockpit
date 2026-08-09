import assert from "node:assert/strict";
import { OpenAiExtractionProvider } from "./ai-extraction-openai.js";

let captured = null;
const fakeFetch = async (url, options) => {
  captured = { url, options, body: JSON.parse(options.body) };
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              npcCandidates: [{ kind: "promise", text: "Der Händler verspricht, morgen zurückzukommen.", confidence: 0.93 }],
              sessionEventCandidates: [{ kind: "task", text: "Morgen zum Händler zurückkehren.", confidence: 0.89 }]
            })
          }]
        }]
      };
    }
  };
};

const provider = new OpenAiExtractionProvider({ apiKey: "test-key", fetchImpl: fakeFetch, timeoutMs: 5000 });
assert.deepEqual(provider.missingConfiguration(), []);
assert.equal(provider.snapshot().requestStorage, false);

const result = await provider.extract({
  sessionId: "session-test",
  segment: { segmentId: "seg-1", speakerName: "GM", text: "Ich verspreche, morgen zurückzukommen.", final: true },
  npcContext: { actorId: "actor-1", actorUuid: "Actor.actor-1", actorName: "Händler", source: "cockpit" }
});

assert.equal(captured.url, "https://api.openai.com/v1/responses");
assert.equal(captured.options.headers.authorization, "Bearer test-key");
assert.equal(captured.body.store, false);
assert.equal(captured.body.model, "gpt-5-nano");
assert.equal(captured.body.text.format.type, "json_schema");
assert.equal(captured.body.text.format.strict, true);
assert.equal(result.npcCandidates[0].actorId, "actor-1");
assert.equal(result.npcCandidates[0].kind, "promise");
assert.equal(result.sessionEventCandidates[0].kind, "task");

const noNpcResult = await provider.extract({
  segment: { segmentId: "seg-2", speakerName: "Spieler", text: "Wir entscheiden, nach Norden zu gehen.", final: true },
  npcContext: null
});
assert.equal(noNpcResult.npcCandidates.length, 0, "Ohne Foundry-NPC-Kontext darf kein NPC-Kandidat entstehen.");

const missing = new OpenAiExtractionProvider({ apiKey: "", fetchImpl: fakeFetch });
assert.deepEqual(missing.missingConfiguration(), ["OPENAI_API_KEY"]);

console.log("OpenAI-AI-Adapter-Test erfolgreich.");
console.log("Bestätigt: Responses API Payload, store=false, Strict Structured Output, Actor-Zuordnung aus Foundry-Kontext, lokale Nachvalidierung.");
