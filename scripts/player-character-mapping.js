const DM_COCKPIT_IDENTITY_VERSION = "V0.9.27";
const DM_COCKPIT_IDENTITY_SETTING = "discordPlayerCharacterMappingsV1";

const dmIdentityState = {
  participants: [],
  guildId: null,
  channelId: null,
  observedAt: null,
  serverMappings: [],
  lastServerSyncAt: null,
  transportWrapped: false
};

function dmIdentityEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dmIdentityIsCockpit(application) {
  return application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
}

function dmIdentityWorldId() {
  return String(game.world?.id ?? game.world?.name ?? game.world?.title ?? "unknown-world").trim() || "unknown-world";
}

function dmIdentityWorldName() {
  return String(game.world?.title ?? game.world?.id ?? "Foundry-Welt").trim() || "Foundry-Welt";
}

function dmIdentityIso() {
  return new Date().toISOString();
}

function dmIdentityNormalizeStore(value) {
  const raw = value && typeof value === "object" ? value : {};
  const source = raw.mappings && typeof raw.mappings === "object" ? raw.mappings : {};
  const mappings = {};
  for (const [discordUserIdRaw, entry] of Object.entries(source)) {
    const discordUserId = String(discordUserIdRaw ?? "").trim();
    const actorId = String(entry?.actorId ?? "").trim();
    const characterName = String(entry?.characterName ?? "").trim();
    if (!discordUserId || !actorId || !characterName) continue;
    mappings[discordUserId] = {
      discordUserId,
      playerName: String(entry?.playerName ?? "").trim() || null,
      actorId,
      actorUuid: String(entry?.actorUuid ?? "").trim() || null,
      characterName,
      updatedAt: String(entry?.updatedAt ?? "").trim() || null
    };
  }
  return { version: 1, mappings };
}

function dmIdentityReadStore() {
  try {
    return dmIdentityNormalizeStore(game.settings.get("dm-cockpit", DM_COCKPIT_IDENTITY_SETTING));
  } catch (error) {
    console.warn("DM Cockpit | Spieler-/Charakterzuordnung konnte nicht gelesen werden", error);
    return { version: 1, mappings: {} };
  }
}

async function dmIdentityWriteStore(store) {
  if (!game.user?.isGM) return;
  await game.settings.set("dm-cockpit", DM_COCKPIT_IDENTITY_SETTING, dmIdentityNormalizeStore(store));
}

function dmIdentityTransport() {
  return globalThis.DMCockpitLiveTranscript?.transport ?? null;
}

function dmIdentityTransportConnected() {
  return dmIdentityTransport()?.connectionState === "connected";
}

function dmIdentityParticipant(discordUserId) {
  const id = String(discordUserId ?? "");
  return dmIdentityState.participants.find(entry => String(entry.discordUserId) === id) ?? null;
}

function dmIdentityMappingArray() {
  return Object.values(dmIdentityReadStore().mappings).map(entry => ({ ...entry }));
}

function dmIdentitySendMappings() {
  const transport = dmIdentityTransport();
  if (!transport?.send || transport.connectionState !== "connected") return false;
  return transport.send("player.character.mapping.set", {
    worldId: dmIdentityWorldId(),
    worldName: dmIdentityWorldName(),
    updatedAt: dmIdentityIso(),
    mappings: dmIdentityMappingArray()
  });
}

function dmIdentityRequestParticipants() {
  const transport = dmIdentityTransport();
  if (!transport?.send || transport.connectionState !== "connected") return false;
  return transport.send("voice.participants.request", {});
}

function dmIdentityRequestMappings() {
  const transport = dmIdentityTransport();
  if (!transport?.send || transport.connectionState !== "connected") return false;
  return transport.send("player.character.mapping.request", { worldId: dmIdentityWorldId() });
}

function dmIdentityNotifyChanged() {
  Hooks.callAll("dmCockpitIdentityStateChanged", dmIdentitySnapshot());
}

function dmIdentitySnapshot() {
  return {
    worldId: dmIdentityWorldId(),
    worldName: dmIdentityWorldName(),
    connected: dmIdentityTransportConnected(),
    guildId: dmIdentityState.guildId,
    channelId: dmIdentityState.channelId,
    observedAt: dmIdentityState.observedAt,
    participants: dmIdentityState.participants.map(entry => ({ ...entry })),
    mappings: dmIdentityMappingArray(),
    serverMappings: dmIdentityState.serverMappings.map(entry => ({ ...entry })),
    lastServerSyncAt: dmIdentityState.lastServerSyncAt
  };
}

function dmIdentityPatchTranscriptSegment(payload) {
  const transport = dmIdentityTransport();
  const segmentId = String(payload?.segmentId ?? "").trim();
  if (!transport || !segmentId || !Array.isArray(transport.segments)) return;
  const segment = transport.segments.find(entry => entry.segmentId === segmentId);
  if (!segment) return;

  segment.playerName = payload.playerName ?? null;
  segment.actorId = payload.actorId ?? null;
  segment.actorUuid = payload.actorUuid ?? null;
  segment.characterName = payload.characterName ?? null;
  segment.discordSpeakerName = payload.speakerName ?? segment.speakerName ?? null;
  if (segment.characterName) {
    const human = segment.playerName || segment.discordSpeakerName || "Spieler";
    segment.speakerName = `${segment.characterName} · ${human}`;
  }
  Hooks.callAll("dmCockpitTranscriptStateChanged", transport.snapshot());
}

function dmIdentityIngest(envelope) {
  if (!envelope || typeof envelope !== "object" || envelope.v !== "1.0") return;
  const payload = envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {};

  if (envelope.type === "hello.ack") {
    dmIdentitySendMappings();
    dmIdentityRequestParticipants();
    dmIdentityRequestMappings();
    dmIdentityNotifyChanged();
    return;
  }

  if (envelope.type === "voice.participants") {
    dmIdentityState.guildId = payload.guildId ?? null;
    dmIdentityState.channelId = payload.channelId ?? null;
    dmIdentityState.observedAt = payload.observedAt ?? dmIdentityIso();
    dmIdentityState.participants = (Array.isArray(payload.participants) ? payload.participants : [])
      .filter(entry => entry?.discordUserId && !entry?.isBot)
      .map(entry => ({
        discordUserId: String(entry.discordUserId),
        displayName: String(entry.displayName ?? entry.discordUserId),
        globalName: entry.globalName ?? null,
        serverNickname: entry.serverNickname ?? null,
        isBot: Boolean(entry.isBot),
        channelId: entry.channelId ?? payload.channelId ?? null
      }));
    dmIdentityNotifyChanged();
    return;
  }

  if (envelope.type === "player.character.mapping.result") {
    if (String(payload.worldId ?? "") !== dmIdentityWorldId()) return;
    dmIdentityState.serverMappings = Array.isArray(payload.mappings) ? payload.mappings.map(entry => ({ ...entry })) : [];
    dmIdentityState.lastServerSyncAt = dmIdentityIso();
    dmIdentityNotifyChanged();
    return;
  }

  if (envelope.type === "transcript.segment") {
    dmIdentityPatchTranscriptSegment(payload);
  }
}

function dmIdentityInstallTransportBridge() {
  const transport = dmIdentityTransport();
  if (!transport || transport.__dmCockpitIdentityWrapped) return Boolean(transport);
  const originalIngest = transport.ingest.bind(transport);
  transport.ingest = envelope => {
    const result = originalIngest(envelope);
    try {
      dmIdentityIngest(envelope);
    } catch (error) {
      console.warn("DM Cockpit | Identity-Protocol-Nachricht konnte nicht verarbeitet werden", error);
    }
    return result;
  };
  transport.__dmCockpitIdentityWrapped = true;
  dmIdentityState.transportWrapped = true;
  return true;
}

function dmIdentityActorGroups() {
  const actors = [...(game.actors?.contents ?? [])]
    .filter(actor => actor?.id && actor?.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
  const playerCharacters = actors.filter(actor => actor.hasPlayerOwner || actor.type === "character");
  const playerIds = new Set(playerCharacters.map(actor => actor.id));
  const others = actors.filter(actor => !playerIds.has(actor.id));
  return { playerCharacters, others };
}

function dmIdentityActorOptions(selectedActorId = "") {
  const { playerCharacters, others } = dmIdentityActorGroups();
  const option = actor => `<option value="${dmIdentityEscape(actor.id)}"${actor.id === selectedActorId ? " selected" : ""}>${dmIdentityEscape(actor.name)}</option>`;
  const groups = [`<option value="">Nicht zugeordnet</option>`];
  if (playerCharacters.length) {
    groups.push(`<optgroup label="Spielercharaktere">${playerCharacters.map(option).join("")}</optgroup>`);
  }
  if (others.length) {
    groups.push(`<optgroup label="Weitere Actors">${others.map(option).join("")}</optgroup>`);
  }
  return groups.join("");
}

function dmIdentityRows(snapshot) {
  const mappingByUser = new Map(snapshot.mappings.map(entry => [entry.discordUserId, entry]));
  const participantByUser = new Map(snapshot.participants.map(entry => [entry.discordUserId, entry]));
  const ids = [...new Set([...participantByUser.keys(), ...mappingByUser.keys()])];

  if (!ids.length) {
    return `<div class="dm-identity-empty"><i class="fa-solid fa-users-slash"></i><span>Noch keine Discord-Spieler im Call und keine gespeicherten Zuordnungen.</span></div>`;
  }

  return ids.map(discordUserId => {
    const participant = participantByUser.get(discordUserId) ?? null;
    const mapping = mappingByUser.get(discordUserId) ?? null;
    const playerName = participant?.displayName ?? mapping?.playerName ?? discordUserId;
    const nickname = participant?.serverNickname && participant.serverNickname !== playerName
      ? `<span class="dm-identity-nickname">Server: ${dmIdentityEscape(participant.serverNickname)}</span>`
      : "";
    const presence = participant
      ? `<span class="dm-identity-presence is-online"><i class="fa-solid fa-headphones"></i> im Call</span>`
      : `<span class="dm-identity-presence"><i class="fa-solid fa-clock"></i> gespeichert</span>`;
    const mapped = mapping
      ? `<span class="dm-identity-mapped"><i class="fa-solid fa-link"></i> ${dmIdentityEscape(mapping.characterName)}</span>`
      : `<span class="dm-identity-unmapped">nicht zugeordnet</span>`;

    return `<article class="dm-identity-row" data-discord-user-id="${dmIdentityEscape(discordUserId)}">
      <div class="dm-identity-player">
        <strong>${dmIdentityEscape(playerName)}</strong>
        <span class="dm-identity-user-id">${dmIdentityEscape(discordUserId)}</span>
        ${nickname}
      </div>
      <div class="dm-identity-presence-wrap">${presence}${mapped}</div>
      <label class="dm-identity-select-wrap">
        <span>Foundry-Charakter</span>
        <select data-dm-identity-actor data-discord-user-id="${dmIdentityEscape(discordUserId)}">
          ${dmIdentityActorOptions(mapping?.actorId ?? "")}
        </select>
      </label>
    </article>`;
  }).join("");
}

function dmIdentitySectionHtml(snapshot) {
  const connection = snapshot.connected ? "Verbunden" : "Nicht verbunden";
  const connectionClass = snapshot.connected ? "is-online" : "";
  const serverSync = snapshot.lastServerSyncAt ? "SQLite gespiegelt" : "noch nicht gespiegelt";
  return `<details id="dm-player-character-mapping" class="dm-cockpit-card dm-cockpit-wide dm-collapsible" open>
    <summary class="dm-cockpit-card-title">
      <div>
        <h3>Spieler & Charaktere</h3>
        <p class="card-subtitle">Discord-Sprecher eindeutig mit Foundry-Spielercharakteren verknüpfen</p>
      </div>
      <span class="dm-summary-chevron"><i class="fa-solid fa-chevron-down"></i></span>
    </summary>
    <div class="dm-card-body" data-dm-identity-root>
      <div class="dm-identity-statusbar">
        <span class="dm-identity-status ${connectionClass}"><i class="fa-solid fa-circle"></i> ${connection}</span>
        <span class="dm-identity-status"><i class="fa-solid fa-headphones"></i> ${snapshot.participants.length} im Call</span>
        <span class="dm-identity-status"><i class="fa-solid fa-link"></i> ${snapshot.mappings.length} Zuordnungen</span>
        <span class="dm-identity-status"><i class="fa-solid fa-database"></i> ${serverSync}</span>
      </div>

      <div class="dm-section-actions dm-identity-actions">
        <button type="button" class="dm-button-secondary small" data-dm-identity-refresh><i class="fa-solid fa-rotate"></i> Teilnehmer aktualisieren</button>
        <button type="button" class="dm-button-secondary small" data-dm-identity-sync><i class="fa-solid fa-cloud-arrow-up"></i> Zuordnungen synchronisieren</button>
      </div>

      <div class="dm-identity-notice">
        <i class="fa-solid fa-circle-info"></i>
        <span>Discord bestimmt, welche Person spricht. Nur deine Auswahl bestimmt, welchen Foundry-Charakter diese Person spielt. Die KI darf diese Zuordnung nicht erraten. IC/OOC wird hier nicht automatisch bewertet.</span>
      </div>

      <div class="dm-identity-list" data-dm-identity-list>${dmIdentityRows(snapshot)}</div>
    </div>
  </details>`;
}

function dmIdentityRenderSection(section) {
  const snapshot = dmIdentitySnapshot();
  const replacement = document.createElement("div");
  replacement.innerHTML = dmIdentitySectionHtml(snapshot).trim();
  const fresh = replacement.firstElementChild;
  if (!fresh || !section?.isConnected) return section;
  section.replaceWith(fresh);
  dmIdentityBindSection(fresh);
  return fresh;
}

async function dmIdentityAssign(discordUserId, actorId) {
  const id = String(discordUserId ?? "").trim();
  const selectedActorId = String(actorId ?? "").trim();
  if (!id) return;

  const store = dmIdentityReadStore();
  if (!selectedActorId) {
    delete store.mappings[id];
  } else {
    const actor = game.actors?.get(selectedActorId);
    if (!actor) throw new Error("Der gewählte Foundry-Actor existiert nicht mehr.");
    const participant = dmIdentityParticipant(id);
    store.mappings[id] = {
      discordUserId: id,
      playerName: participant?.displayName ?? store.mappings[id]?.playerName ?? id,
      actorId: actor.id,
      actorUuid: actor.uuid ?? null,
      characterName: actor.name,
      updatedAt: dmIdentityIso()
    };
  }

  await dmIdentityWriteStore(store);
  dmIdentitySendMappings();
  dmIdentityNotifyChanged();
}

function dmIdentityBindSection(section) {
  if (!section || section.dataset.dmIdentityBound === "1") return;
  section.dataset.dmIdentityBound = "1";

  section.addEventListener("change", event => {
    const select = event.target.closest?.("[data-dm-identity-actor]");
    if (!select) return;
    void dmIdentityAssign(select.dataset.discordUserId, select.value).catch(error => {
      console.error("DM Cockpit | Spieler-/Charakterzuordnung fehlgeschlagen", error);
      ui.notifications?.error(`DM Cockpit: ${error.message}`);
    });
  });

  section.addEventListener("click", event => {
    if (event.target.closest?.("[data-dm-identity-refresh]")) {
      if (!dmIdentityRequestParticipants()) ui.notifications?.warn("DM Cockpit: Companion ist nicht verbunden.");
      return;
    }
    if (event.target.closest?.("[data-dm-identity-sync]")) {
      const sent = dmIdentitySendMappings();
      if (sent) {
        dmIdentityRequestMappings();
        ui.notifications?.info("DM Cockpit: Spieler-/Charakterzuordnungen synchronisiert.");
      } else {
        ui.notifications?.warn("DM Cockpit: Companion ist nicht verbunden.");
      }
    }
  });
}

function dmIdentityInject(application, element) {
  if (!game.user?.isGM || !dmIdentityIsCockpit(application)) return;
  const grid = element.querySelector?.(".dm-cockpit-grid");
  if (!grid || element.querySelector("#dm-player-character-mapping")) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = dmIdentitySectionHtml(dmIdentitySnapshot()).trim();
  let section = wrapper.firstElementChild;
  grid.appendChild(section);
  dmIdentityBindSection(section);

  let stateHook;
  stateHook = Hooks.on("dmCockpitIdentityStateChanged", () => {
    if (!section?.isConnected) {
      Hooks.off("dmCockpitIdentityStateChanged", stateHook);
      return;
    }
    section = dmIdentityRenderSection(section);
  });
}

async function dmIdentityRefreshActorReference(actor) {
  if (!game.user?.isGM || !actor?.id) return;
  const store = dmIdentityReadStore();
  let changed = false;
  for (const mapping of Object.values(store.mappings)) {
    if (mapping.actorId !== actor.id) continue;
    const nextName = String(actor.name ?? mapping.characterName);
    const nextUuid = actor.uuid ?? mapping.actorUuid ?? null;
    if (mapping.characterName !== nextName || mapping.actorUuid !== nextUuid) {
      mapping.characterName = nextName;
      mapping.actorUuid = nextUuid;
      mapping.updatedAt = dmIdentityIso();
      changed = true;
    }
  }
  if (!changed) return;
  await dmIdentityWriteStore(store);
  dmIdentitySendMappings();
  dmIdentityNotifyChanged();
}

async function dmIdentityRemoveDeletedActor(actor) {
  if (!game.user?.isGM || !actor?.id) return;
  const store = dmIdentityReadStore();
  let changed = false;
  for (const [discordUserId, mapping] of Object.entries(store.mappings)) {
    if (mapping.actorId !== actor.id) continue;
    delete store.mappings[discordUserId];
    changed = true;
  }
  if (!changed) return;
  await dmIdentityWriteStore(store);
  dmIdentitySendMappings();
  dmIdentityNotifyChanged();
}

Hooks.once("init", () => {
  game.settings.register("dm-cockpit", DM_COCKPIT_IDENTITY_SETTING, {
    name: "DM Cockpit Discord-Spieler/Charakter-Zuordnung",
    scope: "world",
    config: false,
    type: Object,
    default: { version: 1, mappings: {} }
  });
});

Hooks.once("ready", () => {
  dmIdentityInstallTransportBridge();
  if (dmIdentityTransportConnected()) {
    dmIdentitySendMappings();
    dmIdentityRequestParticipants();
    dmIdentityRequestMappings();
  }
  globalThis.DMCockpitPlayerCharacterIdentity = {
    snapshot: () => dmIdentitySnapshot(),
    sync: () => dmIdentitySendMappings(),
    refreshParticipants: () => dmIdentityRequestParticipants(),
    assign: (discordUserId, actorId) => dmIdentityAssign(discordUserId, actorId)
  };
});

Hooks.on("renderApplicationV2", dmIdentityInject);
Hooks.on("updateActor", actor => void dmIdentityRefreshActorReference(actor));
Hooks.on("deleteActor", actor => void dmIdentityRemoveDeletedActor(actor));

console.log(`DM Cockpit | ${DM_COCKPIT_IDENTITY_VERSION} Spieler-/Charakter-Sprecherzuordnung bereit`);
