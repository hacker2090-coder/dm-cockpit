function json(value) {
  return value === undefined ? null : JSON.stringify(value);
}

function parseJson(value) {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(String(value));
  } catch (_error) {
    return null;
  }
}

function normalizeId(value) {
  return String(value ?? "").trim();
}

function rowToRecord(row) {
  if (!row) return null;
  return {
    changeId: String(row.change_id),
    actorId: String(row.actor_id),
    flagPath: String(row.flag_path),
    before: parseJson(row.before_json),
    after: parseJson(row.after_json),
    sourceCandidateId: row.source_candidate_id ? String(row.source_candidate_id) : null,
    createdAt: String(row.created_at),
    undoneAt: row.undone_at ? String(row.undone_at) : null
  };
}

export function persistChangeRecord(store, payload, timestamp = new Date().toISOString()) {
  const changeId = normalizeId(payload?.changeId);
  const actorId = normalizeId(payload?.actorId);
  const flagPath = normalizeId(payload?.flagPath);
  if (!store?.db || !changeId || !actorId || !flagPath) return false;

  const createdAt = String(payload?.createdAt ?? timestamp);
  const sourceCandidateId = normalizeId(payload?.sourceCandidateId) || null;
  const result = store.db.prepare(`
    INSERT OR IGNORE INTO change_records (
      change_id, actor_id, flag_path, before_json, after_json,
      source_candidate_id, created_at, undone_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    changeId,
    actorId,
    flagPath,
    json(payload?.before),
    json(payload?.after),
    sourceCandidateId,
    createdAt
  );

  if (Number(result?.changes ?? 0) > 0) return true;
  return Boolean(getChangeRecord(store, changeId));
}

export function getChangeRecord(store, changeId) {
  const normalizedId = normalizeId(changeId);
  if (!store?.db || !normalizedId) return null;
  const row = store.db.prepare(`
    SELECT change_id, actor_id, flag_path, before_json, after_json,
           source_candidate_id, created_at, undone_at
    FROM change_records
    WHERE change_id = ?
  `).get(normalizedId);
  return rowToRecord(row);
}

export function getChangeRecordBySourceCandidateId(store, candidateId) {
  const normalizedId = normalizeId(candidateId);
  if (!store?.db || !normalizedId) return null;
  const row = store.db.prepare(`
    SELECT change_id
    FROM change_records
    WHERE source_candidate_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(normalizedId);
  return row?.change_id ? getChangeRecord(store, row.change_id) : null;
}

export function listActiveChangeRecords(store, limit = 100) {
  if (!store?.db) return [];
  const normalizedLimit = Math.max(1, Math.min(250, Number.parseInt(String(limit), 10) || 100));
  const rows = store.db.prepare(`
    SELECT change_id, actor_id, flag_path, before_json, after_json,
           source_candidate_id, created_at, undone_at
    FROM change_records
    WHERE undone_at IS NULL
    ORDER BY created_at DESC
    LIMIT ?
  `).all(normalizedLimit);
  return rows.map(rowToRecord).filter(Boolean);
}

export function markChangeRecordUndone(store, changeId, timestamp = new Date().toISOString()) {
  const normalizedId = normalizeId(changeId);
  if (!store?.db || !normalizedId) return null;
  const existing = getChangeRecord(store, normalizedId);
  if (!existing) return null;
  if (!existing.undoneAt) {
    store.db.prepare("UPDATE change_records SET undone_at = ? WHERE change_id = ? AND undone_at IS NULL")
      .run(timestamp, normalizedId);
  }
  return getChangeRecord(store, normalizedId);
}

export function changeRecordStats(store) {
  if (!store?.db) return { total: 0, active: 0, undone: 0 };
  const total = Number(store.db.prepare("SELECT COUNT(*) AS count FROM change_records").get()?.count ?? 0);
  const active = Number(store.db.prepare("SELECT COUNT(*) AS count FROM change_records WHERE undone_at IS NULL").get()?.count ?? 0);
  return { total, active, undone: total - active };
}
