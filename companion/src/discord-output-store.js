import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

function clean(value) {
  return String(value ?? "").trim();
}

export class DiscordOutputStore {
  constructor(path) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS discord_output_settings (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        channel_name TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS discord_output_posts (
        request_id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        session_id TEXT,
        guild_id TEXT,
        channel_id TEXT,
        discord_message_id TEXT,
        status TEXT NOT NULL,
        text_length INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_discord_output_posts_session_kind
        ON discord_output_posts(session_id, kind, status);
    `);
  }

  selectedChannel(guildId) {
    const id = clean(guildId);
    if (!id) return null;
    const row = this.db.prepare(`
      SELECT guild_id, channel_id, channel_name, updated_at
      FROM discord_output_settings
      WHERE guild_id = ?
    `).get(id);
    if (!row) return null;
    return {
      guildId: String(row.guild_id),
      channelId: String(row.channel_id),
      channelName: row.channel_name ?? null,
      updatedAt: String(row.updated_at)
    };
  }

  setSelectedChannel(guildId, channelId, channelName = null, timestamp = new Date().toISOString()) {
    const guild = clean(guildId);
    const channel = clean(channelId);
    if (!guild || !channel) return false;
    this.db.prepare(`
      INSERT INTO discord_output_settings (guild_id, channel_id, channel_name, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        channel_name = excluded.channel_name,
        updated_at = excluded.updated_at
    `).run(guild, channel, clean(channelName) || null, timestamp);
    return true;
  }

  clearSelectedChannel(guildId) {
    const id = clean(guildId);
    if (!id) return false;
    this.db.prepare("DELETE FROM discord_output_settings WHERE guild_id = ?").run(id);
    return true;
  }

  getPost(requestId) {
    const id = clean(requestId);
    if (!id) return null;
    const row = this.db.prepare(`
      SELECT request_id, kind, session_id, guild_id, channel_id, discord_message_id,
             status, text_length, error, created_at, updated_at
      FROM discord_output_posts
      WHERE request_id = ?
    `).get(id);
    if (!row) return null;
    return {
      requestId: String(row.request_id),
      kind: String(row.kind),
      sessionId: row.session_id ?? null,
      guildId: row.guild_id ?? null,
      channelId: row.channel_id ?? null,
      discordMessageId: row.discord_message_id ?? null,
      status: String(row.status),
      textLength: Number(row.text_length ?? 0),
      error: row.error ?? null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at)
    };
  }

  recordPost(record, timestamp = new Date().toISOString()) {
    const requestId = clean(record?.requestId);
    const kind = clean(record?.kind);
    const status = clean(record?.status);
    if (!requestId || !kind || !status) return false;
    const existing = this.getPost(requestId);
    this.db.prepare(`
      INSERT INTO discord_output_posts (
        request_id, kind, session_id, guild_id, channel_id, discord_message_id,
        status, text_length, error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(request_id) DO UPDATE SET
        kind = excluded.kind,
        session_id = excluded.session_id,
        guild_id = excluded.guild_id,
        channel_id = excluded.channel_id,
        discord_message_id = excluded.discord_message_id,
        status = excluded.status,
        text_length = excluded.text_length,
        error = excluded.error,
        updated_at = excluded.updated_at
    `).run(
      requestId,
      kind,
      clean(record.sessionId) || null,
      clean(record.guildId) || null,
      clean(record.channelId) || null,
      clean(record.discordMessageId) || null,
      status,
      Math.max(0, Number(record.textLength) || 0),
      clean(record.error) || null,
      existing?.createdAt ?? timestamp,
      timestamp
    );
    return true;
  }

  hasSent(kind, sessionId, guildId = null) {
    const normalizedKind = clean(kind);
    const normalizedSessionId = clean(sessionId);
    if (!normalizedKind || !normalizedSessionId) return false;
    const guild = clean(guildId);
    const row = guild
      ? this.db.prepare(`
          SELECT 1 AS found FROM discord_output_posts
          WHERE kind = ? AND session_id = ? AND guild_id = ? AND status = 'sent'
          LIMIT 1
        `).get(normalizedKind, normalizedSessionId, guild)
      : this.db.prepare(`
          SELECT 1 AS found FROM discord_output_posts
          WHERE kind = ? AND session_id = ? AND status = 'sent'
          LIMIT 1
        `).get(normalizedKind, normalizedSessionId);
    return Boolean(row?.found);
  }

  stats() {
    const settings = this.db.prepare("SELECT COUNT(*) AS count FROM discord_output_settings").get();
    const sent = this.db.prepare("SELECT COUNT(*) AS count FROM discord_output_posts WHERE status = 'sent'").get();
    const failed = this.db.prepare("SELECT COUNT(*) AS count FROM discord_output_posts WHERE status = 'failed'").get();
    return {
      configuredGuilds: Number(settings?.count ?? 0),
      sentPosts: Number(sent?.count ?? 0),
      failedPosts: Number(failed?.count ?? 0)
    };
  }

  close() {
    this.db.close();
  }
}
