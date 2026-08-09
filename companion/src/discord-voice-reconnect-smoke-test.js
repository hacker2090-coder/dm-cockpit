import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import { VoiceConnectionStatus } from "@discordjs/voice";
import { DiscordVoiceController } from "./discord-voice.js";

class FakeVoiceConnection extends EventEmitter {
  constructor(status = VoiceConnectionStatus.Ready) {
    super();
    this.state = { status };
  }

  destroy() {
    const previous = this.state;
    this.state = { status: VoiceConnectionStatus.Destroyed };
    this.emit("stateChange", previous, this.state);
  }
}

function controllerWithConnection() {
  const controller = new DiscordVoiceController();
  controller.guildId = "guild-test";
  controller.gatewayState = "ready";
  controller.client = {};
  controller.channelId = "voice-test";
  controller.reconnectAllowed = true;
  controller.connection = new FakeVoiceConnection();
  controller.bindConnection(controller.connection);
  return controller;
}

{
  const controller = controllerWithConnection();
  const reconnectReasons = [];
  controller.scheduleReconnect = reason => reconnectReasons.push(reason);

  controller.leaveVoice("intentional test leave");

  assert.equal(controller.channelId, null, "intentional leave must clear the reconnect target before destroy");
  assert.equal(controller.reconnectAllowed, false, "intentional leave must disable reconnect");
  assert.equal(controller.voiceState, "idle", "intentional leave must end in idle state");
  assert.deepEqual(reconnectReasons, [], "intentional destroy must not schedule reconnect");
}

{
  const controller = controllerWithConnection();
  const reconnectReasons = [];
  controller.scheduleReconnect = reason => reconnectReasons.push(reason);

  controller.connection.emit(
    "stateChange",
    { status: VoiceConnectionStatus.Ready },
    { status: VoiceConnectionStatus.Destroyed }
  );

  assert.equal(controller.channelId, "voice-test", "unexpected destroy must keep the reconnect target");
  assert.equal(controller.reconnectAllowed, true, "unexpected destroy must keep reconnect enabled");
  assert.equal(controller.voiceState, "disconnected", "unexpected destroy must expose disconnected state");
  assert.deepEqual(reconnectReasons, ["voice_destroyed"], "unexpected destroy must schedule reconnect");
}

console.log("Discord-Voice-Reconnect-Smoke-Test erfolgreich: intentional leave blockiert Retry, unerwartetes Destroyed plant Reconnect.");
