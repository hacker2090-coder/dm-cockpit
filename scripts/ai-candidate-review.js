const DM_COCKPIT_CANDIDATE_REVIEW_VERSION = "V0.9.23";
const DM_COCKPIT_CANDIDATE_MAX = 120;
const DM_COCKPIT_NPC_MEMORY_FLAG = "actionMemory";
const DM_COCKPIT_NPC_MEMORY_FLAG_PATH = "flags.dm-cockpit.actionMemory";

const dmCandidateState = new Map();
const dmCandidateChangeRecords = new Map();
const dmCandidateUndoPending = new Set();
let dmCandidateTransportPatched = false;

function dmCandidateEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dmCandidateId() {
  return foundry.utils?.randomID?.() ?? crypto.randomUUID();
}

function dmCandidateClone(value) {
  if (value === undefined) return null;
  if (typeof foundry.utils?.deepClone === "function") return foundry.utils.deepClone(value);
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function dmCandidateEqual(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function dmCandidateIsCockpit(application) {
  return application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
}

function dmCandidateTransport() {
  return globalThis.DMCockpitLiveTranscript?.transport ?? null;
}

function dmCandidateKindLabel(kind) {
  const labels = {
    statement: "Aussage",
    knowledge: "Wissen",
    action: "Handlung",
    relationship: "Beziehung",
    promise: "Versprechen",
    lie: "Lüge",
    deadline: "Frist",
    consequence: "Konsequenz",
    decision: "Entscheidung",
    quest: "Quest",
    task: "Aufgabe",
    loot: "Loot",
    reward: "Belohnung",
    open_question: "Offene Frage",
    combat: "Kampf",
    event: "Ereignis",
    other: "Sonstiges"
  };
  return labels[String(kind ?? "")] ?? String(kind ?? "Unbekannt");
}

function dmCandidateStatusLabel(status) {
  return {
    pending: "Offen",
    reviewing: "Wird gespeichert …",
    accepted: "Angenommen",
    rejected: "Verworfen"
  }[String(status ?? "pending")] ?? String(status ?? "Offen");
}

function dmCandidateChangeForCandidate(candidateId) {
  const normalizedId = String(candidateId ?? "").trim();
  if (!normalizedId) return null;
  return [...dmCandidateChangeRecords.values()]
    .filter(record => record.sourceCandidateId === normalizedId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}

function dmCandidateNormalizeChangeRecord(payload) {
  const changeId = String(payload?.changeId ?? "").trim();
  const actorId = String(payload?.actorId ?? "").trim();
  const flagPath = String(payload?.flagPath ?? "").trim();
  if (!changeId || !actorId || !flagPath) return null;
  return {
    changeId,
    actorId,
    flagPath,
    before: dmCandidateClone(payload?.before),
    after: dmCandidateClone(payload?.after),
    sourceCandidateId: String(payload?.sourceCandidateId ?? "").trim() || null,
    createdAt: payload?.createdAt ?? new Date().toISOString(),
    undoneAt: payload?.undoneAt ?? null,
    status: payload?.status ? String(payload.status) : null
  };
}

function dmCandidateStoreChangeRecord(payload) {
  const normalized = dmCandidateNormalizeChangeRecord(payload);
  if (!normalized) return false;
  const existing = dmCandidateChangeRecords.get(normalized.changeId);
  const status = normalized.status ?? existing?.status ?? null;
  const undoneAt = normalized.undoneAt
    ?? existing?.undoneAt
    ?? (status === "undone" || status === "already_undone" ? new Date().toISOString() : null);
  const record = {
    ...(existing ?? {}),
    ...normalized,
    status,
    undoneAt
  };
  dmCandidateChangeRecords.set(record.changeId, record);

  if (record.sourceCandidateId) {
    const candidate = dmCandidateState.get(record.sourceCandidateId);
    if (candidate) {
      dmCandidateState.set(record.sourceCandidateId, {
        ...candidate,
        changeId: record.changeId,
        undoneAt: record.undoneAt ?? null,
        undoStatus: record.undoneAt ? null : candidate.undoStatus ?? null
      });
    }
  }

  if (dmCandidateChangeRecords.size > DM_COCKPIT_CANDIDATE_MAX) {
    const records = [...dmCandidateChangeRecords.values()]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    while (dmCandidateChangeRecords.size > DM_COCKPIT_CANDIDATE_MAX && records.length) {
      const oldest = records.shift();
      dmCandidateChangeRecords.delete(oldest.changeId);
    }
  }
  return true;
}

function dmCandidateNormalize(candidateType, payload, sessionId = null) {
  const candidateId = String(payload?.candidateId ?? "").trim();
  const text = String(payload?.text ?? "").trim();
  const kind = String(payload?.kind ?? "other").trim() || "other";
  if (!candidateId || !text) return null;

  return {
    candidateType,
    candidateId,
    sessionId: payload?.sessionId ?? sessionId ?? null,
    actorId: candidateType === "npc.memory.candidate" ? String(payload?.actorId ?? "").trim() || null : null,
    actorUuid: candidateType === "npc.memory.candidate" ? payload?.actorUuid ?? null : null,
    text,
    kind,
    sourceSegmentIds: Array.isArray(payload?.sourceSegmentIds) ? payload.sourceSegmentIds.map(String) : [],
    confidence: typeof payload?.confidence === "number" ? payload.confidence : null,
    provider: payload?.provider ?? null,
    model: payload?.model ?? null,
    status: String(payload?.status ?? "pending"),
    createdAt: payload?.createdAt ?? new Date().toISOString()
  };
}

function dmCandidateTrim() {
  if (dmCandidateState.size <= DM_COCKPIT_CANDIDATE_MAX) return;
  const entries = [...dmCandidateState.values()].sort((a, b) => {
    const aPending = a.status === "pending" || a.status === "reviewing";
    const bPending = b.status === "pending" || b.status === "reviewing";
    if (aPending !== bPending) return aPending ? 1 : -1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
  while (dmCandidateState.size > DM_COCKPIT_CANDIDATE_MAX && entries.length) {
    const oldest = entries.shift();
    dmCandidateState.delete(oldest.candidateId);
  }
}

function dmCandidateUpsert(candidateType, payload, sessionId = null) {
  const normalized = dmCandidateNormalize(candidateType, payload, sessionId);
  if (!normalized) return false;
  const existing = dmCandidateState.get(normalized.candidateId);
  const merged = existing ? { ...existing, ...normalized } : normalized;
  const record = dmCandidateChangeForCandidate(normalized.candidateId);
  if (record) {
    merged.changeId = record.changeId;
    merged.undoneAt = record.undoneAt ?? null;
    if (record.undoneAt) merged.undoStatus = null;
  }
  dmCandidateState.set(normalized.candidateId, merged);
  dmCandidateTrim();
  return true;
}

function dmCandidateSnapshot() {
  const candidates = [...dmCandidateState.values()].sort((a, b) => {
    const rank = status => status === "pending" ? 0 : status === "reviewing" ? 1 : 2;
    const statusDiff = rank(a.status) - rank(b.status);
    if (statusDiff) return statusDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  return {
    candidates,
    pending: candidates.filter(candidate => candidate.status === "pending" || candidate.status === "reviewing").length,
    accepted: candidates.filter(candidate => candidate.status === "accepted").length,
    rejected: candidates.filter(candidate => candidate.status === "rejected").length
  };
}

function dmCandidateEmit() {
  Hooks.callAll("dmCockpitCandidateStateChanged", dmCandidateSnapshot());
}

function dmCandidateRequest(status = "pending") {
  const transport = dmCandidateTransport();
  if (!transport || transport.connectionState !== "connected") return false;
  return transport.send("candidates.list.request", { status, limit: 100 });
}

function dmCandidateSetUndoStatus(sourceCandidateId, undoStatus) {
  const candidateId = String(sourceCandidateId ?? "").trim();
  if (!candidateId) return;
  const existing = dmCandidateState.get(candidateId);
  if (!existing) return;
  dmCandidateState.set(candidateId, { ...existing, undoStatus });
}

async function dmCandidateRestoreActorMemory(actor, state) {
  if (state === null || state === undefined) {
    await actor.unsetFlag("dm-cockpit", DM_COCKPIT_NPC_MEMORY_FLAG);
  } else {
    await actor.setFlag("dm-cockpit", DM_COCKPIT_NPC_MEMORY_FLAG, dmCandidateClone(state));
  }
}

async function dmCandidateHandleUndoReady(record, sessionId = null) {
  if (!game.user?.isGM || !record || !dmCandidateUndoPending.has(record.changeId)) return;

  const transport = dmCandidateTransport();
  dmCandidateSetUndoStatus(record.sourceCandidateId, "restoring");
  dmCandidateEmit();

  const reply = (status, message = null) => {
    if (!transport || transport.connectionState !== "connected") return false;
    return transport.send("change.undo.result", {
      changeId: record.changeId,
      status,
      ...(message ? { message } : {}),
      ...(status === "undone" ? { undoneAt: new Date().toISOString() } : {})
    }, sessionId ?? transport.sessionId);
  };

  try {
    if (record.flagPath !== DM_COCKPIT_NPC_MEMORY_FLAG_PATH) {
      reply("failed", `Nicht unterstützter Flag-Pfad: ${record.flagPath}`);
      return;
    }

    const actor = game.actors?.get(record.actorId);
    if (!actor) {
      reply("failed", "Der zugehörige Foundry-Actor ist nicht verfügbar.");
      return;
    }

    const current = dmCandidateClone(actor.getFlag("dm-cockpit", DM_COCKPIT_NPC_MEMORY_FLAG));
    if (!dmCandidateEqual(current, record.after)) {
      reply("conflict", "NPC Memory wurde seit dieser Änderung verändert; Undo wurde zum Schutz abgebrochen.");
      return;
    }

    await dmCandidateRestoreActorMemory(actor, record.before);
    const restored = dmCandidateClone(actor.getFlag("dm-cockpit", DM_COCKPIT_NPC_MEMORY_FLAG));
    if (!dmCandidateEqual(restored, record.before)) {
      throw new Error("Der wiederhergestellte NPC-Memory-Zustand stimmt nicht mit dem Change-Record überein.");
    }

    if (!reply("undone")) {
      throw new Error("Der Restore wurde in Foundry ausgeführt, konnte aber nicht an den Companion bestätigt werden.");
    }
  } catch (error) {
    const message = String(error?.message ?? error ?? "Unbekannter Restore-Fehler");
    if (!reply("failed", message)) {
      dmCandidateUndoPending.delete(record.changeId);
      dmCandidateSetUndoStatus(record.sourceCandidateId, null);
      dmCandidateEmit();
      ui.notifications?.error(`DM Cockpit: ${message}`);
    }
  }
}

function dmCandidateIngestEnvelope(envelope) {
  if (!envelope || envelope.v !== "1.0") return;
  const payload = envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {};
  let changed = false;

  if (envelope.type === "npc.memory.candidate" || envelope.type === "session.event.candidate") {
    changed = dmCandidateUpsert(envelope.type, payload, envelope.sessionId);
  } else if (envelope.type === "candidate.reviewed") {
    const candidateId = String(payload.candidateId ?? "");
    const existing = dmCandidateState.get(candidateId);
    if (existing) {
      dmCandidateState.set(candidateId, { ...existing, status: String(payload.status ?? existing.status) });
      changed = true;
    }
  } else if (envelope.type === "candidates.list.result") {
    for (const candidate of Array.isArray(payload.npcCandidates) ? payload.npcCandidates : []) {
      changed = dmCandidateUpsert("npc.memory.candidate", candidate, candidate.sessionId ?? envelope.sessionId) || changed;
    }
    for (const candidate of Array.isArray(payload.sessionEventCandidates) ? payload.sessionEventCandidates : []) {
      changed = dmCandidateUpsert("session.event.candidate", candidate, candidate.sessionId ?? envelope.sessionId) || changed;
    }
  } else if (envelope.type === "npc.memory.applied") {
    changed = dmCandidateStoreChangeRecord(payload) || changed;
  } else if (envelope.type === "change.undo.result") {
    const changeId = String(payload.changeId ?? "").trim();
    const status = String(payload.status ?? "").trim().toLowerCase();
    const wasPending = dmCandidateUndoPending.has(changeId);

    if (status === "ready") {
      changed = dmCandidateStoreChangeRecord(payload) || changed;
      const record = dmCandidateChangeRecords.get(changeId);
      if (wasPending && record) void dmCandidateHandleUndoReady(record, envelope.sessionId);
    } else if (["undone", "already_undone", "conflict", "failed"].includes(status)) {
      if (["undone", "already_undone"].includes(status)) changed = dmCandidateStoreChangeRecord(payload) || changed;
      const record = dmCandidateChangeRecords.get(changeId) ?? dmCandidateNormalizeChangeRecord(payload);
      dmCandidateUndoPending.delete(changeId);
      if (record?.sourceCandidateId) {
        dmCandidateSetUndoStatus(record.sourceCandidateId, null);
        changed = true;
      }
      if (wasPending) {
        if (status === "undone") ui.notifications?.info("DM Cockpit: NPC-Memory-Änderung wurde rückgängig gemacht.");
        else if (status === "already_undone") ui.notifications?.info("DM Cockpit: Diese Änderung war bereits rückgängig.");
        else if (status === "conflict") ui.notifications?.warn(`DM Cockpit: ${payload.message ?? "Undo wegen eines Zustandskonflikts abgebrochen."}`);
        else ui.notifications?.error(`DM Cockpit: ${payload.message ?? "Undo ist fehlgeschlagen."}`);
      }
    }
  } else if (envelope.type === "hello.ack" || envelope.type === "session.started") {
    window.setTimeout(() => dmCandidateRequest("all"), 0);
  }

  if (changed) dmCandidateEmit();
}

function dmCandidatePatchTransport() {
  if (dmCandidateTransportPatched) return true;
  const transport = dmCandidateTransport();
  if (!transport || typeof transport.ingest !== "function") return false;

  const originalIngest = transport.ingest.bind(transport);
  transport.ingest = envelope => {
    const result = originalIngest(envelope);
    try {
      dmCandidateIngestEnvelope(envelope);
    } catch (error) {
      console.warn("DM Cockpit | Candidate-/Undo-Envelope konnte nicht verarbeitet werden", error);
    }
    return result;
  };
  dmCandidateTransportPatched = true;

  if (transport.connectionState === "connected") dmCandidateRequest("all");
  return true;
}

async function dmCandidateAppendNpcMemory(candidate) {
  const actor = candidate.actorId ? game.actors?.get(candidate.actorId) : null;
  if (!actor) throw new Error("Der zugehörige Foundry-Actor ist nicht verfügbar.");

  const raw = actor.getFlag("dm-cockpit", DM_COCKPIT_NPC_MEMORY_FLAG);
  const before = dmCandidateClone(raw);
  const entries = Array.isArray(raw)
    ? raw.filter(entry => entry && typeof entry.text === "string" && entry.text.trim()).map(entry => ({
        id: String(entry.id ?? dmCandidateId()),
        text: String(entry.text).trim(),
        createdAt: Number(entry.createdAt) || Date.now()
      }))
    : [];

  entries.push({
    id: dmCandidateId(),
    text: candidate.text,
    createdAt: Date.now()
  });

  const after = dmCandidateClone(entries);
  await actor.setFlag("dm-cockpit", DM_COCKPIT_NPC_MEMORY_FLAG, after);
  const current = dmCandidateClone(actor.getFlag("dm-cockpit", DM_COCKPIT_NPC_MEMORY_FLAG));
  if (!dmCandidateEqual(current, after)) {
    await dmCandidateRestoreActorMemory(actor, before);
    throw new Error("NPC Memory konnte nicht zuverlässig geschrieben werden.");
  }

  return {
    actor,
    changeId: `change_${dmCandidateId()}`,
    before,
    after,
    createdAt: new Date().toISOString()
  };
}

function dmCandidateSendChangeRecord(candidate, applied) {
  const transport = dmCandidateTransport();
  if (!transport || transport.connectionState !== "connected") return false;
  return transport.send("npc.memory.applied", {
    changeId: applied.changeId,
    actorId: applied.actor.id,
    flagPath: DM_COCKPIT_NPC_MEMORY_FLAG_PATH,
    before: applied.before,
    after: applied.after,
    sourceCandidateId: candidate.candidateId,
    createdAt: applied.createdAt
  }, candidate.sessionId ?? transport.sessionId);
}

function dmCandidateSendReview(candidate, status) {
  const transport = dmCandidateTransport();
  if (!transport || transport.connectionState !== "connected") return false;
  return transport.send("candidate.review", {
    candidateType: candidate.candidateType,
    candidateId: candidate.candidateId,
    status
  }, candidate.sessionId ?? transport.sessionId);
}

async function dmCandidateReview(candidateId, status) {
  const candidate = dmCandidateState.get(String(candidateId));
  if (!candidate || candidate.status !== "pending") return;
  if (!game.user?.isGM) return;

  const transport = dmCandidateTransport();
  if (!transport || transport.connectionState !== "connected") {
    ui.notifications?.warn("DM Cockpit: Companion ist nicht verbunden; Review wurde nicht ausgeführt.");
    return;
  }

  dmCandidateState.set(candidate.candidateId, { ...candidate, status: "reviewing" });
  dmCandidateEmit();

  let applied = null;
  let changeRecordSent = false;

  try {
    if (status === "accepted" && candidate.candidateType === "npc.memory.candidate") {
      applied = await dmCandidateAppendNpcMemory(candidate);
      changeRecordSent = dmCandidateSendChangeRecord(candidate, applied);
      if (!changeRecordSent) {
        await dmCandidateRestoreActorMemory(applied.actor, applied.before);
        throw new Error("Change-Record konnte nicht an den Companion gesendet werden; die Actor-Änderung wurde zurückgesetzt.");
      }
    }

    if (!dmCandidateSendReview(candidate, status)) {
      if (applied) {
        await dmCandidateRestoreActorMemory(applied.actor, applied.before);
        if (changeRecordSent) {
          transport.send("change.undo.result", {
            changeId: applied.changeId,
            status: "undone",
            undoneAt: new Date().toISOString()
          }, candidate.sessionId ?? transport.sessionId);
        }
      }
      throw new Error("Review konnte nicht an den Companion gesendet werden.");
    }

    if (applied) ui.notifications?.info(`DM Cockpit: Erinnerung für ${applied.actor.name} übernommen und mit Undo gesichert.`);
  } catch (error) {
    dmCandidateState.set(candidate.candidateId, { ...candidate, status: "pending" });
    dmCandidateEmit();
    ui.notifications?.error(`DM Cockpit: ${error.message}`);
  }
}

function dmCandidateUndo(candidateId) {
  const candidate = dmCandidateState.get(String(candidateId));
  if (!candidate || candidate.candidateType !== "npc.memory.candidate" || candidate.status !== "accepted") return;
  if (!game.user?.isGM) return;

  const record = candidate.changeId
    ? dmCandidateChangeRecords.get(candidate.changeId)
    : dmCandidateChangeForCandidate(candidate.candidateId);
  if (!record || record.undoneAt) {
    ui.notifications?.warn("DM Cockpit: Für diesen Kandidaten ist kein aktiver Undo-Change-Record verfügbar.");
    return;
  }

  const transport = dmCandidateTransport();
  if (!transport || transport.connectionState !== "connected") {
    ui.notifications?.warn("DM Cockpit: Companion ist nicht verbunden; Undo wurde nicht gestartet.");
    return;
  }
  if (dmCandidateUndoPending.has(record.changeId)) return;

  dmCandidateUndoPending.add(record.changeId);
  dmCandidateSetUndoStatus(candidate.candidateId, "requesting");
  dmCandidateEmit();

  if (!transport.send("change.undo.request", { changeId: record.changeId }, candidate.sessionId ?? transport.sessionId)) {
    dmCandidateUndoPending.delete(record.changeId);
    dmCandidateSetUndoStatus(candidate.candidateId, null);
    dmCandidateEmit();
    ui.notifications?.error("DM Cockpit: Undo-Anfrage konnte nicht an den Companion gesendet werden.");
  }
}

function dmCandidateActorName(candidate) {
  if (candidate.candidateType !== "npc.memory.candidate") return "Session";
  return game.actors?.get(candidate.actorId)?.name ?? candidate.actorId ?? "NPC";
}

function dmCandidateRow(candidate) {
  const npc = candidate.candidateType === "npc.memory.candidate";
  const confidence = typeof candidate.confidence === "number"
    ? `${Math.round(candidate.confidence * 100)} %`
    : "–";
  const source = [candidate.provider, candidate.model].filter(Boolean).join(" · ") || "unbekannt";
  const actorMissing = npc && !game.actors?.get(candidate.actorId);
  const pending = candidate.status === "pending";
  const reviewing = candidate.status === "reviewing";
  const record = candidate.changeId
    ? dmCandidateChangeRecords.get(candidate.changeId)
    : dmCandidateChangeForCandidate(candidate.candidateId);
  const undoActive = npc && candidate.status === "accepted" && record && !record.undoneAt;
  const undoBusy = candidate.undoStatus === "requesting" || candidate.undoStatus === "restoring";

  const actions = pending
    ? `<div class="dm-candidate-actions">
        <button type="button" class="dm-button-primary small" data-dm-candidate-accept="${dmCandidateEscape(candidate.candidateId)}" ${actorMissing ? "disabled" : ""} title="${actorMissing ? "Actor nicht verfügbar" : "Kandidat annehmen"}"><i class="fa-solid fa-check"></i> Annehmen</button>
        <button type="button" class="dm-button-danger small" data-dm-candidate-reject="${dmCandidateEscape(candidate.candidateId)}"><i class="fa-solid fa-xmark"></i> Verwerfen</button>
      </div>`
    : reviewing
      ? `<div class="dm-candidate-actions"><span class="dm-candidate-reviewing"><i class="fa-solid fa-spinner fa-spin"></i> Speichert …</span></div>`
      : undoActive
        ? `<div class="dm-candidate-actions">${
            undoBusy
              ? `<span class="dm-candidate-reviewing"><i class="fa-solid fa-spinner fa-spin"></i> ${candidate.undoStatus === "restoring" ? "Stellt wieder her …" : "Undo wird vorbereitet …"}</span>`
              : `<button type="button" class="dm-button-secondary small" data-dm-candidate-undo="${dmCandidateEscape(candidate.candidateId)}" ${actorMissing ? "disabled" : ""} title="${actorMissing ? "Actor nicht verfügbar" : "NPC-Memory-Änderung rückgängig machen"}"><i class="fa-solid fa-rotate-left"></i> Rückgängig</button>`
          }</div>`
        : "";

  return `<article class="dm-candidate-row" data-status="${dmCandidateEscape(candidate.status)}">
    <div class="dm-candidate-topline">
      <div class="dm-candidate-badges">
        <span class="dm-candidate-type">${npc ? "NPC Memory" : "Session"}</span>
        <span class="dm-candidate-kind">${dmCandidateEscape(dmCandidateKindLabel(candidate.kind))}</span>
        <span class="dm-candidate-status" data-status="${dmCandidateEscape(candidate.status)}">${dmCandidateEscape(dmCandidateStatusLabel(candidate.status))}</span>
      </div>
      <span class="dm-candidate-confidence" title="KI-Konfidenz">${dmCandidateEscape(confidence)}</span>
    </div>
    <strong class="dm-candidate-target">${dmCandidateEscape(dmCandidateActorName(candidate))}</strong>
    <p>${dmCandidateEscape(candidate.text)}</p>
    <div class="dm-candidate-meta"><span>${dmCandidateEscape(source)}</span><span>${candidate.sourceSegmentIds.length} Quelle${candidate.sourceSegmentIds.length === 1 ? "" : "n"}</span></div>
    ${actions}
  </article>`;
}

function dmCandidateRows(snapshot) {
  if (!snapshot.candidates.length) {
    return `<div class="dm-empty-inline"><span>Noch keine KI-Kandidaten. Kandidaten werden nach Verbindung automatisch aus SQLite geladen.</span></div>`;
  }
  return snapshot.candidates.map(dmCandidateRow).join("");
}

function dmCandidateSectionHtml(snapshot) {
  return `<details id="dm-ai-candidate-review" class="dm-cockpit-card dm-cockpit-wide dm-collapsible" open>
    <summary class="dm-cockpit-card-title">
      <div><h3>KI-Kandidaten</h3><p class="card-subtitle">Lokale Qwen/Ollama-Auswertung · manuelle GM-Prüfung mit Change-Record/Undo</p></div>
      <span class="dm-summary-chevron"><i class="fa-solid fa-chevron-down"></i></span>
    </summary>
    <div class="dm-card-body" data-dm-candidate-root>
      <div class="dm-candidate-summary">
        <span><strong data-dm-candidate-pending>${snapshot.pending}</strong> offen</span>
        <span><strong data-dm-candidate-accepted>${snapshot.accepted}</strong> angenommen</span>
        <span><strong data-dm-candidate-rejected>${snapshot.rejected}</strong> verworfen</span>
        <button type="button" class="dm-button-secondary small" data-dm-candidate-refresh><i class="fa-solid fa-arrows-rotate"></i> Alle neu laden</button>
      </div>
      <div class="dm-transcript-notice dm-candidate-notice"><i class="fa-solid fa-shield-halved"></i><span>NPC Memory wird nur durch „Annehmen“ geschrieben. Jede solche Übernahme erzeugt einen Change-Record; Undo stellt nur wieder her, wenn der aktuelle Actor-Zustand noch exakt zum gespeicherten Nachher-Zustand passt.</span></div>
      <div class="dm-candidate-list" data-dm-candidate-list>${dmCandidateRows(snapshot)}</div>
    </div>
  </details>`;
}

function dmCandidateRender(section) {
  const snapshot = dmCandidateSnapshot();
  const pending = section.querySelector("[data-dm-candidate-pending]");
  const accepted = section.querySelector("[data-dm-candidate-accepted]");
  const rejected = section.querySelector("[data-dm-candidate-rejected]");
  const list = section.querySelector("[data-dm-candidate-list]");
  if (pending) pending.textContent = String(snapshot.pending);
  if (accepted) accepted.textContent = String(snapshot.accepted);
  if (rejected) rejected.textContent = String(snapshot.rejected);
  if (list) list.innerHTML = dmCandidateRows(snapshot);
}

function dmCandidateInject(application, element) {
  if (!game.user?.isGM || !dmCandidateIsCockpit(application)) return;
  dmCandidatePatchTransport();

  const badge = element.querySelector?.(".dm-cockpit-badge");
  if (badge) badge.textContent = DM_COCKPIT_CANDIDATE_REVIEW_VERSION;

  const grid = element.querySelector?.(".dm-cockpit-grid");
  if (!grid || element.querySelector("#dm-ai-candidate-review")) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = dmCandidateSectionHtml(dmCandidateSnapshot()).trim();
  const section = wrapper.firstElementChild;
  const transcript = grid.querySelector("#dm-live-transcript");
  if (transcript) transcript.after(section);
  else grid.appendChild(section);

  let stateHook;
  stateHook = Hooks.on("dmCockpitCandidateStateChanged", () => {
    if (!section.isConnected) {
      Hooks.off("dmCockpitCandidateStateChanged", stateHook);
      return;
    }
    dmCandidateRender(section);
  });

  section.addEventListener("click", event => {
    const refresh = event.target.closest?.("[data-dm-candidate-refresh]");
    if (refresh) {
      if (!dmCandidateRequest("all")) ui.notifications?.warn("DM Cockpit: Companion ist nicht verbunden.");
      return;
    }

    const accept = event.target.closest?.("[data-dm-candidate-accept]");
    if (accept) {
      void dmCandidateReview(accept.dataset.dmCandidateAccept, "accepted");
      return;
    }

    const reject = event.target.closest?.("[data-dm-candidate-reject]");
    if (reject) {
      void dmCandidateReview(reject.dataset.dmCandidateReject, "rejected");
      return;
    }

    const undo = event.target.closest?.("[data-dm-candidate-undo]");
    if (undo) dmCandidateUndo(undo.dataset.dmCandidateUndo);
  });

  dmCandidateRender(section);
  dmCandidateRequest("all");
}

Hooks.once("ready", () => {
  const attempt = () => {
    if (dmCandidatePatchTransport()) return;
    window.setTimeout(attempt, 500);
  };
  attempt();

  globalThis.DMCockpitCandidateReview = {
    snapshot: () => dmCandidateSnapshot(),
    refresh: () => dmCandidateRequest("all"),
    ingest: envelope => dmCandidateIngestEnvelope(envelope),
    accept: candidateId => dmCandidateReview(candidateId, "accepted"),
    reject: candidateId => dmCandidateReview(candidateId, "rejected"),
    undo: candidateId => dmCandidateUndo(candidateId),
    activeChanges: () => [...dmCandidateChangeRecords.values()].filter(record => !record.undoneAt)
  };
});

Hooks.on("renderApplicationV2", dmCandidateInject);
Hooks.on("deleteActor", () => dmCandidateEmit());
Hooks.on("createActor", () => dmCandidateEmit());

console.log(`DM Cockpit | ${DM_COCKPIT_CANDIDATE_REVIEW_VERSION} KI-Kandidaten-Review + Undo bereit`);
