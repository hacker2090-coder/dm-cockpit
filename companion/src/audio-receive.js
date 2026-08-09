import { EndBehaviorType } from "@discordjs/voice";

const DEFAULT_END_AFTER_INACTIVITY_MS = 1_200;
const DEFAULT_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_SEGMENT_MS = 60_000;

function isoNow() {
  return new Date().toISOString();
}

function errorText(error) {
  return String(error?.message ?? error ?? "Unbekannter Fehler");
}

export class DiscordAudioReceiver {
  constructor({
    botUserId = null,
    endAfterInactivityMs = DEFAULT_END_AFTER_INACTIVITY_MS,
    maxBufferBytes = DEFAULT_MAX_BUFFER_BYTES,
    maxSegmentMs = DEFAULT_MAX_SEGMENT_MS,
    onSegment = () => {},
    onStatus = () => {}
  } = {}) {
    this.botUserId = botUserId;
    this.endAfterInactivityMs = endAfterInactivityMs;
    this.maxBufferBytes = maxBufferBytes;
    this.maxSegmentMs = maxSegmentMs;
    this.onSegment = onSegment;
    this.onStatus = onStatus;

    this.connection = null;
    this.receiver = null;
    this.active = new Map();
    this.totalSegments = 0;
    this.totalPackets = 0;
    this.totalBytes = 0;
    this.lastError = null;

    this.handleSpeakingStart = userId => this.startUserSegment(userId);
  }

  snapshot() {
    return {
      attached: Boolean(this.receiver),
      activeSpeakers: [...this.active.keys()],
      activeCount: this.active.size,
      totalSegments: this.totalSegments,
      totalPackets: this.totalPackets,
      totalBytes: this.totalBytes,
      buffering: "memory-only-opus-packets",
      persistence: "none",
      endAfterInactivityMs: this.endAfterInactivityMs,
      maxBufferBytes: this.maxBufferBytes,
      maxSegmentMs: this.maxSegmentMs,
      lastError: this.lastError
    };
  }

  emitStatus() {
    this.onStatus(this.snapshot());
  }

  attach(connection, { botUserId = null } = {}) {
    if (!connection?.receiver) throw new Error("VoiceConnection hat keinen Receiver.");

    if (this.connection === connection && this.receiver === connection.receiver) return this.snapshot();
    this.detach("Voice-Verbindung gewechselt");

    this.connection = connection;
    this.receiver = connection.receiver;
    this.botUserId = botUserId ?? this.botUserId;
    this.lastError = null;

    this.receiver.speaking.on("start", this.handleSpeakingStart);
    console.log("[audio-receive] Sprechergetrenntes Opus-Buffering aktiv (nur RAM, keine Datei)." );
    this.emitStatus();
    return this.snapshot();
  }

  detach(reason = "Audio-Receiver getrennt") {
    if (this.receiver) {
      this.receiver.speaking.off("start", this.handleSpeakingStart);
    }

    for (const state of this.active.values()) {
      state.truncated = true;
      state.truncateReason = reason;
      try {
        state.stream.destroy();
      } catch (_error) {
        // Ignorieren; finalize räumt den Zustand auf.
      }
      this.finalizeState(state, "detached");
    }

    this.active.clear();
    this.connection = null;
    this.receiver = null;
    this.emitStatus();
  }

  startUserSegment(userId) {
    if (!this.receiver || !userId || userId === this.botUserId) return;
    if (this.active.has(userId)) return;

    let stream;
    try {
      stream = this.receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterInactivity,
          duration: this.endAfterInactivityMs
        }
      });
    } catch (error) {
      this.lastError = errorText(error);
      console.warn(`[audio-receive] Subscription für ${userId} fehlgeschlagen: ${this.lastError}`);
      this.emitStatus();
      return;
    }

    const state = {
      userId,
      stream,
      packets: [],
      packetCount: 0,
      byteLength: 0,
      startedAtMs: Date.now(),
      startedAt: isoNow(),
      endedAt: null,
      truncated: false,
      truncateReason: null,
      finalized: false,
      timer: null
    };

    state.timer = setTimeout(() => {
      if (state.finalized) return;
      state.truncated = true;
      state.truncateReason = "max_segment_duration";
      stream.destroy();
    }, this.maxSegmentMs);
    state.timer.unref?.();

    this.active.set(userId, state);
    this.emitStatus();

    stream.on("data", packet => {
      if (state.finalized || !Buffer.isBuffer(packet)) return;

      if (state.byteLength + packet.length > this.maxBufferBytes) {
        state.truncated = true;
        state.truncateReason = "max_buffer_bytes";
        stream.destroy();
        return;
      }

      state.packets.push(Buffer.from(packet));
      state.packetCount += 1;
      state.byteLength += packet.length;
    });

    stream.once("end", () => this.finalizeState(state, "end"));
    stream.once("close", () => this.finalizeState(state, "close"));
    stream.once("error", error => {
      state.truncated = true;
      state.truncateReason = `stream_error:${errorText(error)}`;
      this.lastError = errorText(error);
      this.finalizeState(state, "error");
    });
  }

  finalizeState(state, reason) {
    if (!state || state.finalized) return;
    state.finalized = true;
    if (state.timer) clearTimeout(state.timer);
    this.active.delete(state.userId);

    const endedAtMs = Date.now();
    const segment = {
      discordUserId: state.userId,
      startedAt: state.startedAt,
      endedAt: new Date(endedAtMs).toISOString(),
      durationMs: Math.max(0, endedAtMs - state.startedAtMs),
      opusPackets: state.packets,
      packetCount: state.packetCount,
      byteLength: state.byteLength,
      truncated: state.truncated,
      truncateReason: state.truncateReason,
      endReason: reason,
      storage: "memory-only"
    };

    this.totalSegments += 1;
    this.totalPackets += state.packetCount;
    this.totalBytes += state.byteLength;

    console.log(
      `[audio-receive] Segment ${state.userId}: ${state.packetCount} Opus-Pakete, ${state.byteLength} Bytes, ${segment.durationMs} ms${state.truncated ? `, gekürzt (${state.truncateReason})` : ""}.`
    );

    try {
      this.onSegment(segment);
    } catch (error) {
      this.lastError = errorText(error);
      console.warn("[audio-receive] Segment-Callback fehlgeschlagen:", this.lastError);
    }

    // Kein persistenter Roh-Audio-Speicher in 0.3.0. Nach Rückkehr aus dem Callback
    // bleibt keine Referenz auf die Paketliste im Receiver erhalten.
    state.packets = [];
    this.emitStatus();
  }
}
