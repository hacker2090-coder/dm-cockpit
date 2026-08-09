import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

const PROTOCOL_VERSION = "1.0";
const DEFAULT_URL = "ws://127.0.0.1:43170/v1";
const RECONNECT_MS = 750;

function env(name, fallback = "") {
  const value = String(process.env[name] ?? "").trim();
  return value || fallback;
}

function now() {
  return new Date().toISOString();
}

export class CompanionPublisher {
  constructor({ onStatus = () => {}, onMessage = () => {} } = {}) {
    this.url = env("DM_COCKPIT_WS_URL", DEFAULT_URL);
    this.onStatus = onStatus;
    this.onMessage = onMessage;
    this.ws = null;
    this.state = "disconnected";
    this.queue = [];
    this.reconnectTimer = null;
    this.stopped = false;
  }

  snapshot() {
    return {
      url: this.url,
      state: this.state,
      queuedMessages: this.queue.length
    };
  }

  emitStatus() {
    this.onStatus(this.snapshot());
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  connect() {
    if (this.stopped || this.state === "connecting" || this.state === "connected") return;
    this.state = "connecting";
    this.emitStatus();

    const ws = new WebSocket(this.url, { perMessageDeflate: false });
    this.ws = ws;

    ws.once("open", () => {
      this.state = "connected";
      this.emitStatus();
      this.send("hello", {
        client: "dm-cockpit-companion-internal",
        protocolVersion: PROTOCOL_VERSION,
        features: [
          "speaker.upserted",
          "session.started",
          "session.ended",
          "capture.status",
          "transcript.segment",
          "npc.context",
          "npc.memory.candidate",
          "session.event.candidate"
        ]
      });
      this.flush();
    });

    ws.on("message", raw => {
      let message;
      try {
        message = JSON.parse(raw.toString("utf8"));
      } catch (_error) {
        return;
      }

      try {
        this.onMessage(message);
      } catch (error) {
        console.warn("[publisher] Eingehende Protocol-Nachricht konnte nicht verarbeitet werden:", error?.message ?? error);
      }
    });

    ws.once("error", () => {
      // close übernimmt Reconnect und Status.
    });

    ws.once("close", () => {
      if (this.ws === ws) this.ws = null;
      this.state = "disconnected";
      this.emitStatus();
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_MS);
    this.reconnectTimer.unref?.();
  }

  envelope(type, payload = {}, sessionId = null) {
    return {
      v: PROTOCOL_VERSION,
      type,
      id: `internal_${randomUUID()}`,
      ts: now(),
      sessionId,
      payload
    };
  }

  send(type, payload = {}, sessionId = null) {
    const message = JSON.stringify(this.envelope(type, payload, sessionId));
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
      return true;
    }

    this.queue.push(message);
    if (this.queue.length > 200) this.queue.shift();
    this.connect();
    return false;
  }

  flush() {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    while (this.queue.length) this.ws.send(this.queue.shift());
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.queue.length = 0;
    try {
      this.ws?.close(1000, "Companion publisher shutdown");
    } catch (_error) {
      // Ignorieren.
    }
    this.ws = null;
    this.state = "stopped";
    this.emitStatus();
  }
}
