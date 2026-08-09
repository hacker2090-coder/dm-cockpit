import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChannelType, PermissionsBitField } from "discord.js";
import { DiscordOutputController } from "./discord-output-controller.js";
import { DiscordOutputStore } from "./discord-output-store.js";

const dir = mkdtempSync(join(tmpdir(), "dm-cockpit-output-"));
const dbPath = join(dir, "output.sqlite");

function permissionSet(...flags) {
  const allowed = new Set(flags);
  return { has: flag => allowed.has(flag) };
}

try {
  const store = new DiscordOutputStore(dbPath);
  const sent = [];
  const me = { id: "bot-1" };
  const allowedPermissions = permissionSet(
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages
  );

  const outputChannel = {
    id: "text-1",
    type: ChannelType.GuildText,
    name: "session-log",
    parentId: "cat-1",
    parent: { name: "Pen & Paper" },
    permissionsFor: () => allowedPermissions,
    send: async payload => {
      sent.push(payload);
      return { id: `message-${sent.length}` };
    }
  };
  const blockedChannel = {
    id: "text-2",
    type: ChannelType.GuildText,
    name: "intern",
    parentId: null,
    parent: null,
    permissionsFor: () => permissionSet(PermissionsBitField.Flags.ViewChannel),
    send: async () => ({ id: "should-not-send" })
  };
  const voiceChannel = {
    id: "voice-1",
    type: ChannelType.GuildVoice,
    name: "Voice",
    permissionsFor: () => allowedPermissions
  };

  const channelMap = new Map([
    [outputChannel.id, outputChannel],
    [blockedChannel.id, blockedChannel],
    [voiceChannel.id, voiceChannel]
  ]);
  const guild = {
    members: { me, fetchMe: async () => me },
    channels: {
      fetch: async id => id ? (channelMap.get(String(id)) ?? null) : channelMap
    }
  };
  const voice = {
    guildId: "guild-1",
    gatewayState: "ready",
    client: { guilds: { fetch: async id => id === "guild-1" ? guild : null } }
  };

  const states = [];
  const results = [];
  const controller = new DiscordOutputController({
    voice,
    store,
    onState: state => states.push(state),
    onResult: result => results.push(result)
  });

  const channels = await controller.listChannels();
  assert.deepEqual(channels.channels.map(channel => channel.channelId), ["text-1"]);

  const selected = await controller.selectChannel("text-1");
  assert.equal(selected.selectedChannel.channelId, "text-1");
  assert.equal(selected.validation.valid, true);

  const recap = await controller.sendRequestedMessage({
    requestId: "req-recap-1",
    kind: "recap",
    sessionId: "session-1",
    text: "**Session-Recap**\n• Die Gruppe öffnete die Tür."
  });
  assert.equal(recap.status, "sent");
  assert.equal(recap.discordMessageId, "message-1");
  assert.deepEqual(sent[0].allowedMentions, { parse: [] });

  const duplicate = await controller.sendRequestedMessage({
    requestId: "req-recap-1",
    kind: "recap",
    sessionId: "session-1",
    text: "Soll nicht erneut gesendet werden"
  });
  assert.equal(duplicate.status, "sent");
  assert.equal(duplicate.duplicate, true);
  assert.equal(sent.length, 1);

  const notice = await controller.sendRequestedMessage({
    requestId: "auto-capture-notice:session-1",
    kind: "capture_notice",
    sessionId: "session-1",
    profileName: "Auktion der verbotenen Dinge"
  });
  assert.equal(notice.status, "sent");
  assert.equal(controller.captureNoticeShown("session-1"), true);
  assert.equal(sent.length, 2);
  assert.equal(sent[1].content.includes("Transkription aktiv"), true);
  assert.equal(sent[1].content.includes("Auktion der verbotenen Dinge"), true);

  const tooLong = await controller.sendRequestedMessage({
    requestId: "req-too-long",
    kind: "recap",
    sessionId: "session-1",
    text: "x".repeat(2001)
  });
  assert.equal(tooLong.status, "failed");
  assert.equal(sent.length, 2);

  const reloaded = new DiscordOutputStore(dbPath);
  assert.equal(reloaded.selectedChannel("guild-1")?.channelId, "text-1");
  assert.equal(reloaded.getPost("req-recap-1")?.status, "sent");
  assert.equal(reloaded.hasSent("capture_notice", "session-1", "guild-1"), true);
  reloaded.close();

  await controller.selectChannel(null);
  assert.equal(store.selectedChannel("guild-1"), null);
  assert.equal(states.length > 0, true);
  assert.equal(results.length >= 4, true);

  store.close();
  console.log("Discord-Output-Smoke-Test erfolgreich: Kanalliste -> Persistenz -> Recap -> Idempotenz -> Aufnahmehinweis -> Reload -> Clear bestätigt.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
