const DM_COCKPIT_SESSION_RECAP_VERSION = "V0.9.29";
const DM_COCKPIT_SESSION_RECAP_DISCORD_LIMIT = 1800;
const DM_COCKPIT_SESSION_RECAP_MAX_DISCORD_ITEMS = 8;

const DM_COCKPIT_SESSION_RECAP_GROUPS = [
  { key: "decisions", title: "Entscheidungen", kinds: ["decision"] },
  { key: "tasks", title: "Quests & Aufgaben", kinds: ["quest", "task"] },
  { key: "loot", title: "Loot & Belohnungen", kinds: ["loot", "reward"] },
  { key: "combat", title: "Kämpfe", kinds: ["combat"] },
  { key: "open", title: "Offene Fragen", kinds: ["open_question"] },
  { key: "events", title: "Wichtige Ereignisse", kinds: ["event", "other"] }
];

function dmSessionRecapEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dmSessionRecapIsCockpit(application) {
  return application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
}

function dmSessionRecapTimestamp(value) {
  const parsed = new Date(value ?? 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function dmSessionRecapFormatTime(value) {
  const date = new Date(value ?? 0);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(game.i18n?.lang ?? "de", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  } catch (_error) {
    return date.toLocaleString();
  }
}

function dmSessionRecapCandidateSnapshot() {
  try {
    return globalThis.DMCockpitCandidateReview?.snapshot?.() ?? { candidates: [] };
  } catch (_error) {
    return { candidates: [] };
  }
}

function dmSessionRecapAcceptedEvents() {
  const snapshot = dmSessionRecapCandidateSnapshot();
  const candidates = Array.isArray(snapshot?.candidates) ? snapshot.candidates : [];
  return candidates
    .filter(candidate => candidate?.candidateType === "session.event.candidate" && candidate?.status === "accepted")
    .map(candidate => ({
      candidateId: String(candidate.candidateId ?? ""),
      sessionId: String(candidate.sessionId ?? "").trim() || null,
      text: String(candidate.text ?? "").trim(),
      kind: String(candidate.kind ?? "other").trim() || "other",
      createdAt: candidate.createdAt ?? null
    }))
    .filter(candidate => candidate.candidateId && candidate.text)
    .sort((a, b) => dmSessionRecapTimestamp(a.createdAt) - dmSessionRecapTimestamp(b.createdAt));
}

function dmSessionRecapLatestSession(events) {
  if (!events.length) return { sessionId: null, events: [] };

  const groups = new Map();
  for (const event of events) {
    const key = event.sessionId ?? "__no_session__";
    const current = groups.get(key) ?? { sessionId: event.sessionId, events: [], latest: 0 };
    current.events.push(event);
    current.latest = Math.max(current.latest, dmSessionRecapTimestamp(event.createdAt));
    groups.set(key, current);
  }

  return [...groups.values()].sort((a, b) => b.latest - a.latest)[0] ?? { sessionId: null, events: [] };
}

function dmSessionRecapSections(events) {
  return DM_COCKPIT_SESSION_RECAP_GROUPS
    .map(group => ({
      ...group,
      items: events.filter(event => group.kinds.includes(event.kind))
    }))
    .filter(group => group.items.length);
}

function dmSessionRecapFullText(sections) {
  if (!sections.length) return "Noch keine angenommenen Session-Ereignisse für ein Recap vorhanden.";
  const blocks = ["SESSION-RECAP"];
  for (const section of sections) {
    blocks.push("", section.title);
    for (const item of section.items) blocks.push(`- ${item.text}`);
  }
  return blocks.join("\n");
}

function dmSessionRecapDiscordText(sections) {
  if (!sections.length) return "**Session-Recap**\nNoch keine bestätigten Session-Ereignisse.";

  const priority = new Map(DM_COCKPIT_SESSION_RECAP_GROUPS.map((group, index) => [group.key, index]));
  const entries = sections
    .flatMap(section => section.items.map(item => ({ section, item })))
    .sort((a, b) => {
      const rank = (priority.get(a.section.key) ?? 99) - (priority.get(b.section.key) ?? 99);
      if (rank) return rank;
      return dmSessionRecapTimestamp(a.item.createdAt) - dmSessionRecapTimestamp(b.item.createdAt);
    });

  const selected = entries.slice(0, DM_COCKPIT_SESSION_RECAP_MAX_DISCORD_ITEMS);
  const lines = ["**Session-Recap**"];
  for (const { section, item } of selected) lines.push(`• **${section.title}:** ${item.text}`);
  if (entries.length > selected.length) {
    lines.push(`• … ${entries.length - selected.length} weitere bestätigte Punkte im vollständigen Recap.`);
  }

  let result = lines.join("\n");
  if (result.length > DM_COCKPIT_SESSION_RECAP_DISCORD_LIMIT) {
    result = `${result.slice(0, DM_COCKPIT_SESSION_RECAP_DISCORD_LIMIT - 1).trimEnd()}…`;
  }
  return result;
}

function dmSessionRecapSnapshot() {
  const allAccepted = dmSessionRecapAcceptedEvents();
  const latest = dmSessionRecapLatestSession(allAccepted);
  const sections = dmSessionRecapSections(latest.events);
  const latestEventAt = latest.events.reduce((latestAt, event) => {
    return dmSessionRecapTimestamp(event.createdAt) > dmSessionRecapTimestamp(latestAt) ? event.createdAt : latestAt;
  }, null);

  return {
    sessionId: latest.sessionId,
    eventCount: latest.events.length,
    latestEventAt,
    sections,
    recap: dmSessionRecapFullText(sections),
    discordSummary: dmSessionRecapDiscordText(sections)
  };
}

function dmSessionRecapSectionRows(snapshot) {
  if (!snapshot.sections.length) {
    return `<div class="dm-empty-inline dm-session-recap-empty"><span>Noch keine angenommenen Session-Kandidaten. Nimm relevante Session-Ereignisse in „KI-Kandidaten“ an; das Recap entsteht danach automatisch.</span></div>`;
  }

  return snapshot.sections.map(section => `
    <section class="dm-session-recap-group">
      <h4>${dmSessionRecapEscape(section.title)}</h4>
      <ul>${section.items.map(item => `<li>${dmSessionRecapEscape(item.text)}</li>`).join("")}</ul>
    </section>`).join("");
}

function dmSessionRecapMeta(snapshot) {
  if (!snapshot.eventCount) return "Keine bestätigten Session-Ereignisse";
  const time = dmSessionRecapFormatTime(snapshot.latestEventAt);
  return `${snapshot.eventCount} bestätigte${snapshot.eventCount === 1 ? "r" : ""} Punkt${snapshot.eventCount === 1 ? "" : "e"}${time ? ` · Stand ${time}` : ""}`;
}

function dmSessionRecapHtml(snapshot) {
  return `<details id="dm-session-recap" class="dm-cockpit-card dm-cockpit-wide dm-collapsible" open>
    <summary class="dm-cockpit-card-title">
      <div><h3>Session-Recap</h3><p class="card-subtitle">Nur aus manuell angenommenen Session-Kandidaten · inklusive Discord-Kurzfassung</p></div>
      <span class="dm-summary-chevron"><i class="fa-solid fa-chevron-down"></i></span>
    </summary>
    <div class="dm-card-body" data-dm-session-recap-root>
      <div class="dm-session-recap-toolbar">
        <span class="dm-session-recap-meta" data-dm-session-recap-meta>${dmSessionRecapEscape(dmSessionRecapMeta(snapshot))}</span>
        <div class="dm-session-recap-actions">
          <button type="button" class="dm-button-secondary small" data-dm-session-recap-refresh><i class="fa-solid fa-arrows-rotate"></i> Aktualisieren</button>
          <button type="button" class="dm-button-secondary small" data-dm-session-recap-copy ${snapshot.eventCount ? "" : "disabled"}><i class="fa-solid fa-copy"></i> Recap kopieren</button>
          <button type="button" class="dm-button-secondary small" data-dm-session-discord-copy ${snapshot.eventCount ? "" : "disabled"}><i class="fa-solid fa-copy"></i> Discord kopieren</button>
          <button type="button" class="dm-button-primary small" data-dm-session-discord-send ${snapshot.eventCount ? "" : "disabled"}><i class="fa-brands fa-discord"></i> An Discord senden</button>
        </div>
      </div>
      <div class="dm-transcript-notice dm-session-recap-notice"><i class="fa-solid fa-circle-check"></i><span>Ungeprüfte oder verworfene KI-Kandidaten fließen nicht ein. Die Kurzfassung wird lokal aus denselben bestätigten Punkten erzeugt. Direktes Discord-Posting erfolgt nur nach deinem Klick.</span></div>
      <div class="dm-session-recap-groups" data-dm-session-recap-groups>${dmSessionRecapSectionRows(snapshot)}</div>
      <div class="dm-session-discord-preview">
        <strong>Discord-Kurzfassung</strong>
        <pre data-dm-session-discord-preview>${dmSessionRecapEscape(snapshot.discordSummary)}</pre>
      </div>
    </div>
  </details>`;
}

function dmSessionRecapRender(section) {
  const snapshot = dmSessionRecapSnapshot();
  const meta = section.querySelector("[data-dm-session-recap-meta]");
  const groups = section.querySelector("[data-dm-session-recap-groups]");
  const discord = section.querySelector("[data-dm-session-discord-preview]");
  const recapCopy = section.querySelector("[data-dm-session-recap-copy]");
  const discordCopy = section.querySelector("[data-dm-session-discord-copy]");
  const discordSend = section.querySelector("[data-dm-session-discord-send]");
  if (meta) meta.textContent = dmSessionRecapMeta(snapshot);
  if (groups) groups.innerHTML = dmSessionRecapSectionRows(snapshot);
  if (discord) discord.textContent = snapshot.discordSummary;
  if (recapCopy) recapCopy.disabled = !snapshot.eventCount;
  if (discordCopy) discordCopy.disabled = !snapshot.eventCount;
  if (discordSend) discordSend.disabled = !snapshot.eventCount;
}

async function dmSessionRecapCopy(text, successMessage) {
  try {
    await navigator.clipboard.writeText(String(text ?? ""));
    ui.notifications?.info(successMessage);
  } catch (error) {
    console.warn("DM Cockpit | Kopieren fehlgeschlagen", error);
    ui.notifications?.error("DM Cockpit: Text konnte nicht in die Zwischenablage kopiert werden.");
  }
}

function dmSessionRecapRefresh() {
  const refreshed = globalThis.DMCockpitCandidateReview?.refresh?.();
  Hooks.callAll("dmCockpitSessionRecapChanged", dmSessionRecapSnapshot());
  return refreshed;
}

function dmSessionRecapSendDiscord(snapshot) {
  const output = globalThis.DMCockpitDiscordOutput;
  const outputState = output?.snapshot?.() ?? null;
  if (!output?.sendRecap) {
    ui.notifications?.warn("DM Cockpit: Discord-Ausgabe ist noch nicht bereit.");
    return false;
  }
  if (!outputState?.selectedChannel) {
    ui.notifications?.warn("DM Cockpit: Wähle zuerst in „Discord-Ausgabe“ einen Textkanal.");
    return false;
  }
  const sent = output.sendRecap({
    text: snapshot.discordSummary,
    sessionId: snapshot.sessionId
  });
  if (!sent) {
    ui.notifications?.warn("DM Cockpit: Companion ist nicht verbunden.");
    return false;
  }
  ui.notifications?.info("DM Cockpit: Discord-Recap wird gesendet.");
  return true;
}

function dmSessionRecapInject(application, element) {
  if (!game.user?.isGM || !dmSessionRecapIsCockpit(application)) return;
  const grid = element.querySelector?.(".dm-cockpit-grid");
  if (!grid || element.querySelector("#dm-session-recap")) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = dmSessionRecapHtml(dmSessionRecapSnapshot()).trim();
  const section = wrapper.firstElementChild;
  const candidates = grid.querySelector("#dm-ai-candidate-review");
  if (candidates) candidates.after(section);
  else grid.appendChild(section);

  let candidateHook;
  candidateHook = Hooks.on("dmCockpitCandidateStateChanged", () => {
    if (!section.isConnected) {
      Hooks.off("dmCockpitCandidateStateChanged", candidateHook);
      return;
    }
    dmSessionRecapRender(section);
  });

  section.addEventListener("click", event => {
    const refresh = event.target.closest?.("[data-dm-session-recap-refresh]");
    if (refresh) {
      const sent = dmSessionRecapRefresh();
      if (sent === false) ui.notifications?.warn("DM Cockpit: Companion ist nicht verbunden; lokale Kandidaten werden trotzdem verwendet.");
      dmSessionRecapRender(section);
      return;
    }

    const recapCopy = event.target.closest?.("[data-dm-session-recap-copy]");
    if (recapCopy) {
      const snapshot = dmSessionRecapSnapshot();
      if (snapshot.eventCount) void dmSessionRecapCopy(snapshot.recap, "DM Cockpit: Session-Recap kopiert.");
      return;
    }

    const discordCopy = event.target.closest?.("[data-dm-session-discord-copy]");
    if (discordCopy) {
      const snapshot = dmSessionRecapSnapshot();
      if (snapshot.eventCount) void dmSessionRecapCopy(snapshot.discordSummary, "DM Cockpit: Discord-Kurzfassung kopiert.");
      return;
    }

    const discordSend = event.target.closest?.("[data-dm-session-discord-send]");
    if (discordSend) {
      const snapshot = dmSessionRecapSnapshot();
      if (snapshot.eventCount) dmSessionRecapSendDiscord(snapshot);
    }
  });

  dmSessionRecapRender(section);
}

Hooks.once("ready", () => {
  globalThis.DMCockpitSessionRecap = {
    snapshot: () => dmSessionRecapSnapshot(),
    refresh: () => dmSessionRecapRefresh(),
    recapText: () => dmSessionRecapSnapshot().recap,
    discordText: () => dmSessionRecapSnapshot().discordSummary,
    sendDiscord: () => dmSessionRecapSendDiscord(dmSessionRecapSnapshot())
  };
});

Hooks.on("renderApplicationV2", dmSessionRecapInject);

console.log(`DM Cockpit | ${DM_COCKPIT_SESSION_RECAP_VERSION} Session-Recap + Discord-Kurzfassung bereit`);
