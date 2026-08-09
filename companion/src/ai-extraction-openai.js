const DEFAULT_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-5-nano";
const DEFAULT_TIMEOUT_MS = 20000;
const MAX_CANDIDATES_PER_TYPE = 8;

const NPC_KINDS = ["statement", "knowledge", "action", "relationship", "promise", "lie", "deadline", "consequence", "other"];
const SESSION_KINDS = ["decision", "quest", "task", "loot", "reward", "open_question", "combat", "event", "other"];

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    npcCandidates: {
      type: "array",
      maxItems: MAX_CANDIDATES_PER_TYPE,
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: NPC_KINDS },
          text: { type: "string", minLength: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["kind", "text", "confidence"],
        additionalProperties: false
      }
    },
    sessionEventCandidates: {
      type: "array",
      maxItems: MAX_CANDIDATES_PER_TYPE,
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: SESSION_KINDS },
          text: { type: "string", minLength: 1 },
          confidence: { type: "number", minimum: 0, maximum: 1 }
        },
        required: ["kind", "text", "confidence"],
        additionalProperties: false
      }
    }
  },
  required: ["npcCandidates", "sessionEventCandidates"],
  additionalProperties: false
};

const SYSTEM_INSTRUCTIONS = `Du bist die strukturierte Extraktionsstufe von DM Cockpit für deutschsprachige TTRPG-Sitzungen.
Analysiere genau ein finales Transkriptsegment und extrahiere nur spielrelevante Informationen, die durch dieses Segment ausdrücklich belegt sind.
Erfinde nichts, ergänze keine Weltfakten und leite keine versteckten Absichten ab.
Wenn etwas unsicher, beiläufig oder nicht spielrelevant ist, erzeuge keinen Kandidaten.

NPC-Kandidaten sind nur erlaubt, wenn ein aktueller NPC-Kontext angegeben ist und der Inhalt tatsächlich diesen NPC betrifft.
NPC-Kategorien: statement=Aussage/Fakt, knowledge=erlangtes Wissen, action=Handlung, relationship=Beziehung, promise=Versprechen/Zusage, lie=explizit als Lüge belegbar, deadline=Frist, consequence=Konsequenz, other=nur wenn keine Kategorie passt.

Session-Kategorien: decision=Entscheidung, quest=Quest/Auftrag, task=konkrete Aufgabe, loot=Loot/Gegenstand, reward=Belohnung, open_question=offene wichtige Frage, combat=Kampfereignis, event=anderes wichtiges Ereignis, other=nur wenn keine Kategorie passt.

Formuliere candidate.text kurz, eigenständig verständlich und auf Deutsch. Bewahre Namen, Orte, Fristen und konkrete Zusagen. Gib keine Meta-Erklärung außerhalb des vorgegebenen Schemas aus.`;

function env(name, fallback = "") {
  const value = String(process.env[name] ?? "").trim();
  return value || fallback;
}

function integerEnv(name, fallback, { min = 1000, max = 120000 } = {}) {
  const parsed = Number.parseInt(env(name, String(fallback)), 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function outputText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();

  for (const item of Array.isArray(response?.output) ? response.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === "refusal" && part.refusal) {
        throw new Error(`OpenAI-Antwort verweigert: ${part.refusal}`);
      }
      if (part?.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }
  throw new Error("OpenAI-Antwort enthielt keinen strukturierten Text.");
}

function buildInput({ segment, sessionId, npcContext }) {
  const npcActive = Boolean(npcContext?.actorId);
  return [
    `Session-ID: ${sessionId ?? "nicht gesetzt"}`,
    `Sprecher: ${cleanText(segment?.speakerName) || cleanText(segment?.discordUserId) || "unbekannt"}`,
    `Aktueller NPC-Kontext: ${npcActive ? "ja" : "nein"}`,
    npcActive ? `NPC-Name: ${cleanText(npcContext?.actorName) || "unbekannt"}` : null,
    npcActive ? `NPC-Quelle: ${cleanText(npcContext?.source) || "unbekannt"}` : null,
    "",
    "Finales Transkriptsegment:",
    cleanText(segment?.text)
  ].filter(line => line !== null).join("\n");
}

function normalizeCandidate(candidate, allowedKinds) {
  const kind = cleanText(candidate?.kind);
  const text = cleanText(candidate?.text);
  if (!allowedKinds.includes(kind) || !text) return null;
  return {
    kind,
    text,
    confidence: clampConfidence(candidate?.confidence)
  };
}

export class OpenAiExtractionProvider {
  constructor({
    apiKey = env("OPENAI_API_KEY"),
    model = env("OPENAI_AI_MODEL", DEFAULT_MODEL),
    endpoint = env("OPENAI_AI_ENDPOINT", DEFAULT_ENDPOINT),
    timeoutMs = integerEnv("OPENAI_AI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    fetchImpl = globalThis.fetch
  } = {}) {
    this.apiKey = String(apiKey ?? "").trim();
    this.model = String(model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    this.endpoint = String(endpoint ?? DEFAULT_ENDPOINT).trim() || DEFAULT_ENDPOINT;
    this.timeoutMs = Number(timeoutMs) || DEFAULT_TIMEOUT_MS;
    this.fetchImpl = fetchImpl;
  }

  snapshot() {
    return {
      provider: "openai",
      model: this.model,
      configured: this.missingConfiguration().length === 0,
      endpoint: this.endpoint,
      externalDataTransfer: true,
      requestStorage: false,
      sentData: ["final transcript text", "speaker display name", "session id", "NPC display context when active"]
    };
  }

  missingConfiguration() {
    const missing = [];
    if (!this.apiKey) missing.push("OPENAI_API_KEY");
    if (typeof this.fetchImpl !== "function") missing.push("fetch");
    return missing;
  }

  async extract({ segment, sessionId = null, npcContext = null }) {
    const missing = this.missingConfiguration();
    if (missing.length) throw new Error(`OpenAI-Konfiguration fehlt: ${missing.join(", ")}`);

    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        store: false,
        instructions: SYSTEM_INSTRUCTIONS,
        input: buildInput({ segment, sessionId, npcContext }),
        max_output_tokens: 1200,
        text: {
          format: {
            type: "json_schema",
            name: "dm_cockpit_extraction",
            strict: true,
            schema: EXTRACTION_SCHEMA
          }
        }
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    let payload;
    try {
      payload = await response.json();
    } catch (_error) {
      throw new Error(`OpenAI HTTP ${response.status}: ungültige JSON-Antwort.`);
    }

    if (!response.ok) {
      const message = cleanText(payload?.error?.message) || cleanText(payload?.message) || `HTTP ${response.status}`;
      throw new Error(`OpenAI API: ${message}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(outputText(payload));
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error("OpenAI Structured Output war kein gültiges JSON.");
      throw error;
    }

    const npcCandidates = [];
    if (npcContext?.actorId) {
      for (const candidate of Array.isArray(parsed?.npcCandidates) ? parsed.npcCandidates.slice(0, MAX_CANDIDATES_PER_TYPE) : []) {
        const normalized = normalizeCandidate(candidate, NPC_KINDS);
        if (!normalized) continue;
        npcCandidates.push({
          ...normalized,
          actorId: String(npcContext.actorId),
          actorUuid: npcContext.actorUuid ? String(npcContext.actorUuid) : null
        });
      }
    }

    const sessionEventCandidates = [];
    for (const candidate of Array.isArray(parsed?.sessionEventCandidates) ? parsed.sessionEventCandidates.slice(0, MAX_CANDIDATES_PER_TYPE) : []) {
      const normalized = normalizeCandidate(candidate, SESSION_KINDS);
      if (normalized) sessionEventCandidates.push(normalized);
    }

    return { npcCandidates, sessionEventCandidates };
  }
}
