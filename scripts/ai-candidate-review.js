const DM_COCKPIT_CANDIDATE_REVIEW_VERSION = "V0.9.22";
const DM_COCKPIT_CANDIDATE_MAX = 120;
const DM_COCKPIT_NPC_MEMORY_FLAG = "actionMemory";

const dmCandidateState = new Map();
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
  dmCandidateState.set(normalized.candidateId, existing ? { ...existing, ...normalized } : normalized);
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
  } else if (envelope.type === "hello.ack" || envelope.type === "session.started") {
    window.setTimeout(() => dmCandidateRequest("pending"), 0);
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
      console.warn("DM Cockpit | Candidate-Envelope konnte nicht verarbeitet werden", error);
    }
    return result;
  };
  dmCandidateTransportPatched = true;

  if (transport.connectionState === "connected") dmCandidateRequest("pending");
  return true;
}

async function dmCandidateAppendNpcMemory(candidate) {
  const actor = candidate.actorId ? game.actors?.get(candidate.actorId) : null;
  if (!actor) throw new Error("Der zugehörige Foundry-Actor ist nicht verfügbar.");

  const raw = actor.getFlag("dm-cockpit", DM_COCKPIT_NPC_MEMORY_FLAG);
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
  await actor.setFlag("dm-cockpit", DM_COCKPIT_NPC_MEMORY_FLAG, entries);
  return actor;
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

  try {
    if (status === "accepted" && candidate.candidateType === "npc.memory.candidate") {
      const actor = await dmCandidateAppendNpcMemory(candidate);
      ui.notifications?.info(`DM Cockpit: Erinnerung für ${actor.name} übernommen.`);
    }

    if (!dmCandidateSendReview(candidate, status)) throw new Error("Review konnte nicht an den Companion gesendet werden.");
  } catch (error) {
    dmCandidateState.set(candidate.candidateId, { ...candidate, status: "pending" });
    dmCandidateEmit();
    ui.notifications?.error(`DM Cockpit: ${error.message}`);
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

  const actions = pending
    ? `<div class="dm-candidate-actions">
        <button type="button" class="dm-button-primary small" data-dm-candidate-accept="${dmCandidateEscape(candidate.candidateId)}" ${actorMissing ? "disabled" : ""} title="${actorMissing ? "Actor nicht verfügbar" : "Kandidat annehmen"}"><i class="fa-solid fa-check"></i> Annehmen</button>
        <button type="button" class="dm-button-danger small" data-dm-candidate-reject="${dmCandidateEscape(candidate.candidateId)}"><i class="fa-solid fa-xmark"></i> Verwerfen</button>
      </div>`
    : reviewing
      ? `<div class="dm-candidate-actions"><span class="dm-candidate-reviewing"><i class="fa-solid fa-spinner fa-spin"></i> Speichert …</span></div>`
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
    return `<div class="dm-empty-inline"><span>Noch keine KI-Kandidaten. Offene Kandidaten werden nach Verbindung automatisch aus SQLite geladen.</span></div>`;
  }
  return snapshot.candidates.map(dmCandidateRow).join("");
}

function dmCandidateSectionHtml(snapshot) {
  return `<details id="dm-ai-candidate-review" class="dm-cockpit-card dm-cockpit-wide dm-collapsible" open>
    <summary class="dm-cockpit-card-title">
      <div><h3>KI-Kandidaten</h3><p class="card-subtitle">Lokale Qwen/Ollama-Auswertung · nur nach manueller GM-Prüfung übernehmen</p></div>
      <span class="dm-summary-chevron"><i class="fa-solid fa-chevron-down"></i></span>
    </summary>
    <div class="dm-card-body" data-dm-candidate-root>
      <div class="dm-candidate-summary">
        <span><strong data-dm-candidate-pending>${snapshot.pending}</strong> offen</span>
        <span><strong data-dm-candidate-accepted>${snapshot.accepted}</strong> angenommen</span>
        <span><strong data-dm-candidate-rejected>${snapshot.rejected}</strong> verworfen</span>
        <button type="button" class="dm-button-secondary small" data-dm-candidate-refresh><i class="fa-solid fa-arrows-rotate"></i> Offene neu laden</button>
      </div>
      <div class="dm-transcript-notice dm-candidate-notice"><i class="fa-solid fa-shield-halved"></i><span>Kein Kandidat verändert automatisch die Foundry-Welt. NPC Memory wird ausschließlich durch „Annehmen“ geschrieben.</span></div>
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
      if (!dmCandidateRequest("pending")) ui.notifications?.warn("DM Cockpit: Companion ist nicht verbunden.");
      return;
    }

    const accept = event.target.closest?.("[data-dm-candidate-accept]");
    if (accept) {
      void dmCandidateReview(accept.dataset.dmCandidateAccept, "accepted");
      return;
    }

    const reject = event.target.closest?.("[data-dm-candidate-reject]");
    if (reject) void dmCandidateReview(reject.dataset.dmCandidateReject, "rejected");
  });

  dmCandidateRender(section);
  dmCandidateRequest("pending");
}

Hooks.once("ready", () => {
  const attempt = () => {
    if (dmCandidatePatchTransport()) return;
    window.setTimeout(attempt, 500);
  };
  attempt();

  globalThis.DMCockpitCandidateReview = {
    snapshot: () => dmCandidateSnapshot(),
    refresh: () => dmCandidateRequest("pending"),
    ingest: envelope => dmCandidateIngestEnvelope(envelope),
    accept: candidateId => dmCandidateReview(candidateId, "accepted"),
    reject: candidateId => dmCandidateReview(candidateId, "rejected")
  };
});

Hooks.on("renderApplicationV2", dmCandidateInject);
Hooks.on("deleteActor", () => dmCandidateEmit());
Hooks.on("createActor", () => dmCandidateEmit());

console.log(`DM Cockpit | ${DM_COCKPIT_CANDIDATE_REVIEW_VERSION} KI-Kandidaten-Review bereit`);
