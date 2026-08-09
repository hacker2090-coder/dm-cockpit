import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_CAPTURE_NOTICE_TEXT = "DM Cockpit: Diese Pen-&-Paper-Session nutzt Sprachtranskription zur Unterstützung der Spielleitung. Roh-Audio wird nicht dauerhaft gespeichert.";

function text(value) {
  return String(value ?? "").trim();
}

function nullableText(value) {
  const normalized = text(value);
  return normalized || null;
}

export function discordOutputDatabasePath() {
  return resolve(process.env.DM_COCKPIT_DB_PATH?.trim() || resolve(APP_DIR, "data", "dm-cockpit.sqlite"));
}

export class DiscordOutputStore {
  constructor(path = discordOutputDatabasePath()) {
    this.path = resolve(path);
    mkdirSync(dirname(this.path), { recursive: true });
    this.db = new DatabaseSync(this.path, { timeout: 5000 });
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS discord_output_settings (
        world_id TEXT PRIMARY KEY,
        guild_id TEXT,
        channel_id TEXT,
        notice_text TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  getConfig(worldId) {
    const id = text(worldId);
    if (!id) return null;
    const row = this.db.prepare(`
      SELECT world_id, guild_id, channel_id, notice_text, updated_at
      FROM discord_output_settings
      WHERE world_id = ?
    `).get(id);
    if (!row) return null;
    return {
      worldId: String(row.world_id),
      guildId: row.guild_id ?? null,
      channelId: row.channel_id ?? null,
      noticeText: String(row.notice_text ?? DEFAULT_CAPTURE_NOTICE_TEXT),
      updatedAt: String(row.updated_at)
    };
  }

  setConfig(payload = {}, timestamp = new Date().toISOString()) {
    const worldId = text(payload.worldId);
    if (!worldId) return null;
    const guildId = nullableText(payload.guildId);
    const channelId = nullableText(payload.channelId);
    const noticeText = text(payload.noticeText) || DEFAULT_CAPTURE_NOTICE_TEXT;
    if (Array.from(noticeText).length > 1900) return null;

    this.db.prepare(`
      INSERT INTO discord_output_settings (world_id, guild_id, channel_id, notice_text, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(world_id) DO UPDATE SET
        guild_id = excluded.guild_id,
        channel_id = excluded.channel_id,
        notice_text = excluded.notice_text,
        updated_at = excluded.updated_at
    `).run(worldId, guildId, channelId, noticeText, timestamp);
    return this.getConfig(worldId);
  }

  configOrDefault(worldId) {
    const id = text(worldId);
    if (!id) return null;
    return this.getConfig(id) ?? {
      worldId: id,
      guildId: null,
      channelId: null,
      noticeText: DEFAULT_CAPTURE_NOTICE_TEXT,
      updatedAt: null
    };
  }

  stats() {
    return {
      outputSettings: Number(this.db.prepare("SELECT COUNT(*) AS count FROM discord_output_settings").get().count)
    };
  }

  close() {
    if (this.db.isOpen) this.db.close();
  }
}
