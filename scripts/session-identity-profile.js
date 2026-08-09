const DM_COCKPIT_PROFILE_VERSION = "V0.9.28";

const dmProfileState = {
  transportWrapped: false,
  profiles: [],
  activeProfile: null,
  selectedProfileId: null,
  nicknameStatus: null,
  nicknameOverrides: [],
  lastSyncAt: null
};

function dmProfileEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dmProfileIsCockpit(application) {
  return application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
}

function dmProfileWorldId() {
  return String(game.world?.id ?? game.world?.name ?? game.world?.title ?? "unknown-world").trim() || "unknown-world";
}

function dmProfileWorldName() {
  return String(game.world?.title ?? game.world?.id ?? "Foundry-Welt").trim() || "Foundry-Welt";
}

function dmProfileTransport() {
  return globalThis.DMCockpitLiveTranscript?.transport ?? null;
}

function dmProfileConnected() {
  return dmProfileTransport()?.connectionState === "connected";
}

function dmProfileId() {
  const random = foundry.utils?.randomID?.() ?? crypto.randomUUID();
  return `profile_${random}`;
}

function dmProfileCurrentMappings() {
  const snapshot = globalThis.DMCockpitPlayerCharacterIdentity?.snapshot?.() ?? null;
  return Array.isArray(snapshot?.mappings) ? snapshot.mappings.map(entry => ({ ...entry })) : [];
}

function dmProfileSend(type, payload = {}) {
  const transport = dmProfileTransport();
  if (!transport?.send || transport.connectionState !== "connected") return false;
  return transport.send(type, payload);
}

function dmProfileRequestList() {
  return dmProfileSend("identity.profile.list.request", { worldId: dmProfileWorldId() });
}

function dmProfileRequestState() {
  return dmProfileSend("identity.profile.state.request", {});
}

function dmProfileNotify() {
  Hooks.callAll("dmCockpitIdentityProfileStateChanged", dmProfileSnapshot());
}

function dmProfileSnapshot() {
  return {
    connected: dmProfileConnected(),
    worldId: dmProfileWorldId(),
    worldName: dmProfileWorldName(),
    profiles: dmProfileState.profiles.map(entry => ({
      ...entry,
      mappings: Array.isArray(entry.mappings) ? entry.mappings.map(mapping => ({ ...mapping })) : []
    })),
    activeProfile: dmProfileState.activeProfile ? { ...dmProfileState.activeProfile } : null,
    selectedProfileId: dmProfileState.selectedProfileId,
    nicknameStatus: dmProfileState.nicknameStatus ? { ...dmProfileState.nicknameStatus } : null,
    nicknameOverrides: dmProfileState.nicknameOverrides.map(entry => ({ ...entry })),
    currentMappings: dmProfileCurrentMappings(),
    lastSyncAt: dmProfileState.lastSyncAt
  };
}

function dmProfileSelected(snapshot = dmProfileSnapshot()) {
  const selected = snapshot.profiles.find(entry => entry.profileId === snapshot.selectedProfileId);
  if (selected) return selected;
  const activeInWorld = snapshot.profiles.find(entry => entry.active);
  return activeInWorld ?? snapshot.profiles[0] ?? null;
}

function dmProfileHandleProtocol(envelope) {
  if (!envelope || typeof envelope !== "object" || envelope.v !== "1.0") return;
  const payload = envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {};

  if (envelope.type === "hello.ack") {
    dmProfileRequestList();
    dmProfileRequestState();
    return;
  }

  if (envelope.type === "identity.profile.list.result") {
    if (String(payload.worldId ?? "") !== dmProfileWorldId()) return;
    dmProfileState.profiles = Array.isArray(payload.profiles) ? payload.profiles.map(entry => ({ ...entry })) : [];
    if (!dmProfileState.selectedProfileId || !dmProfileState.profiles.some(entry => entry.profileId === dmProfileState.selectedProfileId)) {
      dmProfileState.selectedProfileId =
        dmProfileState.profiles.find(entry => entry.active)?.profileId
        ?? dmProfileState.profiles[0]?.profileId
        ?? null;
    }
    dmProfileState.lastSyncAt = new Date().toISOString();
    dmProfileNotify();
    return;
  }

  if (envelope.type === "identity.profile.state") {
    dmProfileState.activeProfile = payload.activeProfile ?? null;
    dmProfileState.nicknameOverrides = Array.isArray(payload.nicknameOverrides)
      ? payload.nicknameOverrides.map(entry => ({ ...entry }))
      : [];
    if (payload.nicknameStatus) dmProfileState.nicknameStatus = { ...payload.nicknameStatus };
    if (payload.activeProfile?.worldId === dmProfileWorldId()) {
      dmProfileState.selectedProfileId = payload.activeProfile.profileId;
    }
    dmProfileState.profiles = dmProfileState.profiles.map(profile => ({
      ...profile,
      active: profile.profileId === payload.activeProfile?.profileId
    }));
    dmProfileNotify();
    return;
  }

  if (envelope.type === "nickname.status") {
    dmProfileState.nicknameStatus = { ...payload };
    dmProfileNotify();
  }
}

function dmProfileInstallTransportBridge() {
  const transport = dmProfileTransport();
  if (!transport || transport.__dmCockpitProfileWrapped) return Boolean(transport);
  const originalIngest = transport.ingest.bind(transport);
  transport.ingest = envelope => {
    const result = originalIngest(envelope);
    try {
      dmProfileHandleProtocol(envelope);
    } catch (error) {
      console.warn("DM Cockpit | Session-Identity-Protocol-Nachricht konnte nicht verarbeitet werden", error);
    }
    return result;
  };
  transport.__dmCockpitProfileWrapped = true;
  dmProfileState.transportWrapped = true;
  return true;
}

function dmProfileKindLabel(kind) {
  return {
    campaign: "Kampagne",
    oneshot: "One-Shot",
    session: "Session"
  }[kind] ?? String(kind ?? "Profil");
}

function dmProfileActionLabel(status) {
  const action = status?.action ?? status?.lastAction ?? null;
  return {
    started: "Nickname-System bereit",
    profile_state: "Profilzustand aktualisiert",
    participants_reconciled: "Call abgeglichen",
    nickname_applied: "Session-Nickname gesetzt",
    nickname_restored: "Standardname wiederhergestellt",
    nickname_restore_all: "Session-Namen zurückgesetzt",
    nickname_apply_blocked: "Nickname kann nicht gesetzt werden",
    nickname_apply_failed: "Nickname-Änderung fehlgeschlagen",
    nickname_restore_failed: "Namens-Restore fehlgeschlagen",
    nickname_restore_conflict: "Manuelle Namensänderung geschützt",
    stopped: "Nickname-System gestoppt",
    error: "Nickname-Systemfehler"
  }[action] ?? (action ? String(action) : "Noch keine Nickname-Aktion");
}

function dmProfileOptions(snapshot, selectedId) {
  const options = [`<option value="">Neues Profil …</option>`];
  for (const profile of snapshot.profiles) {
    const marker = profile.active ? " · AKTIV" : "";
    options.push(`<option value="${dmProfileEscape(profile.profileId)}"${profile.profileId === selectedId ? " selected" : ""}>${dmProfileEscape(profile.name)} · ${dmProfileEscape(dmProfileKindLabel(profile.kind))}${marker}</option>`);
  }
  return options.join("");
}

function dmProfileSectionHtml(snapshot) {
  const selected = dmProfileSelected(snapshot);
  const selectedId = selected?.profileId ?? "";
  const name = selected?.name ?? "";
  const kind = selected?.kind ?? "oneshot";
  const active = snapshot.activeProfile;
  const activeHere = active?.worldId === snapshot.worldId;
  const conflicts = snapshot.nicknameOverrides.filter(entry => entry.state === "restore_conflict").length;
  const activeText = active
    ? `${activeHere ? "" : "Andere Welt · "}${active.name}`
    : "Kein Profil aktiv";
  const statusClass = active ? "is-active" : "";
  const connectionClass = snapshot.connected ? "is-online" : "";
  const profileMappings = Array.isArray(selected?.mappings) ? selected.mappings.length : 0;
  const currentMappings = snapshot.currentMappings.length;
  const nicknameStatus = dmProfileActionLabel(snapshot.nicknameStatus);
  const lastError = snapshot.nicknameStatus?.lastError
    ?? snapshot.nicknameStatus?.details?.error
    ?? null;

  return `<details id="dm-session-identity-profile" class="dm-cockpit-card dm-cockpit-wide dm-collapsible" open>
    <summary class="dm-cockpit-card-title">
      <div>
        <h3>Session-Identität</h3>
        <p class="card-subtitle">Kampagne/One-Shot aktivieren und Discord-Namen reversibel an Charaktere binden</p>
      </div>
      <span class="dm-summary-chevron"><i class="fa-solid fa-chevron-down"></i></span>
    </summary>
    <div class="dm-card-body" data-dm-profile-root>
      <div class="dm-profile-statusbar">
        <span class="dm-profile-status ${connectionClass}"><i class="fa-solid fa-circle"></i> ${snapshot.connected ? "Companion verbunden" : "Companion nicht verbunden"}</span>
        <span class="dm-profile-status ${statusClass}"><i class="fa-solid fa-clapperboard"></i> ${dmProfileEscape(activeText)}</span>
        <span class="dm-profile-status"><i class="fa-solid fa-address-card"></i> ${dmProfileEscape(nicknameStatus)}</span>
        ${conflicts ? `<span class="dm-profile-status is-warning"><i class="fa-solid fa-shield-halved"></i> ${conflicts} Restore-Konflikt${conflicts === 1 ? "" : "e"}</span>` : ""}
      </div>

      <div class="dm-profile-grid">
        <label>
          <span>Profil</span>
          <select data-dm-profile-select>${dmProfileOptions(snapshot, selectedId)}</select>
        </label>
        <label>
          <span>Name</span>
          <input type="text" maxlength="80" data-dm-profile-name value="${dmProfileEscape(name)}" placeholder="z. B. Auktion der verbotenen Dinge">
        </label>
        <label>
          <span>Typ</span>
          <select data-dm-profile-kind>
            <option value="oneshot"${kind === "oneshot" ? " selected" : ""}>One-Shot</option>
            <option value="campaign"${kind === "campaign" ? " selected" : ""}>Kampagne</option>
            <option value="session"${kind === "session" ? " selected" : ""}>Session</option>
          </select>
        </label>
      </div>

      <div class="dm-profile-summary">
        <span><i class="fa-solid fa-link"></i> Aktuelle Zuordnungen: <strong>${currentMappings}</strong></span>
        <span><i class="fa-solid fa-box-archive"></i> Im gewählten Profil: <strong>${profileMappings}</strong></span>
      </div>

      <div class="dm-section-actions dm-profile-actions">
        <button type="button" class="dm-button-primary small" data-dm-profile-save><i class="fa-solid fa-floppy-disk"></i> Profil speichern</button>
        <button type="button" class="dm-button-primary small" data-dm-profile-activate${selected ? "" : " disabled"}><i class="fa-solid fa-play"></i> Aktivieren</button>
        <button type="button" class="dm-button-danger small" data-dm-profile-deactivate${active ? "" : " disabled"}><i class="fa-solid fa-stop"></i> Deaktivieren</button>
        <button type="button" class="dm-button-secondary small" data-dm-profile-refresh><i class="fa-solid fa-rotate"></i> Aktualisieren</button>
      </div>

      <div class="dm-profile-notice">
        <i class="fa-solid fa-shield-halved"></i>
        <span>Nur ein ausdrücklich aktiviertes Profil darf Discord-Server-Nicknames ändern. Der vorherige Nickname wird vor der Änderung persistent gesichert. Beim Verlassen des Calls, Deaktivieren oder sauberen Companion-Ende wird er zurückgesetzt. Manuelle Namensänderungen werden beim Restore nicht blind überschrieben.</span>
      </div>
      ${lastError ? `<div class="dm-profile-error"><i class="fa-solid fa-triangle-exclamation"></i> ${dmProfileEscape(lastError)}</div>` : ""}
    </div>
  </details>`;
}

function dmProfileBindSection(section) {
  if (!section || section.dataset.dmProfileBound === "1") return;
  section.dataset.dmProfileBound = "1";

  section.addEventListener("change", event => {
    const select = event.target.closest?.("[data-dm-profile-select]");
    if (!select) return;
    dmProfileState.selectedProfileId = String(select.value ?? "").trim() || null;
    dmProfileNotify();
  });

  section.addEventListener("click", event => {
    if (event.target.closest?.("[data-dm-profile-refresh]")) {
      if (!dmProfileRequestList() || !dmProfileRequestState()) {
        ui.notifications?.warn("DM Cockpit: Companion ist nicht verbunden.");
      }
      return;
    }

    if (event.target.closest?.("[data-dm-profile-save]")) {
      const name = String(section.querySelector("[data-dm-profile-name]")?.value ?? "").trim();
      const kind = String(section.querySelector("[data-dm-profile-kind]")?.value ?? "oneshot").trim();
      if (!name) {
        ui.notifications?.warn("DM Cockpit: Gib dem Profil zuerst einen Namen.");
        return;
      }
      const profileId = dmProfileState.selectedProfileId || dmProfileId();
      dmProfileState.selectedProfileId = profileId;
      const sent = dmProfileSend("identity.profile.save", {
        profileId,
        worldId: dmProfileWorldId(),
        worldName: dmProfileWorldName(),
        name,
        kind,
        mappings: dmProfileCurrentMappings()
      });
      if (!sent) {
        ui.notifications?.warn("DM Cockpit: Companion ist nicht verbunden.");
        return;
      }
      ui.notifications?.info("DM Cockpit: Session-/Kampagnenprofil gespeichert.");
      return;
    }

    if (event.target.closest?.("[data-dm-profile-activate]")) {
      const profileId = dmProfileState.selectedProfileId;
      if (!profileId) {
        ui.notifications?.warn("DM Cockpit: Speichere oder wähle zuerst ein Profil.");
        return;
      }
      if (!dmProfileSend("identity.profile.activate", { profileId })) {
        ui.notifications?.warn("DM Cockpit: Companion ist nicht verbunden.");
        return;
      }
      ui.notifications?.info("DM Cockpit: Profil wird aktiviert.");
      return;
    }

    if (event.target.closest?.("[data-dm-profile-deactivate]")) {
      if (!dmProfileSend("identity.profile.deactivate", {})) {
        ui.notifications?.warn("DM Cockpit: Companion ist nicht verbunden.");
        return;
      }
      ui.notifications?.info("DM Cockpit: Profil wird deaktiviert und Session-Namen werden zurückgesetzt.");
    }
  });
}

function dmProfileRenderSection(section) {
  const replacement = document.createElement("div");
  replacement.innerHTML = dmProfileSectionHtml(dmProfileSnapshot()).trim();
  const fresh = replacement.firstElementChild;
  if (!fresh || !section?.isConnected) return section;
  section.replaceWith(fresh);
  dmProfileBindSection(fresh);
  return fresh;
}

function dmProfileInject(application, element) {
  if (!game.user?.isGM || !dmProfileIsCockpit(application)) return;
  const grid = element.querySelector?.(".dm-cockpit-grid");
  if (!grid || element.querySelector("#dm-session-identity-profile")) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = dmProfileSectionHtml(dmProfileSnapshot()).trim();
  let section = wrapper.firstElementChild;
  grid.appendChild(section);
  dmProfileBindSection(section);

  let hookId;
  hookId = Hooks.on("dmCockpitIdentityProfileStateChanged", () => {
    if (!section?.isConnected) {
      Hooks.off("dmCockpitIdentityProfileStateChanged", hookId);
      return;
    }
    section = dmProfileRenderSection(section);
  });
}

Hooks.once("ready", () => {
  dmProfileInstallTransportBridge();
  if (dmProfileConnected()) {
    dmProfileRequestList();
    dmProfileRequestState();
  }
  globalThis.DMCockpitSessionIdentityProfile = {
    snapshot: () => dmProfileSnapshot(),
    refresh: () => {
      dmProfileRequestList();
      dmProfileRequestState();
    }
  };
});

Hooks.on("dmCockpitIdentityStateChanged", () => dmProfileNotify());
Hooks.on("renderApplicationV2", dmProfileInject);

console.log(`DM Cockpit | ${DM_COCKPIT_PROFILE_VERSION} Session-Identitätsprofile bereit`);
