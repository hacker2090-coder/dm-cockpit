import { randomUUID } from "node:crypto";

function now() {
  return new Date().toISOString();
}

function normalizeReason(value, fallback) {
  return String(value ?? "").trim() || fallback;
}

export class SessionControl {
  constructor({
    createSessionId = () => `voice_${randomUUID()}`,
    onStarted = () => {},
    onEnded = () => {},
    onState = () => {}
  } = {}) {
    this.createSessionId = createSessionId;
    this.onStarted = onStarted;
    this.onEnded = onEnded;
    this.onState = onState;

    this.sessionId = null;
    this.startedAt = null;
    this.startedByDiscordUserId = null;
    this.voiceReady = false;
    this.voiceChannelId = null;
    this.lastVoiceReadyAt = null;
    this.lastVoiceLostAt = null;
    this.lastTransitionAt = now();
    this.lastReason = "initial";
  }

  get active() {
    return Boolean(this.sessionId);
  }

  get captureEnabled() {
    return this.active && this.voiceReady;
  }

  snapshot() {
    return {
      active: this.active,
      sessionId: this.sessionId,
      startedAt: this.startedAt,
      startedByDiscordUserId: this.startedByDiscordUserId,
      voiceReady: this.voiceReady,
      voiceChannelId: this.voiceChannelId,
      captureEnabled: this.captureEnabled,
      lastVoiceReadyAt: this.lastVoiceReadyAt,
      lastVoiceLostAt: this.lastVoiceLostAt,
      lastTransitionAt: this.lastTransitionAt,
      lastReason: this.lastReason
    };
  }

  emitState() {
    const snapshot = this.snapshot();
    this.onState(snapshot);
    return snapshot;
  }

  setVoiceState({ ready, channelId = null, reason = null } = {}) {
    const nextReady = Boolean(ready);
    const nextChannelId = String(channelId ?? "").trim() || null;
    const changed = this.voiceReady !== nextReady || this.voiceChannelId !== nextChannelId;

    this.voiceReady = nextReady;
    this.voiceChannelId = nextReady ? nextChannelId : null;
    if (nextReady) this.lastVoiceReadyAt = now();
    else if (changed) this.lastVoiceLostAt = now();

    if (changed) {
      this.lastTransitionAt = now();
      this.lastReason = normalizeReason(reason, nextReady ? "voice_ready" : "voice_unavailable");
      return this.emitState();
    }
    return this.snapshot();
  }

  start({ requestedByDiscordUserId = null, metadata = {} } = {}) {
    if (this.active) {
      return {
        status: "already_active",
        changed: false,
        state: this.snapshot()
      };
    }

    if (!this.voiceReady) {
      return {
        status: "voice_not_ready",
        changed: false,
        state: this.snapshot()
      };
    }

    this.sessionId = String(this.createSessionId());
    this.startedAt = now();
    this.startedByDiscordUserId = String(requestedByDiscordUserId ?? "").trim() || null;
    this.lastTransitionAt = this.startedAt;
    this.lastReason = "manual_start";

    const state = this.snapshot();
    this.onStarted({
      ...state,
      metadata: metadata && typeof metadata === "object" ? { ...metadata } : {}
    });

    return {
      status: "started",
      changed: true,
      state: this.emitState()
    };
  }

  stop({ requestedByDiscordUserId = null, reason = "manual_stop" } = {}) {
    if (!this.active) {
      return {
        status: "already_idle",
        changed: false,
        state: this.snapshot()
      };
    }

    const endedSessionId = this.sessionId;
    const endedAt = now();
    const startedAt = this.startedAt;
    const startedByDiscordUserId = this.startedByDiscordUserId;

    this.sessionId = null;
    this.startedAt = null;
    this.startedByDiscordUserId = null;
    this.lastTransitionAt = endedAt;
    this.lastReason = normalizeReason(reason, "manual_stop");

    this.onEnded({
      sessionId: endedSessionId,
      startedAt,
      endedAt,
      startedByDiscordUserId,
      stoppedByDiscordUserId: String(requestedByDiscordUserId ?? "").trim() || null,
      reason: this.lastReason
    });

    return {
      status: "stopped",
      changed: true,
      endedSessionId,
      state: this.emitState()
    };
  }
}
