import { randomUUID } from "node:crypto";
import { MockAiExtractionProvider } from "./ai-extraction-mock.js";
import { OpenAiExtractionProvider } from "./ai-extraction-openai.js";
import { OllamaExtractionProvider } from "./ai-extraction-ollama.js";

const DEFAULT_MAX_SEEN_SEGMENTS = 2000;

function env(name, fallback = "") {
  const value = String(process.env[name] ?? "").trim();
  return value || fallback;
}

function normalizeProviderName(value) {
  return String(value ?? "none").trim().toLowerCase() || "none";
}

function now() {
  return new Date().toISOString();
}

function candidateBase({ segment, providerSnapshot, candidate, createdAt }) {
  return {
    candidateId: `cand_${randomUUID()}`,
    text: String(candidate.text ?? segment.text ?? "").trim(),
    kind: String(candidate.kind ?? "other"),
    sourceSegmentIds: [String(segment.segmentId)],
    confidence: typeof candidate.confidence === "number" ? candidate.confidence : null,
    provider: providerSnapshot?.provider ?? null,
    model: providerSnapshot?.model ?? null,
    status: "pending",
    createdAt
  };
}

export class AiExtractionService {
  constructor({
    providerName = env("AI_PROVIDER", "none"),
    onCandidate = () => {},
    onStatus = () => {},
    maxSeenSegments = DEFAULT_MAX_SEEN_SEGMENTS
  } = {}) {
    this.providerName = normalizeProviderName(providerName);
    this.onCandidate = onCandidate;
    this.onStatus = onStatus;
    this.maxSeenSegments = Math.max(100, Number(maxSeenSegments) || DEFAULT_MAX_SEEN_SEGMENTS);
    this.provider = this.providerName === "mock"
      ? new MockAiExtractionProvider()
      : this.providerName === "openai"
        ? new OpenAiExtractionProvider()
        : this.providerName === "ollama"
          ? new OllamaExtractionProvider()
          : null;
    this.seenSegmentIds = new Set();
    this.seenSegmentOrder = [];
    this.completed = 0;
    this.failed = 0;
    this.ignored = 0;
    this.lastError = null;
  }

  snapshot() {
    const providerDetails = this.provider?.snapshot?.() ?? null;
    return {
      provider: this.providerName,
      enabled: this.providerName !== "none",
      configured: this.providerName === "none" ? true : Boolean(providerDetails?.configured),
      providerDetails,
      completed: this.completed,
      failed: this.failed,
      ignored: this.ignored,
      seenSegments: this.seenSegmentIds.size,
      lastError: this.lastError,
      automaticActorWrites: false
    };
  }

  emitStatus() {
    this.onStatus(this.snapshot());
  }

  start() {
    if (this.providerName === "none") {
      console.log("[ai] Extraktion deaktiviert. AI_PROVIDER=mock aktiviert den Testprovider; AI_PROVIDER=ollama aktiviert lokale KI; AI_PROVIDER=openai aktiviert den optionalen Cloud-Adapter.");
      this.emitStatus();
      return this.snapshot();
    }

    if (!this.provider) {
      this.lastError = `Unbekannter AI_PROVIDER '${this.providerName}'.`;
      console.warn(`[ai] ${this.lastError}`);
      this.emitStatus();
      return this.snapshot();
    }

    const missing = this.provider.missingConfiguration?.() ?? [];
    if (missing.length) {
      this.lastError = `Konfiguration fehlt: ${missing.join(", ")}`;
      console.warn(`[ai] Provider '${this.providerName}' nicht bereit: ${this.lastError}`);
    } else {
      this.lastError = null;
      console.log(`[ai] Provider '${this.providerName}' bereit.`);
    }
    this.emitStatus();
    return this.snapshot();
  }

  rememberSegment(segmentId) {
    const id = String(segmentId);
    if (this.seenSegmentIds.has(id)) return false;
    this.seenSegmentIds.add(id);
    this.seenSegmentOrder.push(id);
    while (this.seenSegmentOrder.length > this.maxSeenSegments) {
      const oldest = this.seenSegmentOrder.shift();
      this.seenSegmentIds.delete(oldest);
    }
    return true;
  }

  async submit(segment, context = {}) {
    if (!segment?.final || !segment?.segmentId || !String(segment?.text ?? "").trim()) {
      this.ignored += 1;
      this.emitStatus();
      return { status: "ignored", reason: "not_final_or_missing_data" };
    }

    if (!this.rememberSegment(segment.segmentId)) {
      this.ignored += 1;
      this.emitStatus();
      return { status: "ignored", reason: "duplicate_segment" };
    }

    if (this.providerName === "none") {
      this.ignored += 1;
      this.emitStatus();
      return { status: "disabled" };
    }
    if (!this.provider) {
      this.failed += 1;
      this.lastError = `Unbekannter Provider ${this.providerName}`;
      this.emitStatus();
      return { status: "error", error: this.lastError };
    }

    const missing = this.provider.missingConfiguration?.() ?? [];
    if (missing.length) {
      this.failed += 1;
      this.lastError = `Konfiguration fehlt: ${missing.join(", ")}`;
      this.emitStatus();
      return { status: "not_configured", error: this.lastError };
    }

    try {
      const extracted = await this.provider.extract({
        segment,
        sessionId: context.sessionId ?? null,
        npcContext: context.npcContext ?? null
      });
      const providerSnapshot = this.provider.snapshot?.() ?? { provider: this.providerName, model: null };
      const createdAt = now();
      const emitted = [];

      for (const candidate of Array.isArray(extracted?.npcCandidates) ? extracted.npcCandidates : []) {
        if (!candidate?.actorId || !candidate?.kind || !String(candidate?.text ?? "").trim()) continue;
        const payload = {
          ...candidateBase({ segment, providerSnapshot, candidate, createdAt }),
          actorId: String(candidate.actorId),
          actorUuid: candidate.actorUuid ? String(candidate.actorUuid) : null
        };
        await this.onCandidate("npc.memory.candidate", payload, context);
        emitted.push({ type: "npc.memory.candidate", payload });
      }

      for (const candidate of Array.isArray(extracted?.sessionEventCandidates) ? extracted.sessionEventCandidates : []) {
        if (!candidate?.kind || !String(candidate?.text ?? "").trim()) continue;
        const payload = candidateBase({ segment, providerSnapshot, candidate, createdAt });
        await this.onCandidate("session.event.candidate", payload, context);
        emitted.push({ type: "session.event.candidate", payload });
      }

      this.completed += 1;
      this.lastError = null;
      this.emitStatus();
      console.log(`[ai] Segment ${segment.segmentId}: ${emitted.length} Kandidat${emitted.length === 1 ? "" : "en"} erzeugt.`);
      return { status: "ok", emitted };
    } catch (error) {
      this.failed += 1;
      this.lastError = String(error?.message ?? error ?? "Unbekannter Fehler");
      this.emitStatus();
      console.warn(`[ai] Extraktion für Segment ${segment.segmentId} fehlgeschlagen: ${this.lastError}`);
      return { status: "failed", error: this.lastError };
    }
  }
}
