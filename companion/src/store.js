import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

function json(value) {
  return value === undefined ? null : JSON.stringify(value);
}

export class CompanionStore {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        started_at TEXT,
        ended_at TEXT,
        guild_id TEXT,
        voice_channel_id TEXT,
        gm_discord_user_id TEXT,
        capture_policy TEXT,
        provider_meta_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS speakers (
        discord_user_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        global_name TEXT,
        is_bot INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS transcript_segments (
        segment_id TEXT PRIMARY KEY,
        session_id TEXT,
        discord_user_id TEXT NOT NULL,
        speaker_name TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        text TEXT NOT NULL,
        final INTEGER NOT NULL,
        language TEXT,
        provider TEXT,
        confidence REAL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_transcript_session_time
        ON transcript_segments(session_id, started_at);

      CREATE TABLE IF NOT EXISTS npc_context_events (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        source TEXT NOT NULL,
        actor_id TEXT,
        actor_uuid TEXT,
        actor_name TEXT,
        changed_at TEXT,
        received_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_npc_context_session_time
        ON npc_context_events(session_id, received_at);

      CREATE TABLE IF NOT EXISTS change_records (
        change_id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        flag_path TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        source_candidate_id TEXT,
        created_at TEXT NOT NULL,
        undone_at TEXT
      );
    `);
  }

  upsertSession(sessionId, payload = {}, timestamp = new Date().toISOString()) {
    if (!sessionId) return;
    const stmt = this.db.prepare(`
      INSERT INTO sessions (
        id, started_at, guild_id, voice_channel_id, gm_discord_user_id,
        capture_policy, provider_meta_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        started_at = COALESCE(excluded.started_at, sessions.started_at),
        guild_id = COALESCE(excluded.guild_id, sessions.guild_id),
        voice_channel_id = COALESCE(excluded.voice_channel_id, sessions.voice_channel_id),
        gm_discord_user_id = COALESCE(excluded.gm_discord_user_id, sessions.gm_discord_user_id),
        capture_policy = COALESCE(excluded.capture_policy, sessions.capture_policy),
        provider_meta_json = COALESCE(excluded.provider_meta_json, sessions.provider_meta_json),
        updated_at = excluded.updated_at
    `);
    stmt.run(
      sessionId,
      payload.startedAt ?? timestamp,
      payload.guildId ?? null,
      payload.voiceChannelId ?? null,
      payload.gmDiscordUserId ?? null,
      payload.capturePolicy ?? payload.policy ?? null,
      json(payload.providers ?? payload.providerMeta),
      timestamp,
      timestamp
    );
  }

  endSession(sessionId, payload = {}, timestamp = new Date().toISOString()) {
    if (!sessionId) return;
    this.upsertSession(sessionId, payload, timestamp);
    this.db.prepare("UPDATE sessions SET ended_at = ?, updated_at = ? WHERE id = ?")
      .run(payload.endedAt ?? timestamp, timestamp, sessionId);
  }

  upsertSpeaker(payload, timestamp = new Date().toISOString()) {
    if (!payload?.discordUserId || !payload?.displayName) return;
    this.db.prepare(`
      INSERT INTO speakers (discord_user_id, display_name, global_name, is_bot, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(discord_user_id) DO UPDATE SET
        display_name = excluded.display_name,
        global_name = excluded.global_name,
        is_bot = excluded.is_bot,
        updated_at = excluded.updated_at
    `).run(
      String(payload.discordUserId),
      String(payload.displayName),
      payload.globalName ?? null,
      payload.isBot ? 1 : 0,
      timestamp
    );
  }

  upsertTranscriptSegment(sessionId, payload, timestamp = new Date().toISOString()) {
    if (!payload?.segmentId || !payload?.text || payload.final === false) return false;
    this.db.prepare(`
      INSERT INTO transcript_segments (
        segment_id, session_id, discord_user_id, speaker_name, started_at, ended_at,
        text, final, language, provider, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(segment_id) DO UPDATE SET
        session_id = excluded.session_id,
        discord_user_id = excluded.discord_user_id,
        speaker_name = excluded.speaker_name,
        started_at = excluded.started_at,
        ended_at = excluded.ended_at,
        text = excluded.text,
        final = excluded.final,
        language = excluded.language,
        provider = excluded.provider,
        confidence = excluded.confidence
    `).run(
      String(payload.segmentId),
      sessionId ?? null,
      String(payload.discordUserId ?? "unknown"),
      String(payload.speakerName ?? "Unbekannt"),
      String(payload.startedAt ?? timestamp),
      String(payload.endedAt ?? timestamp),
      String(payload.text),
      payload.final === false ? 0 : 1,
      payload.language ?? null,
      payload.provider ?? null,
      typeof payload.confidence === "number" ? payload.confidence : null,
      timestamp
    );
    return true;
  }

  addNpcContext(eventId, sessionId, payload, timestamp = new Date().toISOString()) {
    if (!eventId || !payload?.source) return;
    this.db.prepare(`
      INSERT OR IGNORE INTO npc_context_events (
        id, session_id, source, actor_id, actor_uuid, actor_name, changed_at, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      eventId,
      sessionId ?? null,
      String(payload.source),
      payload.actorId ?? null,
      payload.actorUuid ?? null,
      payload.actorName ?? null,
      payload.changedAt ?? null,
      timestamp
    );
  }

  stats() {
    const sessions = this.db.prepare("SELECT COUNT(*) AS count FROM sessions").get().count;
    const speakers = this.db.prepare("SELECT COUNT(*) AS count FROM speakers").get().count;
    const segments = this.db.prepare("SELECT COUNT(*) AS count FROM transcript_segments").get().count;
    const npcContexts = this.db.prepare("SELECT COUNT(*) AS count FROM npc_context_events").get().count;
    return { sessions, speakers, segments, npcContexts };
  }

  close() {
    if (this.db.isOpen) this.db.close();
  }
}
