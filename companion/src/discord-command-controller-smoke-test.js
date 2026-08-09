import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import { Events } from "discord.js";
import { DiscordCommandController } from "./discord-command-controller.js";

const calls = [];
const replies = [];
const client = new EventEmitter();
client.user = { setPresence: payload => calls.push(["presence", payload]) };
client.guilds = {
  fetch: async guildId => ({
    id: guildId,
    commands: {
      set: async definitions => {
        calls.push(["register", definitions]);
        return definitions;
      }
    }
  })
};

const voice = {
  guildId: "guild-1",
  gmUserId: "gm-1",
  gatewayState: "ready",
  client
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
  },
  onDiagnostic: diagnostic => calls.push(["diagnostic", diagnostic])
});

await controller.start();
assert.equal(controller.snapshot().registered, true);
assert.equal(calls.some(([name]) => name === "register"), true);
const registration = calls.find(([name]) => name === "register")?.[1] ?? [];
assert.equal(registration.length, 1);
assert.equal(registration[0]?.name, "dm");
assert.deepEqual(
  registration[0]?.options?.map(option => option.name),
  ["status", "start", "stop", "recap"]
);
assert.equal(client.listenerCount(Events.InteractionCreate), 1);

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

controller.stop();
assert.equal(controller.snapshot().registered, false);
assert.equal(client.listenerCount(Events.InteractionCreate), 0);

console.log("Discord-Command-Smoke-Test erfolgreich: Registrierung -> /dm Routing -> GM-Guard -> Presence -> Listener-Cleanup bestätigt.");
