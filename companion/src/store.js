import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

function json(value) {
  return value === undefined ? null : JSON.stringify(value);
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch (_error) {
    return [];
  }
}

const CANDIDATE_TABLES = {
  "npc.memory.candidate": "npc_memory_candidates",
  "session.event.candidate": "session_event_candidates"
};

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

      CREATE TABLE IF NOT EXISTS npc_memory_candidates (
        candidate_id TEXT PRIMARY KEY,
        session_id TEXT,
        actor_id TEXT NOT NULL,
        actor_uuid TEXT,
        text TEXT NOT NULL,
        kind TEXT NOT NULL,
        source_segment_ids_json TEXT NOT NULL,
        confidence REAL,
        provider TEXT,
        model TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        received_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_npc_candidate_session_time
        ON npc_memory_candidates(session_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_npc_candidate_actor_time
        ON npc_memory_candidates(actor_id, created_at);

      CREATE TABLE IF NOT EXISTS session_event_candidates (
        candidate_id TEXT PRIMARY KEY,
        session_id TEXT,
        text TEXT NOT NULL,
        kind TEXT NOT NULL,
        source_segment_ids_json TEXT NOT NULL,
        confidence REAL,
        provider TEXT,
        model TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        received_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_session_event_candidate_session_time
        ON session_event_candidates(session_id, created_at);

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

  addNpcMemoryCandidate(sessionId, payload, timestamp = new Date().toISOString()) {
    if (!payload?.candidateId || !payload?.actorId || !payload?.text || !payload?.kind) return false;
    const sourceIds = Array.isArray(payload.sourceSegmentIds) ? payload.sourceSegmentIds.map(String) : [];
    if (!sourceIds.length) return false;
    this.db.prepare(`
      INSERT OR IGNORE INTO npc_memory_candidates (
        candidate_id, session_id, actor_id, actor_uuid, text, kind,
        source_segment_ids_json, confidence, provider, model, status, created_at, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(payload.candidateId),
      sessionId ?? null,
      String(payload.actorId),
      payload.actorUuid ?? null,
      String(payload.text),
      String(payload.kind),
      JSON.stringify(sourceIds),
      typeof payload.confidence === "number" ? payload.confidence : null,
      payload.provider ?? null,
      payload.model ?? null,
      String(payload.status ?? "pending"),
      String(payload.createdAt ?? timestamp),
      timestamp
    );
    return true;
  }

  addSessionEventCandidate(sessionId, payload, timestamp = new Date().toISOString()) {
    if (!payload?.candidateId || !payload?.text || !payload?.kind) return false;
    const sourceIds = Array.isArray(payload.sourceSegmentIds) ? payload.sourceSegmentIds.map(String) : [];
    if (!sourceIds.length) return false;
    this.db.prepare(`
      INSERT OR IGNORE INTO session_event_candidates (
        candidate_id, session_id, text, kind, source_segment_ids_json,
        confidence, provider, model, status, created_at, received_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(payload.candidateId),
      sessionId ?? null,
      String(payload.text),
      String(payload.kind),
      JSON.stringify(sourceIds),
      typeof payload.confidence === "number" ? payload.confidence : null,
      payload.provider ?? null,
      payload.model ?? null,
      String(payload.status ?? "pending"),
      String(payload.createdAt ?? timestamp),
      timestamp
    );
    return true;
  }

  reviewCandidate(candidateType, candidateId, status) {
    const table = CANDIDATE_TABLES[String(candidateType ?? "")];
    const normalizedId = String(candidateId ?? "").trim();
    const normalizedStatus = String(status ?? "").trim().toLowerCase();
    if (!table || !normalizedId || !["accepted", "rejected"].includes(normalizedStatus)) return false;
    const result = this.db.prepare(`UPDATE ${table} SET status = ? WHERE candidate_id = ?`)
      .run(normalizedStatus, normalizedId);
    return Number(result?.changes ?? 0) > 0;
  }

  candidateStatus(candidateType, candidateId) {
    const table = CANDIDATE_TABLES[String(candidateType ?? "")];
    const normalizedId = String(candidateId ?? "").trim();
    if (!table || !normalizedId) return null;
    const row = this.db.prepare(`SELECT status FROM ${table} WHERE candidate_id = ?`).get(normalizedId);
    return row?.status ? String(row.status) : null;
  }

  listCandidates({ sessionId = null, status = "pending", limit = 100 } = {}) {
    const normalizedLimit = Math.max(1, Math.min(250, Number.parseInt(String(limit), 10) || 100));
    const normalizedSessionId = String(sessionId ?? "").trim() || null;
    const normalizedStatus = String(status ?? "pending").trim().toLowerCase();
    const statusFilter = normalizedStatus === "all" ? null : normalizedStatus;
    const allowedStatuses = new Set(["pending", "accepted", "rejected"]);
    if (statusFilter && !allowedStatuses.has(statusFilter)) return { npcCandidates: [], sessionEventCandidates: [] };

    const buildWhere = () => {
      const clauses = [];
      const params = [];
      if (normalizedSessionId) {
        clauses.push("session_id = ?");
        params.push(normalizedSessionId);
      }
      if (statusFilter) {
        clauses.push("status = ?");
        params.push(statusFilter);
      }
      return {
        sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
        params
      };
    };

    const npcWhere = buildWhere();
    const npcRows = this.db.prepare(`
      SELECT candidate_id, session_id, actor_id, actor_uuid, text, kind,
             source_segment_ids_json, confidence, provider, model, status, created_at
      FROM npc_memory_candidates
      ${npcWhere.sql}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...npcWhere.params, normalizedLimit);

    const sessionWhere = buildWhere();
    const sessionRows = this.db.prepare(`
      SELECT candidate_id, session_id, text, kind, source_segment_ids_json,
             confidence, provider, model, status, created_at
      FROM session_event_candidates
      ${sessionWhere.sql}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...sessionWhere.params, normalizedLimit);

    return {
      npcCandidates: npcRows.map(row => ({
        candidateId: String(row.candidate_id),
        sessionId: row.session_id ?? null,
        actorId: String(row.actor_id),
        actorUuid: row.actor_uuid ?? null,
        text: String(row.text),
        kind: String(row.kind),
        sourceSegmentIds: parseJsonArray(row.source_segment_ids_json),
        confidence: typeof row.confidence === "number" ? row.confidence : null,
        provider: row.provider ?? null,
        model: row.model ?? null,
        status: String(row.status ?? "pending"),
        createdAt: String(row.created_at)
      })),
      sessionEventCandidates: sessionRows.map(row => ({
        candidateId: String(row.candidate_id),
        sessionId: row.session_id ?? null,
        text: String(row.text),
        kind: String(row.kind),
        sourceSegmentIds: parseJsonArray(row.source_segment_ids_json),
        confidence: typeof row.confidence === "number" ? row.confidence : null,
        provider: row.provider ?? null,
        model: row.model ?? null,
        status: String(row.status ?? "pending"),
        createdAt: String(row.created_at)
      }))
    };
  }

  stats() {
    const sessions = this.db.prepare("SELECT COUNT(*) AS count FROM sessions").get().count;
    const speakers = this.db.prepare("SELECT COUNT(*) AS count FROM speakers").get().count;
    const segments = this.db.prepare("SELECT COUNT(*) AS count FROM transcript_segments").get().count;
    const npcContexts = this.db.prepare("SELECT COUNT(*) AS count FROM npc_context_events").get().count;
    const npcCandidates = this.db.prepare("SELECT COUNT(*) AS count FROM npc_memory_candidates").get().count;
    const sessionEventCandidates = this.db.prepare("SELECT COUNT(*) AS count FROM session_event_candidates").get().count;
    const npcPending = this.db.prepare("SELECT COUNT(*) AS count FROM npc_memory_candidates WHERE status = 'pending'").get().count;
    const sessionEventPending = this.db.prepare("SELECT COUNT(*) AS count FROM session_event_candidates WHERE status = 'pending'").get().count;
    return { sessions, speakers, segments, npcContexts, npcCandidates, sessionEventCandidates, npcPending, sessionEventPending };
  }

  close() {
    if (this.db.isOpen) this.db.close();
  }
}
