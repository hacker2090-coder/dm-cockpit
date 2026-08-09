const DEFAULT_ENDPOINT = "http://127.0.0.1:11434/api/chat";
const DEFAULT_MODEL = "qwen3:4b";
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_NUM_CTX = 8192;
const DEFAULT_KEEP_ALIVE = "10m";
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

Eine angegebene Spieler-/Charakterzuordnung stammt ausschließlich aus einer GM-bestätigten Foundry-Zuordnung. Nutze sie nur als Sprecherkontext. Erfinde oder verändere niemals selbst eine Charakter- oder Actor-Zuordnung. Die Zuordnung beweist nicht, dass jede Aussage in-character gesprochen wurde.

NPC-Kandidaten sind nur erlaubt, wenn ein aktueller NPC-Kontext angegeben ist und der Inhalt tatsächlich diesen NPC betrifft.
NPC-Kategorien: statement=Aussage/Fakt, knowledge=erlangtes Wissen, action=Handlung, relationship=Beziehung, promise=Versprechen/Zusage, lie=explizit als Lüge belegbar, deadline=Frist, consequence=Konsequenz, other=nur wenn keine Kategorie passt.

Session-Kategorien: decision=Entscheidung, quest=Quest/Auftrag, task=konkrete Aufgabe, loot=Loot/Gegenstand, reward=Belohnung, open_question=offene wichtige Frage, combat=Kampfereignis, event=anderes wichtiges Ereignis, other=nur wenn keine Kategorie passt.

Formuliere candidate.text kurz, eigenständig verständlich und auf Deutsch. Bewahre Namen, Orte, Fristen und konkrete Zusagen. Gib keine Meta-Erklärung außerhalb des vorgegebenen Schemas aus.`;

function env(name, fallback = "") {
  const value = String(process.env[name] ?? "").trim();
  return value || fallback;
}

function integerEnv(name, fallback, { min = 512, max = 131072 } = {}) {
  const parsed = Number.parseInt(env(name, String(fallback)), 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function timeoutEnv(name, fallback) {
  const parsed = Number.parseInt(env(name, String(fallback)), 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(1000, Math.min(300000, parsed));
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function buildInput({ segment, sessionId, npcContext }) {
  const npcActive = Boolean(npcContext?.actorId);
  const playerName = cleanText(segment?.playerName)
    || cleanText(segment?.speakerName)
    || cleanText(segment?.discordUserId)
    || "unbekannt";
  const characterName = cleanText(segment?.characterName);
  return [
    `Session-ID: ${sessionId ?? "nicht gesetzt"}`,
    `Spieler/Sprecher: ${playerName}`,
    `GM-bestätigter Spielercharakter: ${characterName || "nicht zugeordnet"}`,
    `Aktueller NPC-Kontext: ${npcActive ? "ja" : "nein"}`,
    npcActive ? `NPC-Name: ${cleanText(npcContext?.actorName) || "unbekannt"}` : null,
    npcActive ? `NPC-Quelle: ${cleanText(npcContext?.source) || "unbekannt"}` : null,
    "",
    "Finales Transkriptsegment:",
    cleanText(segment?.text),
    "",
    "Antwort ausschließlich entsprechend diesem JSON-Schema:",
    JSON.stringify(EXTRACTION_SCHEMA)
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

function isLoopbackEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch (_error) {
    return false;
  }
}

export class OllamaExtractionProvider {
  constructor({
    model = env("OLLAMA_AI_MODEL", DEFAULT_MODEL),
    endpoint = env("OLLAMA_AI_ENDPOINT", DEFAULT_ENDPOINT),
    timeoutMs = timeoutEnv("OLLAMA_AI_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
    numCtx = integerEnv("OLLAMA_AI_NUM_CTX", DEFAULT_NUM_CTX),
    keepAlive = env("OLLAMA_AI_KEEP_ALIVE", DEFAULT_KEEP_ALIVE),
    fetchImpl = globalThis.fetch
  } = {}) {
    this.model = String(model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    this.endpoint = String(endpoint ?? DEFAULT_ENDPOINT).trim() || DEFAULT_ENDPOINT;
    this.timeoutMs = Number(timeoutMs) || DEFAULT_TIMEOUT_MS;
    this.numCtx = Number(numCtx) || DEFAULT_NUM_CTX;
    this.keepAlive = String(keepAlive ?? DEFAULT_KEEP_ALIVE).trim() || DEFAULT_KEEP_ALIVE;
    this.fetchImpl = fetchImpl;
  }

  snapshot() {
    return {
      provider: "ollama",
      model: this.model,
      configured: this.missingConfiguration().length === 0,
      endpoint: this.endpoint,
      localEndpoint: isLoopbackEndpoint(this.endpoint),
      externalDataTransfer: !isLoopbackEndpoint(this.endpoint),
      requestStorage: false,
      apiKeyRequired: false,
      think: false,
      temperature: 0,
      numCtx: this.numCtx,
      keepAlive: this.keepAlive,
      sentData: [
        "final transcript text",
        "speaker/player display name",
        "GM-confirmed mapped character display name when available",
        "session id",
        "NPC display context when active"
      ]
    };
  }

  missingConfiguration() {
    const missing = [];
    if (typeof this.fetchImpl !== "function") missing.push("fetch");
    try {
      new URL(this.endpoint);
    } catch (_error) {
      missing.push("OLLAMA_AI_ENDPOINT");
    }
    return missing;
  }

  async extract({ segment, sessionId = null, npcContext = null }) {
    const missing = this.missingConfiguration();
    if (missing.length) throw new Error(`Ollama-Konfiguration fehlt/ungültig: ${missing.join(", ")}`);

    let response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_INSTRUCTIONS },
            { role: "user", content: buildInput({ segment, sessionId, npcContext }) }
          ],
          stream: false,
          think: false,
          format: EXTRACTION_SCHEMA,
          keep_alive: this.keepAlive,
          options: {
            temperature: 0,
            seed: 42,
            num_ctx: this.numCtx
          }
        }),
        signal: AbortSignal.timeout(this.timeoutMs)
      });
    } catch (error) {
      const name = String(error?.name ?? "");
      if (name === "TimeoutError" || name === "AbortError") {
        throw new Error(`Ollama antwortete nicht innerhalb von ${this.timeoutMs} ms.`);
      }
      throw new Error(`Ollama nicht erreichbar unter ${this.endpoint}: ${error?.message ?? error}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (_error) {
      throw new Error(`Ollama HTTP ${response.status}: ungültige JSON-Antwort.`);
    }

    if (!response.ok) {
      const message = cleanText(payload?.error) || cleanText(payload?.message) || `HTTP ${response.status}`;
      throw new Error(`Ollama API: ${message}`);
    }

    const content = cleanText(payload?.message?.content);
    if (!content) throw new Error("Ollama-Antwort enthielt keinen strukturierten Inhalt.");

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (_error) {
      throw new Error("Ollama Structured Output war kein gültiges JSON.");
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
