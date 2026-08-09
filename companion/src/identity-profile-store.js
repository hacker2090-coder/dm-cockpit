import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE_KINDS = new Set(["campaign", "oneshot", "session"]);
const UNRESTORED_STATES = new Set(["prepared", "applied", "apply_failed", "restore_failed", "restore_conflict"]);

function text(value) {
  return String(value ?? "").trim();
}

function nullableText(value) {
  const normalized = text(value);
  return normalized || null;
}

export function identityDatabasePath() {
  return resolve(process.env.DM_COCKPIT_DB_PATH?.trim() || resolve(APP_DIR, "data", "dm-cockpit.sqlite"));
}

export class IdentityProfileStore {
  constructor(path = identityDatabasePath()) {
    this.path = resolve(path);
    mkdirSync(dirname(this.path), { recursive: true });
    this.db = new DatabaseSync(this.path, { timeout: 5000 });
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS identity_profiles (
        profile_id TEXT PRIMARY KEY,
        world_id TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_identity_profiles_world_name
        ON identity_profiles(world_id, name);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_profiles_single_active
        ON identity_profiles(active)
        WHERE active = 1;

      CREATE TABLE IF NOT EXISTS identity_profile_members (
        profile_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        player_name TEXT,
        actor_id TEXT NOT NULL,
        actor_uuid TEXT,
        character_name TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (profile_id, discord_user_id),
        FOREIGN KEY (profile_id) REFERENCES identity_profiles(profile_id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_identity_profile_members_profile
        ON identity_profile_members(profile_id, character_name);

      CREATE TABLE IF NOT EXISTS discord_nickname_overrides (
        guild_id TEXT NOT NULL,
        discord_user_id TEXT NOT NULL,
        profile_id TEXT NOT NULL,
        original_nickname TEXT,
        applied_nickname TEXT NOT NULL,
        state TEXT NOT NULL,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        restored_at TEXT,
        PRIMARY KEY (guild_id, discord_user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_nickname_override_state
        ON discord_nickname_overrides(state, updated_at);
    `);
  }

  normalizeMappings(mappings, timestamp) {
    if (!Array.isArray(mappings) || mappings.length > 100) return null;
    const byUser = new Map();
    for (const raw of mappings) {
      const discordUserId = text(raw?.discordUserId);
      const actorId = text(raw?.actorId);
      const characterName = text(raw?.characterName);
      if (!discordUserId || !actorId || !characterName) return null;
      byUser.set(discordUserId, {
        discordUserId,
        playerName: nullableText(raw?.playerName),
        actorId,
        actorUuid: nullableText(raw?.actorUuid),
        characterName,
        updatedAt: text(raw?.updatedAt) || timestamp
      });
    }
    return [...byUser.values()];
  }

  saveProfile(payload = {}, timestamp = new Date().toISOString()) {
    const profileId = text(payload.profileId);
    const worldId = text(payload.worldId);
    const name = text(payload.name);
    const kind = text(payload.kind).toLowerCase();
    const mappings = this.normalizeMappings(payload.mappings, timestamp);
    if (!profileId || !worldId || !name || !PROFILE_KINDS.has(kind) || !mappings) return false;

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`
        INSERT INTO identity_profiles (profile_id, world_id, name, kind, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
        ON CONFLICT(profile_id) DO UPDATE SET
          world_id = excluded.world_id,
          name = excluded.name,
          kind = excluded.kind,
          updated_at = excluded.updated_at
      `).run(profileId, worldId, name, kind, timestamp, timestamp);

      this.db.prepare("DELETE FROM identity_profile_members WHERE profile_id = ?").run(profileId);
      const insert = this.db.prepare(`
        INSERT INTO identity_profile_members (
          profile_id, discord_user_id, player_name, actor_id, actor_uuid, character_name, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const mapping of mappings) {
        insert.run(
          profileId,
          mapping.discordUserId,
          mapping.playerName,
          mapping.actorId,
          mapping.actorUuid,
          mapping.characterName,
          mapping.updatedAt
        );
      }
      this.db.exec("COMMIT");
      return true;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch (_rollbackError) {}
      throw error;
    }
  }

  profileMappings(profileId) {
    const id = text(profileId);
    if (!id) return [];
    const rows = this.db.prepare(`
      SELECT discord_user_id, player_name, actor_id, actor_uuid, character_name, updated_at
      FROM identity_profile_members
      WHERE profile_id = ?
      ORDER BY COALESCE(player_name, character_name) COLLATE NOCASE, discord_user_id
    `).all(id);
    return rows.map(row => ({
      discordUserId: String(row.discord_user_id),
      playerName: row.player_name ?? null,
      actorId: String(row.actor_id),
      actorUuid: row.actor_uuid ?? null,
      characterName: String(row.character_name),
      updatedAt: String(row.updated_at)
    }));
  }

  profileById(profileId) {
    const id = text(profileId);
    if (!id) return null;
    const row = this.db.prepare(`
      SELECT profile_id, world_id, name, kind, active, created_at, updated_at
      FROM identity_profiles
      WHERE profile_id = ?
    `).get(id);
    if (!row) return null;
    return {
      profileId: String(row.profile_id),
      worldId: String(row.world_id),
      name: String(row.name),
      kind: String(row.kind),
      active: Boolean(row.active),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      mappings: this.profileMappings(id)
    };
  }

  listProfiles(worldId = null) {
    const normalizedWorldId = nullableText(worldId);
    const rows = normalizedWorldId
      ? this.db.prepare(`
          SELECT profile_id FROM identity_profiles
          WHERE world_id = ?
          ORDER BY active DESC, name COLLATE NOCASE, updated_at DESC
        `).all(normalizedWorldId)
      : this.db.prepare(`
          SELECT profile_id FROM identity_profiles
          ORDER BY active DESC, world_id COLLATE NOCASE, name COLLATE NOCASE
        `).all();
    return rows.map(row => this.profileById(row.profile_id)).filter(Boolean);
  }

  activeProfile() {
    const row = this.db.prepare("SELECT profile_id FROM identity_profiles WHERE active = 1 LIMIT 1").get();
    return row ? this.profileById(row.profile_id) : null;
  }

  activateProfile(profileId, timestamp = new Date().toISOString()) {
    const profile = this.profileById(profileId);
    if (!profile) return null;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE identity_profiles SET active = 0, updated_at = ? WHERE active = 1").run(timestamp);
      this.db.prepare("UPDATE identity_profiles SET active = 1, updated_at = ? WHERE profile_id = ?")
        .run(timestamp, profile.profileId);
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch (_rollbackError) {}
      throw error;
    }
    return this.profileById(profile.profileId);
  }

  deactivateAll(timestamp = new Date().toISOString()) {
    this.db.prepare("UPDATE identity_profiles SET active = 0, updated_at = ? WHERE active = 1").run(timestamp);
    return true;
  }

  deleteProfile(profileId) {
    const id = text(profileId);
    if (!id) return false;
    const result = this.db.prepare("DELETE FROM identity_profiles WHERE profile_id = ?").run(id);
    return Number(result?.changes ?? 0) > 0;
  }

  prepareNicknameOverride(payload = {}, timestamp = new Date().toISOString()) {
    const guildId = text(payload.guildId);
    const discordUserId = text(payload.discordUserId);
    const profileId = text(payload.profileId);
    const appliedNickname = text(payload.appliedNickname);
    if (!guildId || !discordUserId || !profileId || !appliedNickname) return false;

    const existing = this.getNicknameOverride(guildId, discordUserId);
    const keepOriginal = existing && UNRESTORED_STATES.has(existing.state);
    const originalNickname = keepOriginal ? existing.originalNickname : (payload.originalNickname ?? null);
    const createdAt = keepOriginal ? existing.createdAt : timestamp;

    this.db.prepare(`
      INSERT INTO discord_nickname_overrides (
        guild_id, discord_user_id, profile_id, original_nickname, applied_nickname,
        state, last_error, created_at, updated_at, restored_at
      ) VALUES (?, ?, ?, ?, ?, 'prepared', NULL, ?, ?, NULL)
      ON CONFLICT(guild_id, discord_user_id) DO UPDATE SET
        profile_id = excluded.profile_id,
        original_nickname = excluded.original_nickname,
        applied_nickname = excluded.applied_nickname,
        state = 'prepared',
        last_error = NULL,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        restored_at = NULL
    `).run(
      guildId,
      discordUserId,
      profileId,
      originalNickname ?? null,
      appliedNickname,
      createdAt,
      timestamp
    );
    return true;
  }

  getNicknameOverride(guildId, discordUserId) {
    const guild = text(guildId);
    const user = text(discordUserId);
    if (!guild || !user) return null;
    const row = this.db.prepare(`
      SELECT guild_id, discord_user_id, profile_id, original_nickname, applied_nickname,
             state, last_error, created_at, updated_at, restored_at
      FROM discord_nickname_overrides
      WHERE guild_id = ? AND discord_user_id = ?
    `).get(guild, user);
    return row ? this.nicknameRow(row) : null;
  }

  nicknameRow(row) {
    return {
      guildId: String(row.guild_id),
      discordUserId: String(row.discord_user_id),
      profileId: String(row.profile_id),
      originalNickname: row.original_nickname ?? null,
      appliedNickname: String(row.applied_nickname),
      state: String(row.state),
      lastError: row.last_error ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      restoredAt: row.restored_at ?? null
    };
  }

  listUnrestoredNicknameOverrides(guildId = null) {
    const guild = nullableText(guildId);
    const placeholders = [...UNRESTORED_STATES].map(() => "?").join(", ");
    const states = [...UNRESTORED_STATES];
    const rows = guild
      ? this.db.prepare(`
          SELECT guild_id, discord_user_id, profile_id, original_nickname, applied_nickname,
                 state, last_error, created_at, updated_at, restored_at
          FROM discord_nickname_overrides
          WHERE guild_id = ? AND state IN (${placeholders})
          ORDER BY updated_at
        `).all(guild, ...states)
      : this.db.prepare(`
          SELECT guild_id, discord_user_id, profile_id, original_nickname, applied_nickname,
                 state, last_error, created_at, updated_at, restored_at
          FROM discord_nickname_overrides
          WHERE state IN (${placeholders})
          ORDER BY updated_at
        `).all(...states);
    return rows.map(row => this.nicknameRow(row));
  }

  updateNicknameState(guildId, discordUserId, state, { error = null, restoredAt = null } = {}, timestamp = new Date().toISOString()) {
    const guild = text(guildId);
    const user = text(discordUserId);
    const normalizedState = text(state);
    if (!guild || !user || !normalizedState) return null;
    const result = this.db.prepare(`
      UPDATE discord_nickname_overrides
      SET state = ?, last_error = ?, updated_at = ?, restored_at = ?
      WHERE guild_id = ? AND discord_user_id = ?
    `).run(normalizedState, error ?? null, timestamp, restoredAt ?? null, guild, user);
    if (!Number(result?.changes ?? 0)) return null;
    return this.getNicknameOverride(guild, user);
  }

  markNicknameApplied(guildId, discordUserId, timestamp = new Date().toISOString()) {
    return this.updateNicknameState(guildId, discordUserId, "applied", {}, timestamp);
  }

  markNicknameRestored(guildId, discordUserId, timestamp = new Date().toISOString()) {
    return this.updateNicknameState(guildId, discordUserId, "restored", { restoredAt: timestamp }, timestamp);
  }

  markNicknameFailure(guildId, discordUserId, state, error, timestamp = new Date().toISOString()) {
    return this.updateNicknameState(guildId, discordUserId, state, { error: text(error) || "Unbekannter Fehler" }, timestamp);
  }

  stats() {
    const profiles = Number(this.db.prepare("SELECT COUNT(*) AS count FROM identity_profiles").get().count);
    const activeProfiles = Number(this.db.prepare("SELECT COUNT(*) AS count FROM identity_profiles WHERE active = 1").get().count);
    const nicknameOverrides = Number(this.db.prepare("SELECT COUNT(*) AS count FROM discord_nickname_overrides").get().count);
    const unrestoredNicknameOverrides = Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM discord_nickname_overrides WHERE state != 'restored'").get().count
    );
    return { profiles, activeProfiles, nicknameOverrides, unrestoredNicknameOverrides };
  }

  close() {
    if (this.db.isOpen) this.db.close();
  }
}
