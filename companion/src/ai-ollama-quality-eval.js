import { performance } from "node:perf_hooks";
import { OllamaExtractionProvider } from "./ai-extraction-ollama.js";

const cases = [
  {
    id: "npc-promise-task",
    text: "Der Händler sagt: Ich verspreche euch, morgen die Karte zu geben. Wir kommen morgen zurück.",
    npc: { actorId: "actor-merchant", actorName: "Händler", source: "cockpit" },
    requireNpc: ["promise"],
    requireSession: ["task"]
  },
  {
    id: "session-decision",
    text: "Wir entscheiden uns für den Nordweg und lassen die alte Straße hinter uns.",
    npc: null,
    requireNpc: [],
    requireSession: ["decision"]
  },
  {
    id: "loot",
    text: "Die Gruppe nimmt den silbernen Schlüssel und 40 Goldstücke aus der Truhe.",
    npc: null,
    requireNpc: [],
    requireSession: ["loot"]
  },
  {
    id: "combat",
    text: "Der Kampf gegen die drei Ghule beginnt, als die Tür aufbricht.",
    npc: null,
    requireNpc: [],
    requireSession: ["combat"]
  },
  {
    id: "open-question",
    text: "Wir wissen noch nicht, wer den Baron vergiftet hat.",
    npc: null,
    requireNpc: [],
    requireSession: ["open_question"]
  },
  {
    id: "npc-knowledge",
    text: "Mira erfährt, dass der Geheimgang hinter dem Kamin liegt.",
    npc: { actorId: "actor-mira", actorName: "Mira", source: "cockpit" },
    requireNpc: ["knowledge"],
    requireSession: []
  },
  {
    id: "npc-relationship",
    text: "Hauptmann Rell erklärt, dass er der Schwester des Bürgermeisters seit Jahren vertraut.",
    npc: { actorId: "actor-rell", actorName: "Hauptmann Rell", source: "cockpit" },
    requireNpc: ["relationship"],
    requireSession: []
  },
  {
    id: "deadline",
    text: "Der Auftrag muss vor Sonnenaufgang morgen abgeschlossen sein.",
    npc: { actorId: "actor-questgiver", actorName: "Auftraggeber", source: "cockpit" },
    requireNpc: ["deadline"],
    requireSession: ["task"]
  },
  {
    id: "consequence",
    text: "Weil die Gruppe den Alarm ausgelöst hat, werden die Stadttore jetzt geschlossen.",
    npc: { actorId: "actor-guard", actorName: "Wache", source: "cockpit" },
    requireNpc: ["consequence"],
    requireSession: ["event"]
  },
  {
    id: "explicit-lie",
    text: "Der Spion weiß, dass der Pass sicher ist, behauptet aber bewusst: Der Pass ist vermint.",
    npc: { actorId: "actor-spy", actorName: "Spion", source: "cockpit" },
    requireNpc: ["lie"],
    requireSession: []
  },
  {
    id: "banter-noise",
    text: "Okay, ich hole mir kurz etwas zu trinken. Bin gleich wieder da.",
    npc: null,
    requireNpc: [],
    requireSession: [],
    expectEmpty: true
  },
  {
    id: "no-npc-context",
    text: "Der Händler verspricht, morgen die Karte zu geben.",
    npc: null,
    requireNpc: [],
    requireSession: [],
    forbidNpc: true
  }
];

function kinds(items) {
  return new Set((Array.isArray(items) ? items : []).map(item => String(item?.kind ?? "")));
}

function hasAll(actual, required) {
  return required.every(kind => actual.has(kind));
}

const provider = new OllamaExtractionProvider();
const snapshot = provider.snapshot();
if (provider.missingConfiguration().length) {
  console.error(`Ollama-Qualitätstest nicht ausführbar: ${provider.missingConfiguration().join(", ")}`);
  process.exit(1);
}

console.log(`Ollama-Qualitätstest: ${snapshot.model}`);
console.log(`Endpoint: ${snapshot.endpoint}`);
console.log(`Fälle: ${cases.length}`);

let passed = 0;
const durations = [];

for (const testCase of cases) {
  const started = performance.now();
  let result;
  try {
    result = await provider.extract({
      sessionId: `quality-${testCase.id}`,
      segment: {
        segmentId: `quality-${testCase.id}`,
        discordUserId: "quality-test-user",
        speakerName: "Qualitätstest",
        text: testCase.text,
        final: true
      },
      npcContext: testCase.npc
    });
  } catch (error) {
    const elapsed = performance.now() - started;
    durations.push(elapsed);
    console.log(`FAIL ${testCase.id} (${Math.round(elapsed)} ms): ${error?.message ?? error}`);
    continue;
  }

  const elapsed = performance.now() - started;
  durations.push(elapsed);
  const npcKinds = kinds(result.npcCandidates);
  const sessionKinds = kinds(result.sessionEventCandidates);

  const requiredOk = hasAll(npcKinds, testCase.requireNpc) && hasAll(sessionKinds, testCase.requireSession);
  const emptyOk = !testCase.expectEmpty || (npcKinds.size === 0 && sessionKinds.size === 0);
  const npcGuardOk = !testCase.forbidNpc || npcKinds.size === 0;
  const ok = requiredOk && emptyOk && npcGuardOk;

  if (ok) passed += 1;

  const npcText = [...npcKinds].join(",") || "-";
  const sessionText = [...sessionKinds].join(",") || "-";
  console.log(`${ok ? "PASS" : "FAIL"} ${testCase.id} (${Math.round(elapsed)} ms) | NPC=${npcText} | Session=${sessionText}`);
}

const sorted = [...durations].sort((a, b) => a - b);
const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : 0;
const score = cases.length ? (passed / cases.length) * 100 : 0;
const minimum = Math.max(0, Math.min(100, Number.parseInt(process.env.OLLAMA_QUALITY_MIN_PERCENT || "80", 10) || 80));

console.log("");
console.log(`Ergebnis: ${passed}/${cases.length} = ${score.toFixed(1)}%`);
console.log(`Ø Laufzeit: ${Math.round(avg)} ms | P95: ${Math.round(p95)} ms`);
console.log(`Qualitätsgrenze: ${minimum}%`);

if (score < minimum) {
  console.error("Ollama-Qualitätstest unter Mindestgrenze.");
  process.exit(1);
}

console.log("Ollama-Qualitätstest bestanden.");
