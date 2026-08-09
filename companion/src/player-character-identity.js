function text(value) {
  return String(value ?? "").trim();
}

export class PlayerCharacterIdentityRegistry {
  constructor() {
    this.worldId = null;
    this.mappings = new Map();
  }

  replace(payload = {}) {
    const worldId = text(payload.worldId);
    if (!worldId || !Array.isArray(payload.mappings)) return false;

    const next = new Map();
    for (const raw of payload.mappings) {
      const discordUserId = text(raw?.discordUserId);
      const actorId = text(raw?.actorId);
      const characterName = text(raw?.characterName);
      if (!discordUserId || !actorId || !characterName) continue;
      next.set(discordUserId, {
        discordUserId,
        playerName: text(raw?.playerName) || null,
        actorId,
        actorUuid: text(raw?.actorUuid) || null,
        characterName
      });
    }

    this.worldId = worldId;
    this.mappings = next;
    return true;
  }

  clear() {
    this.worldId = null;
    this.mappings.clear();
  }

  get(discordUserId) {
    const id = text(discordUserId);
    return id ? (this.mappings.get(id) ?? null) : null;
  }

  enrichTranscript(payload = {}) {
    const discordUserId = text(payload.discordUserId);
    const mapping = this.get(discordUserId);
    return {
      ...payload,
      playerName: mapping?.playerName ?? (text(payload.speakerName) || null),
      actorId: mapping?.actorId ?? null,
      actorUuid: mapping?.actorUuid ?? null,
      characterName: mapping?.characterName ?? null
    };
  }

  snapshot() {
    return {
      worldId: this.worldId,
      mappings: [...this.mappings.values()].map(entry => ({ ...entry }))
    };
  }
}
