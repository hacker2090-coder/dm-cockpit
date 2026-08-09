import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiscordNicknameManager } from "./discord-nickname-manager.js";
import { IdentityProfileStore } from "./identity-profile-store.js";
import { formatSessionNickname, nicknameLength } from "./session-nickname.js";

class FakeVoice {
  constructor() {
    this.guildId = "guild-test";
    this.members = new Map();
    this.calls = [];
  }

  addMember(discordUserId, nickname = null, { manageable = true, botHasManageNicknames = true } = {}) {
    this.members.set(String(discordUserId), {
      nickname,
      manageable,
      botHasManageNicknames,
      displayName: String(discordUserId)
    });
  }

  async nicknameMemberState(discordUserId) {
    const member = this.members.get(String(discordUserId));
    if (!member) throw new Error(`Member ${discordUserId} fehlt.`);
    return {
      guildId: this.guildId,
      discordUserId: String(discordUserId),
      displayName: member.displayName,
      currentNickname: member.nickname ?? null,
      manageable: Boolean(member.manageable),
      botHasManageNicknames: Boolean(member.botHasManageNicknames)
    };
  }

  async setServerNickname(discordUserId, nickname, reason) {
    const member = this.members.get(String(discordUserId));
    if (!member) throw new Error(`Member ${discordUserId} fehlt.`);
    member.nickname = nickname ?? null;
    this.calls.push({
      discordUserId: String(discordUserId),
      nickname: nickname ?? null,
      reason: String(reason ?? "")
    });
    return this.nicknameMemberState(discordUserId);
  }

  nickname(discordUserId) {
    return this.members.get(String(discordUserId))?.nickname ?? null;
  }
}

const dir = mkdtempSync(join(tmpdir(), "dm-cockpit-profile-"));
const dbPath = join(dir, "profiles.sqlite");

try {
  const store = new IdentityProfileStore(dbPath);
  const mappingOne = {
    discordUserId: "discord-42",
    playerName: "Mira Gespeichert",
    actorId: "actor-7",
    actorUuid: "Actor.actor-7",
    characterName: "Ragna",
    updatedAt: "2026-08-09T16:40:00.000Z"
  };
  const mappingTwo = {
    ...mappingOne,
    actorId: "actor-8",
    actorUuid: "Actor.actor-8",
    characterName: "Nyx"
  };

  assert.equal(store.saveProfile({
    profileId: "profile-one",
    worldId: "world-test",
    name: "One-Shot Eins",
    kind: "oneshot",
    mappings: [mappingOne]
  }, "2026-08-09T16:40:00.000Z"), true);

  assert.equal(store.saveProfile({
    profileId: "profile-two",
    worldId: "world-test",
    name: "Kampagne Zwei",
    kind: "campaign",
    mappings: [mappingTwo]
  }, "2026-08-09T16:41:00.000Z"), true);

  assert.equal(store.listProfiles("world-test").length, 2);
  assert.equal(store.activateProfile("profile-one")?.profileId, "profile-one");
  assert.equal(store.listProfiles("world-test").filter(profile => profile.active).length, 1);

  assert.equal(formatSessionNickname({ characterName: "Ragna", playerName: "Mira" }), "Ragna | Mira");
  const bounded = formatSessionNickname({
    characterName: "Ein sehr sehr langer Charaktername mit Zusatz",
    playerName: "Spielername"
  });
  assert.equal(nicknameLength(bounded) <= 32, true);
  assert.equal(bounded.startsWith("Ein sehr sehr langer"), true);

  const voice = new FakeVoice();
  voice.addMember("discord-42", "Mira Alt");
  const statuses = [];
  const manager = new DiscordNicknameManager({
    voice,
    store,
    onStatus: status => statuses.push(status)
  });
  manager.start();

  const participants = {
    guildId: voice.guildId,
    channelId: "voice-one",
    participants: [{
      discordUserId: "discord-42",
      displayName: "Mira",
      serverNickname: "Mira Alt",
      isBot: false,
      channelId: "voice-one"
    }]
  };

  await manager.handleParticipants(participants);
  assert.equal(voice.nickname("discord-42"), "Ragna | Mira", "Aktueller Discord-Anzeigename soll einen alten gespeicherten Spielernamen überstimmen.");
  assert.equal(voice.calls.length, 1, "Join soll Session-Nickname genau einmal anwenden.");
  let lease = store.getNicknameOverride(voice.guildId, "discord-42");
  assert.equal(lease.originalNickname, "Mira Alt");
  assert.equal(lease.appliedNickname, "Ragna | Mira");
  assert.equal(lease.state, "applied");

  await manager.handleParticipants(participants);
  assert.equal(voice.calls.length, 1, "Unveränderte Teilnehmerliste darf keinen erneuten Nickname-Write auslösen.");

  await manager.handleParticipants({ guildId: voice.guildId, channelId: null, participants: [] });
  assert.equal(voice.nickname("discord-42"), "Mira Alt");
  assert.equal(store.getNicknameOverride(voice.guildId, "discord-42").state, "restored");

  await manager.handleParticipants(participants);
  assert.equal(voice.nickname("discord-42"), "Ragna | Mira");

  voice.members.get("discord-42").nickname = "Mira Manuell";
  await manager.handleParticipants({ guildId: voice.guildId, channelId: null, participants: [] });
  lease = store.getNicknameOverride(voice.guildId, "discord-42");
  assert.equal(lease.state, "restore_conflict");
  assert.equal(voice.nickname("discord-42"), "Mira Manuell", "Manuelle Änderung darf beim Restore nicht überschrieben werden.");

  await manager.handleParticipants(participants);
  assert.equal(voice.nickname("discord-42"), "Ragna | Mira");
  lease = store.getNicknameOverride(voice.guildId, "discord-42");
  assert.equal(lease.originalNickname, "Mira Manuell", "Nach Konflikt muss der neue manuelle Name zur Restore-Basis werden.");

  await manager.handleParticipants({ guildId: voice.guildId, channelId: null, participants: [] });
  assert.equal(voice.nickname("discord-42"), "Mira Manuell");
  assert.equal(store.getNicknameOverride(voice.guildId, "discord-42").state, "restored");

  await manager.handleParticipants(participants);
  assert.equal(voice.nickname("discord-42"), "Ragna | Mira");
  const profileTwo = store.activateProfile("profile-two");
  await manager.handleProfileState({ activeProfile: profileTwo });
  assert.equal(voice.nickname("discord-42"), "Nyx | Mira");
  lease = store.getNicknameOverride(voice.guildId, "discord-42");
  assert.equal(lease.originalNickname, "Mira Manuell", "Profilwechsel muss die ursprüngliche Restore-Basis behalten.");
  assert.equal(lease.profileId, "profile-two");

  store.deactivateAll();
  await manager.handleProfileState({ activeProfile: null });
  assert.equal(voice.nickname("discord-42"), "Mira Manuell");
  assert.equal(store.activeProfile(), null);
  assert.equal(store.getNicknameOverride(voice.guildId, "discord-42").state, "restored");

  store.activateProfile("profile-one");
  voice.members.get("discord-42").nickname = "Crash Basis";
  const crashManager = new DiscordNicknameManager({ voice, store });
  crashManager.start();
  await crashManager.handleParticipants(participants);
  assert.equal(voice.nickname("discord-42"), "Ragna | Mira");
  const crashLease = store.getNicknameOverride(voice.guildId, "discord-42");
  assert.equal(crashLease.originalNickname, "Crash Basis");

  const restartedManager = new DiscordNicknameManager({ voice, store });
  restartedManager.start();
  await restartedManager.handleParticipants({ guildId: voice.guildId, channelId: null, participants: [] });
  assert.equal(voice.nickname("discord-42"), "Crash Basis", "Neuer Manager muss persistierten Lease nach Restart restaurieren können.");
  assert.equal(store.getNicknameOverride(voice.guildId, "discord-42").state, "restored");

  assert.equal(statuses.some(status => status.action === "nickname_restore_conflict"), true);

  store.close();
  console.log("Identity-Profile-Smoke-Test erfolgreich: Profil -> Join Apply -> Leave Restore -> Konfliktschutz -> Rejoin -> Profilwechsel -> Deactivate -> Crash-Recovery bestätigt.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
