import assert from "node:assert/strict";
import { SessionControl } from "./session-control.js";

const started = [];
const ended = [];
const states = [];
let nextId = 1;

const session = new SessionControl({
  createSessionId: () => `session-${nextId++}`,
  onStarted: payload => started.push(payload),
  onEnded: payload => ended.push(payload),
  onState: payload => states.push(payload)
});

assert.equal(session.snapshot().active, false);
assert.equal(session.start().status, "voice_not_ready");
assert.equal(started.length, 0);

session.setVoiceState({ ready: true, channelId: "voice-1" });
const first = session.start({ requestedByDiscordUserId: "gm-1" });
assert.equal(first.status, "started");
assert.equal(first.state.sessionId, "session-1");
assert.equal(first.state.captureEnabled, true);
assert.equal(started.length, 1);

const duplicateStart = session.start({ requestedByDiscordUserId: "gm-1" });
assert.equal(duplicateStart.status, "already_active");
assert.equal(duplicateStart.state.sessionId, "session-1");
assert.equal(started.length, 1);

session.setVoiceState({ ready: false, reason: "voice_disconnected" });
assert.equal(session.snapshot().active, true);
assert.equal(session.snapshot().sessionId, "session-1");
assert.equal(session.snapshot().captureEnabled, false);
assert.equal(ended.length, 0);

session.setVoiceState({ ready: true, channelId: "voice-1", reason: "voice_reconnected" });
assert.equal(session.snapshot().sessionId, "session-1");
assert.equal(session.snapshot().captureEnabled, true);
assert.equal(started.length, 1);

const stopped = session.stop({ requestedByDiscordUserId: "gm-1" });
assert.equal(stopped.status, "stopped");
assert.equal(stopped.endedSessionId, "session-1");
assert.equal(session.snapshot().active, false);
assert.equal(ended.length, 1);

const duplicateStop = session.stop({ requestedByDiscordUserId: "gm-1" });
assert.equal(duplicateStop.status, "already_idle");
assert.equal(ended.length, 1);

const second = session.start({ requestedByDiscordUserId: "gm-1" });
assert.equal(second.status, "started");
assert.equal(second.state.sessionId, "session-2");
assert.equal(started.length, 2);
assert.equal(states.length > 0, true);

console.log("Session-Control-Smoke-Test erfolgreich: manual start/stop -> Idempotenz -> Voice-Verlust -> Reconnect ohne neue Session bestätigt.");
