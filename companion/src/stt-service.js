import { randomUUID } from "node:crypto";
import { DeepgramSttProvider } from "./stt-deepgram.js";

const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_MAX_PENDING = 64;
const DEFAULT_MAX_RETRIES = 1;
const MIN_SEGMENT_MS = 250;

function env(name, fallback = "") {
  const value = String(process.env[name] ?? "").trim();
  return value || fallback;
}

function integerEnv(name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number.parseInt(env(name, String(fallback)), 10);
  if (!Number.isInteger(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function errorText(error) {
  return String(error?.message ?? error ?? "Unbekannter Fehler");
}

export class SttService {
  constructor({
    onTranscript = () => {},
    onStatus = () => {}
  } = {}) {
    this.providerName = env("STT_PROVIDER", "none").toLowerCase();
    this.maxConcurrency = integerEnv("STT_MAX_CONCURRENCY", DEFAULT_MAX_CONCURRENCY, { min: 1, max: 32 });
    this.maxPending = integerEnv("STT_MAX_PENDING", DEFAULT_MAX_PENDING, { min: 1, max: 500 });
    this.maxRetries = integerEnv("STT_MAX_RETRIES", DEFAULT_MAX_RETRIES, { min: 0, max: 3 });
    this.onTranscript = onTranscript;
    this.onStatus = onStatus;

    this.provider = null;
    this.queue = [];
    this.active = 0;
    this.completed = 0;
    this.failed = 0;
    this.dropped = 0;
    this.lastError = null;

    if (this.providerName === "deepgram") {
      this.provider = new DeepgramSttProvider();
    }
  }

  snapshot() {
    const providerSnapshot = this.provider?.snapshot?.() ?? null;
    return {
      provider: this.providerName,
      enabled: this.providerName !== "none",
      configured: this.providerName === "none" ? true : Boolean(providerSnapshot?.configured),
      providerDetails: providerSnapshot,
      active: this.active,
      pending: this.queue.length,
      completed: this.completed,
      failed: this.failed,
      dropped: this.dropped,
      maxConcurrency: this.maxConcurrency,
      maxPending: this.maxPending,
      maxRetries: this.maxRetries,
      rawAudioPersistence: "none",
      lastError: this.lastError
    };
  }

  emitStatus() {
    this.onStatus(this.snapshot());
  }

  start() {
    if (this.providerName === "none") {
      console.log("[stt] Deaktiviert. Für den ersten Cloud-Test später STT_PROVIDER=deepgram setzen.");
      this.emitStatus();
      return this.snapshot();
    }

    if (!this.provider) {
      this.lastError = `Unbekannter STT_PROVIDER '${this.providerName}'.`;
      console.warn(`[stt] ${this.lastError}`);
      this.emitStatus();
      return this.snapshot();
    }

    const missing = this.provider.missingConfiguration?.() ?? [];
    if (missing.length) {
      this.lastError = `Konfiguration fehlt: ${missing.join(", ")}`;
      console.warn(`[stt] ${this.providerName} nicht bereit: ${this.lastError}`);
    } else {
      this.lastError = null;
      console.log(`[stt] Provider '${this.providerName}' bereit.`);
    }
    this.emitStatus();
    return this.snapshot();
  }

  submit(segment, context = {}) {
    if (!segment?.opusPackets?.length || segment.durationMs < MIN_SEGMENT_MS) {
      return Promise.resolve({ status: "ignored", reason: "empty_or_too_short" });
    }

    if (this.providerName === "none") {
      return Promise.resolve({ status: "disabled" });
    }
    if (!this.provider) {
      return Promise.resolve({ status: "error", error: `Unbekannter Provider ${this.providerName}` });
    }
    if ((this.provider.missingConfiguration?.() ?? []).length) {
      return Promise.resolve({ status: "not_configured" });
    }

    if (this.queue.length >= this.maxPending) {
      this.dropped += 1;
      this.lastError = "STT-Warteschlange voll; Segment verworfen.";
      console.warn(`[stt] ${this.lastError} User ${segment.discordUserId}.`);
      this.emitStatus();
      return Promise.resolve({ status: "dropped", reason: "queue_full" });
    }

    return new Promise(resolve => {
      this.queue.push({ segment, context, resolve, attempt: 0 });
      this.emitStatus();
      this.pump();
    });
  }

  pump() {
    while (this.active < this.maxConcurrency && this.queue.length) {
      const job = this.queue.shift();
      this.active += 1;
      this.runJob(job)
        .catch(error => {
          console.warn("[stt] Unerwarteter Job-Fehler:", errorText(error));
        })
        .finally(() => {
          this.active -= 1;
          this.emitStatus();
          this.pump();
        });
    }
  }

  async runJob(job) {
    job.attempt += 1;
    const { segment, context } = job;

    try {
      const result = await this.provider.transcribe(segment);
      const payload = {
        segmentId: `discord_${randomUUID()}`,
        discordUserId: String(segment.discordUserId),
        speakerName: String(context.speakerName ?? segment.discordUserId),
        startedAt: segment.startedAt,
        endedAt: segment.endedAt,
        text: result.text,
        final: true,
        language: result.language ?? null,
        provider: result.provider ?? this.providerName,
        confidence: typeof result.confidence === "number" ? result.confidence : null
      };

      await this.onTranscript(payload, context);
      this.completed += 1;
      this.lastError = null;
      console.log(
        `[stt] ${payload.speakerName}: ${JSON.stringify(payload.text)}${payload.confidence !== null ? ` (Confidence ${payload.confidence.toFixed(3)})` : ""}`
      );
      job.resolve({ status: "ok", payload });
    } catch (error) {
      const message = errorText(error);
      if (job.attempt <= this.maxRetries) {
        console.warn(`[stt] Versuch ${job.attempt} fehlgeschlagen (${message}); ein Retry folgt.`);
        this.queue.unshift(job);
        return;
      }

      this.failed += 1;
      this.lastError = message;
      console.warn(`[stt] Segment von ${segment.discordUserId} endgültig fehlgeschlagen: ${message}`);
      job.resolve({ status: "failed", error: message });
    } finally {
      // Roh-Audio wird weder auf Platte geschrieben noch nach Abschluss des STT-Jobs gehalten.
      // Bei einem Retry bleibt es nur so lange im RAM, wie der Retry-Job es benötigt.
      if (job.attempt > this.maxRetries || this.completed > 0) {
        // Der konkrete Job besitzt nach erfolgreichem oder endgültig fehlgeschlagenem Lauf
        // keine weitere Queue-Referenz. Das Array kann unmittelbar geleert werden.
        if (!this.queue.includes(job) && Array.isArray(segment.opusPackets)) segment.opusPackets.length = 0;
      }
    }
  }
}
