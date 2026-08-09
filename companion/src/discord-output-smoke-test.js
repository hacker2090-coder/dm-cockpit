import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiscordOutputController } from "./discord-output-controller.js";
import { DiscordOutputStore, DEFAULT_CAPTURE_NOTICE_TEXT } from "./discord-output-store.js";

class FakePermissions {
  constructor({ view = true, send = true } = {}) {
    this.view = view;
    this.send = send;
  }
  has(flag) {
    const value = String(flag);
    if (value === String(1n << 10n) || value === "1024") return this.view;
    if (value === String(1n << 11n) || value === "2048") return this.send;
    return this.view && this.send;
  }
}

class FakeChannel {
  constructor({ id, name, writable = true, textBased = true, thread = false, parentName = null } = {}) {
    this.id = id;
    this.name = name;
    this.parentId = parentName ? `parent-${parentName}` : null;
    this.parent = parentName ? { name: parentName } : null;
    this.writable = writable;
    this.textBased = textBased;
    this.thread = thread;
    this.sent = [];
  }
  isTextBased() { return this.textBased; }
  isThread() { return this.thread; }
  permissionsFor() { return new FakePermissions({ view: true, send: this.writable }); }
  async send(payload) {
    this.sent.push(payload);
    return { id: `message-${this.sent.length}` };
  }
}

const dir = mkdtempSync(join(tmpdir(), "dm-cockpit-output-"));
const dbPath = join(dir, "output.sqlite");

try {
  const store = new DiscordOutputStore(dbPath);
  assert.deepEqual(store.configOrDefault("world-test"), {
    worldId: "world-test",
    guildId: null,
    channelId: null,
    noticeText: DEFAULT_CAPTURE_NOTICE_TEXT,
    updatedAt: null
  });

  const first = store.setConfig({
    worldId: "world-test",
    guildId: "guild-test",
    channelId: "channel-one",
    noticeText: "Hinweis Eins"
  }, "2026-08-09T19:20:00.000Z");
  assert.equal(first.channelId, "channel-one");

  const second = store.setConfig({
    worldId: "world-test",
    guildId: "guild-test",
    channelId: "channel-two",
    noticeText: "Hinweis Zwei"
  }, "2026-08-09T19:21:00.000Z");
  assert.equal(second.channelId, "channel-two", "Zielkanal muss wiederholt überschreibbar sein.");
  assert.equal(second.noticeText, "Hinweis Zwei");
  assert.equal(store.stats().outputSettings, 1);

  const channelOne = new FakeChannel({ id: "channel-one", name: "allgemein", writable: true, parentName: "TEXT" });
  const channelTwo = new FakeChannel({ id: "channel-two", name: "session", writable: true, parentName: "RUNDEN" });
  const readOnly = new FakeChannel({ id: "channel-readonly", name: "regeln", writable: false });
  const thread = new FakeChannel({ id: "thread-one", name: "thread", writable: true, thread: true });
  const voiceLike = new FakeChannel({ id: "voice-one", name: "voice", writable: true, textBased: false });
  const allChannels = new Map([
    [channelOne.id, channelOne],
    [channelTwo.id, channelTwo],
    [readOnly.id, readOnly],
    [thread.id, thread],
    [voiceLike.id, voiceLike]
  ]);
  const fakeGuild = {
    id: "guild-test",
    members: { me: { id: "bot" }, fetchMe: async () => ({ id: "bot" }) },
    channels: {
      fetch: async id => id ? allChannels.get(String(id)) ?? null : allChannels
    }
  };
  const fakeVoice = {
    gatewayState: "ready",
    guildId: "guild-test",
    client: { guilds: { fetch: async () => fakeGuild } }
  };
  const output = new DiscordOutputController({ voice: fakeVoice });
  const list = await output.listWritableTextChannels();
  assert.deepEqual(list.channels.map(channel => channel.channelId).sort(), ["channel-one", "channel-two"]);

  const sent = await output.sendMessage({
    channelId: "channel-two",
    text: "Recap @everyone <@123456>",
    kind: "recap",
    requestId: "req-1"
  });
  assert.equal(sent.channelId, "channel-two");
  assert.equal(sent.kind, "recap");
  assert.equal(channelTwo.sent.length, 1);
  assert.deepEqual(channelTwo.sent[0].allowedMentions, { parse: [] }, "Discord-Erwähnungen müssen deaktiviert sein.");

  await assert.rejects(
    () => output.sendMessage({ channelId: "channel-readonly", text: "Test" }),
    /nicht beschreibbar/
  );
  await assert.rejects(
    () => output.sendMessage({ channelId: "channel-two", text: "x".repeat(2001) }),
    /2000 Zeichen/
  );

  store.close();
  console.log("Discord-Output-Smoke-Test erfolgreich: Config-Wechsel -> Kanalfilter -> mention-sicheres Senden -> Rechte-/Längenfehler bestätigt.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
