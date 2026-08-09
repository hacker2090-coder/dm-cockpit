import { formatSessionNickname } from "./session-nickname.js";

function text(value) {
  return String(value ?? "").trim();
}

function nullableText(value) {
  const normalized = text(value);
  return normalized || null;
}

function errorText(error) {
  return String(error?.message ?? error ?? "Unbekannter Fehler");
}

function mappingFingerprint(profile) {
  if (!profile?.profileId) return "";
  const mappings = Array.isArray(profile.mappings) ? profile.mappings : [];
  return JSON.stringify([
    profile.profileId,
    ...mappings
      .map(entry => [
        text(entry?.discordUserId),
        text(entry?.actorId),
        text(entry?.characterName),
        text(entry?.playerName)
      ])
      .sort((a, b) => a[0].localeCompare(b[0]))
  ]);
}

export class DiscordNicknameManager {
  constructor({ voice, store, onStatus = () => {} } = {}) {
    if (!voice) throw new Error("DiscordNicknameManager benötigt voice.");
    if (!store) throw new Error("DiscordNicknameManager benötigt store.");
    this.voice = voice;
    this.store = store;
    this.onStatus = onStatus;
    this.activeProfile = this.store.activeProfile();
    this.profileFingerprint = mappingFingerprint(this.activeProfile);
    this.participants = new Map();
    this.guildId = voice.guildId || null;
    this.channelId = null;
    this.queue = Promise.resolve();
    this.lastAction = null;
    this.lastError = null;
    this.started = false;
  }

  snapshot() {
    return {
      started: this.started,
      guildId: this.guildId,
      channelId: this.channelId,
      participantCount: this.participants.size,
      activeProfile: this.activeProfile ? {
        profileId: this.activeProfile.profileId,
        worldId: this.activeProfile.worldId,
        name: this.activeProfile.name,
        kind: this.activeProfile.kind,
        mappingCount: Array.isArray(this.activeProfile.mappings) ? this.activeProfile.mappings.length : 0
      } : null,
      unrestoredNicknameOverrides: this.store.listUnrestoredNicknameOverrides(this.guildId || null),
      lastAction: this.lastAction,
      lastError: this.lastError
    };
  }

  emitStatus(action = null, details = {}) {
    if (action) this.lastAction = action;
    if (details?.error !== undefined) this.lastError = details.error ? String(details.error) : null;
    this.onStatus({
      ...this.snapshot(),
      action,
      details: { ...details }
    });
  }

  enqueue(work) {
    const next = this.queue.then(work, work);
    this.queue = next.catch(error => {
      this.lastError = errorText(error);
      this.emitStatus("error", { error: this.lastError });
    });
    return next;
  }

  start() {
    this.started = true;
    this.activeProfile = this.store.activeProfile();
    this.profileFingerprint = mappingFingerprint(this.activeProfile);
    this.emitStatus("started");
    return this.snapshot();
  }

  profileMapping(discordUserId) {
    const id = text(discordUserId);
    if (!id || !this.activeProfile) return null;
    return (Array.isArray(this.activeProfile.mappings) ? this.activeProfile.mappings : [])
      .find(entry => text(entry?.discordUserId) === id) ?? null;
  }

  handleProfileState(payload = {}) {
    const nextProfile = payload?.activeProfile ?? this.store.activeProfile();
    const nextFingerprint = mappingFingerprint(nextProfile);
    const changed = nextFingerprint !== this.profileFingerprint;
    this.activeProfile = nextProfile || null;
    this.profileFingerprint = nextFingerprint;
    return this.enqueue(async () => {
      await this.restoreStaleLeases();
      if (this.activeProfile && changed) await this.applyAllCurrentParticipants("profile_activated_or_updated");
      this.emitStatus("profile_state", {
        activeProfileId: this.activeProfile?.profileId ?? null,
        changed
      });
      return this.snapshot();
    });
  }

  handleParticipants(payload = {}) {
    const nextGuildId = nullableText(payload.guildId) ?? this.voice.guildId ?? this.guildId;
    const nextChannelId = nullableText(payload.channelId);
    const nextParticipants = new Map();

    for (const entry of Array.isArray(payload.participants) ? payload.participants : []) {
      const discordUserId = text(entry?.discordUserId);
      if (!discordUserId || entry?.isBot) continue;
      nextParticipants.set(discordUserId, {
        discordUserId,
        displayName: text(entry?.displayName) || discordUserId,
        globalName: nullableText(entry?.globalName),
        serverNickname: nullableText(entry?.serverNickname),
        isBot: false,
        channelId: nullableText(entry?.channelId) ?? nextChannelId
      });
    }

    const previousIds = new Set(this.participants.keys());
    const joinedIds = [...nextParticipants.keys()].filter(id => !previousIds.has(id));

    this.guildId = nextGuildId || null;
    this.channelId = nextChannelId;
    this.participants = nextParticipants;

    return this.enqueue(async () => {
      await this.restoreStaleLeases();
      if (this.activeProfile) {
        for (const discordUserId of joinedIds) {
          const participant = this.participants.get(discordUserId);
          const mapping = this.profileMapping(discordUserId);
          if (participant && mapping) await this.applyOne(participant, mapping, "voice_join");
        }
      }
      this.emitStatus("participants_reconciled", {
        joined: joinedIds.length,
        current: this.participants.size
      });
      return this.snapshot();
    });
  }

  async applyAllCurrentParticipants(reason = "profile_reconcile") {
    if (!this.activeProfile) return;
    for (const participant of this.participants.values()) {
      const mapping = this.profileMapping(participant.discordUserId);
      if (mapping) await this.applyOne(participant, mapping, reason);
    }
  }

  leaseShouldRemain(lease) {
    if (!this.activeProfile || !lease) return false;
    if (lease.profileId !== this.activeProfile.profileId) return false;
    if (!this.participants.has(lease.discordUserId)) return false;
    return Boolean(this.profileMapping(lease.discordUserId));
  }

  async restoreStaleLeases() {
    const guildId = this.guildId || this.voice.guildId || null;
    if (!guildId) return;
    for (const lease of this.store.listUnrestoredNicknameOverrides(guildId)) {
      if (lease.state === "restore_conflict") continue;
      if (!this.leaseShouldRemain(lease)) await this.restoreOne(lease, "no_longer_active");
    }
  }

  async applyOne(participant, mapping, reason = "session_active") {
    const guildId = this.guildId || this.voice.guildId;
    const discordUserId = text(participant?.discordUserId);
    if (!guildId || !discordUserId || !mapping?.characterName || !this.activeProfile) return null;

    let state;
    try {
      state = await this.voice.nicknameMemberState(discordUserId);
    } catch (error) {
      const message = errorText(error);
      this.emitStatus("nickname_apply_failed", { discordUserId, error: message });
      return null;
    }

    if (!state?.botHasManageNicknames) {
      const message = "Bot hat keine Berechtigung zum Verwalten von Nicknames.";
      this.emitStatus("nickname_apply_blocked", { discordUserId, reason: "missing_manage_nicknames", error: message });
      return null;
    }
    if (!state?.manageable) {
      const message = "Discord-Mitglied kann wegen Rollen-/Eigentümer-Hierarchie nicht umbenannt werden.";
      this.emitStatus("nickname_apply_blocked", { discordUserId, reason: "member_not_manageable", error: message });
      return null;
    }

    const playerName = text(participant.displayName) || text(state.displayName) || text(mapping.playerName) || discordUserId;
    const desiredNickname = formatSessionNickname({
      characterName: mapping.characterName,
      playerName
    });

    const existingLease = this.store.getNicknameOverride(guildId, discordUserId);
    if (existingLease?.state === "restore_conflict") {
      this.store.updateNicknameState(guildId, discordUserId, "conflict_released", { error: null, restoredAt: null });
    }

    this.store.prepareNicknameOverride({
      guildId,
      discordUserId,
      profileId: this.activeProfile.profileId,
      originalNickname: state.currentNickname ?? null,
      appliedNickname: desiredNickname
    });

    try {
      if ((state.currentNickname ?? null) !== desiredNickname) {
        await this.voice.setServerNickname(
          discordUserId,
          desiredNickname,
          `DM Cockpit: ${this.activeProfile.name} aktiviert (${reason})`
        );
      }
      const lease = this.store.markNicknameApplied(guildId, discordUserId);
      this.emitStatus("nickname_applied", {
        discordUserId,
        profileId: this.activeProfile.profileId,
        nickname: desiredNickname
      });
      return lease;
    } catch (error) {
      const message = errorText(error);
      const lease = this.store.markNicknameFailure(guildId, discordUserId, "apply_failed", message);
      this.emitStatus("nickname_apply_failed", { discordUserId, error: message });
      return lease;
    }
  }

  async restoreOne(lease, reason = "restore") {
    if (!lease || lease.state === "restored" || lease.state === "restore_conflict") return lease ?? null;
    const guildId = text(lease.guildId);
    const discordUserId = text(lease.discordUserId);
    if (!guildId || !discordUserId) return null;

    let state;
    try {
      state = await this.voice.nicknameMemberState(discordUserId);
    } catch (error) {
      const message = errorText(error);
      const failed = this.store.markNicknameFailure(guildId, discordUserId, "restore_failed", message);
      this.emitStatus("nickname_restore_failed", { discordUserId, error: message });
      return failed;
    }

    if (!state?.botHasManageNicknames || !state?.manageable) {
      const message = !state?.botHasManageNicknames
        ? "Bot hat keine Berechtigung zum Wiederherstellen von Nicknames."
        : "Discord-Mitglied kann wegen Rollen-/Eigentümer-Hierarchie nicht zurückbenannt werden.";
      const failed = this.store.markNicknameFailure(guildId, discordUserId, "restore_failed", message);
      this.emitStatus("nickname_restore_failed", { discordUserId, error: message });
      return failed;
    }

    const currentNickname = state.currentNickname ?? null;
    const originalNickname = lease.originalNickname ?? null;
    if (currentNickname === originalNickname) {
      const restored = this.store.markNicknameRestored(guildId, discordUserId);
      this.emitStatus("nickname_restored", { discordUserId, reason, noOp: true });
      return restored;
    }

    if (currentNickname !== lease.appliedNickname) {
      const message = "Aktueller Nickname wurde außerhalb von DM Cockpit verändert; Restore wurde zum Schutz nicht überschrieben.";
      const conflict = this.store.markNicknameFailure(guildId, discordUserId, "restore_conflict", message);
      this.emitStatus("nickname_restore_conflict", {
        discordUserId,
        reason,
        currentNickname,
        expectedAppliedNickname: lease.appliedNickname,
        error: message
      });
      return conflict;
    }

    try {
      await this.voice.setServerNickname(
        discordUserId,
        originalNickname,
        `DM Cockpit: Session-Nickname zurücksetzen (${reason})`
      );
      const restored = this.store.markNicknameRestored(guildId, discordUserId);
      this.emitStatus("nickname_restored", { discordUserId, reason, noOp: false });
      return restored;
    } catch (error) {
      const message = errorText(error);
      const failed = this.store.markNicknameFailure(guildId, discordUserId, "restore_failed", message);
      this.emitStatus("nickname_restore_failed", { discordUserId, error: message });
      return failed;
    }
  }

  restoreAll(reason = "session_deactivated") {
    return this.enqueue(async () => {
      const guildId = this.guildId || this.voice.guildId || null;
      if (!guildId) return [];
      const results = [];
      for (const lease of this.store.listUnrestoredNicknameOverrides(guildId)) {
        if (lease.state === "restore_conflict") continue;
        results.push(await this.restoreOne(lease, reason));
      }
      this.emitStatus("nickname_restore_all", { reason, count: results.length });
      return results;
    });
  }

  async shutdown() {
    await this.restoreAll("companion_shutdown");
    this.started = false;
    this.emitStatus("stopped");
  }
}
