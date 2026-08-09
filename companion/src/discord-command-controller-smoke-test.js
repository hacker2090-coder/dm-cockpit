import assert from "node:assert/strict";
import { DiscordCommandController } from "./discord-command-controller.js";

const calls = [];
const replies = [];
const voice = {
  guildId: "guild-1",
  gmUserId: "gm-1",
  gatewayState: "ready",
  client: { user: { setPresence: payload => calls.push(["presence", payload]) } }
};

const controller = new DiscordCommandController({
  voice,
  onStatusCommand: async context => {
    calls.push(["status", context]);
    return { content: "status-ok" };
  },
  onStartCommand: async context => {
    calls.push(["start", context]);
    return { content: "start-ok" };
  },
  onStopCommand: async context => {
    calls.push(["stop", context]);
    return { content: "stop-ok" };
  },
  onRecapCommand: async context => {
    calls.push(["recap", context]);
    return { content: "recap-ok" };
  }
});

function interaction({ userId = "gm-1", subcommand }) {
  return {
    commandName: "dm",
    user: { id: userId },
    guildId: "guild-1",
    channelId: "text-1",
    id: `interaction-${subcommand}-${userId}`,
    deferred: false,
    replied: false,
    isChatInputCommand: () => true,
    options: { getSubcommand: () => subcommand },
    reply: async payload => {
      replies.push(payload);
      return payload;
    },
    followUp: async payload => {
      replies.push(payload);
      return payload;
    }
  };
}

for (const subcommand of ["status", "start", "stop", "recap"]) {
  const handled = await controller.handleInteraction(interaction({ subcommand }));
  assert.equal(handled, true);
  assert.equal(calls.some(([name]) => name === subcommand), true);
}

const beforeUnauthorized = calls.length;
await controller.handleInteraction(interaction({ userId: "other-user", subcommand: "start" }));
assert.equal(calls.length, beforeUnauthorized);
assert.equal(replies.at(-1).content.includes("konfigurierten GM"), true);

controller.setPresence({ active: false, voiceReady: true }, {});
controller.setPresence({ active: true, voiceReady: true }, {});
controller.setPresence({ active: true, voiceReady: false }, { error: "Voice unterbrochen" });
assert.equal(calls.filter(([name]) => name === "presence").length, 3);
assert.equal(replies.length, 5);

console.log("Discord-Command-Smoke-Test erfolgreich: /dm Routing -> GM-Guard -> Presence-Zustände bestätigt.");
