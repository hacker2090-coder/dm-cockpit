import assert from "node:assert/strict";
import { OllamaExtractionProvider } from "./ai-extraction-ollama.js";

let captured = null;
const fakeFetch = async (url, options) => {
  captured = { url, options, body: JSON.parse(options.body) };
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        model: "qwen3:4b",
        done: true,
        message: {
          role: "assistant",
          content: JSON.stringify({
            npcCandidates: [{ kind: "promise", text: "Der Händler verspricht, morgen zurückzukommen.", confidence: 0.91 }],
            sessionEventCandidates: [{ kind: "task", text: "Morgen zum Händler zurückkehren.", confidence: 0.88 }]
          })
        }
      };
    }
  };
};

const provider = new OllamaExtractionProvider({ fetchImpl: fakeFetch, timeoutMs: 5000 });
assert.deepEqual(provider.missingConfiguration(), []);
assert.equal(provider.snapshot().provider, "ollama");
assert.equal(provider.snapshot().model, "qwen3:4b");
assert.equal(provider.snapshot().localEndpoint, true);
assert.equal(provider.snapshot().externalDataTransfer, false);
assert.equal(provider.snapshot().apiKeyRequired, false);

const result = await provider.extract({
  sessionId: "session-test",
  segment: { segmentId: "seg-1", speakerName: "GM", text: "Ich verspreche, morgen zurückzukommen.", final: true },
  npcContext: { actorId: "actor-1", actorUuid: "Actor.actor-1", actorName: "Händler", source: "cockpit" }
});

assert.equal(captured.url, "http://127.0.0.1:11434/api/chat");
assert.equal(captured.body.model, "qwen3:4b");
assert.equal(captured.body.stream, false);
assert.equal(captured.body.think, false);
assert.equal(captured.body.options.temperature, 0);
assert.equal(captured.body.options.seed, 42);
assert.equal(captured.body.options.num_ctx, 8192);
assert.equal(captured.body.format.type, "object");
assert.equal(result.npcCandidates[0].actorId, "actor-1");
assert.equal(result.npcCandidates[0].kind, "promise");
assert.equal(result.sessionEventCandidates[0].kind, "task");

const noNpcResult = await provider.extract({
  segment: { segmentId: "seg-2", speakerName: "Spieler", text: "Wir entscheiden, nach Norden zu gehen.", final: true },
  npcContext: null
});
assert.equal(noNpcResult.npcCandidates.length, 0, "Ohne Foundry-NPC-Kontext darf kein NPC-Kandidat entstehen.");

const remote = new OllamaExtractionProvider({ endpoint: "http://192.168.1.10:11434/api/chat", fetchImpl: fakeFetch });
assert.equal(remote.snapshot().localEndpoint, false);
assert.equal(remote.snapshot().externalDataTransfer, true);

console.log("Ollama-AI-Adapter-Test erfolgreich.");
console.log("Bestätigt: lokaler API-Payload, qwen3:4b, think=false, Structured Output, Temperatur 0, Actor-Zuordnung aus Foundry-Kontext, keine API-Key-Pflicht.");
