const DM_COCKPIT_DISCORD_OUTPUT_VERSION = "V0.9.29";

const dmDiscordOutputState = {
  channels: [],
  selectedChannel: null,
  validation: null,
  gatewayReady: false,
  observedAt: null,
  error: null,
  lastResult: null,
  transportWrapped: false
};

function dmDiscordOutputEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dmDiscordOutputIsCockpit(application) {
  return application?.id === "dm-cockpit" || application?.options?.id === "dm-cockpit";
}

function dmDiscordOutputTransport() {
  return globalThis.DMCockpitLiveTranscript?.transport ?? null;
}

function dmDiscordOutputConnected() {
  return dmDiscordOutputTransport()?.connectionState === "connected";
}

function dmDiscordOutputSend(type, payload = {}, sessionId = null) {
  const transport = dmDiscordOutputTransport();
  if (!transport?.send || transport.connectionState !== "connected") return false;
  return transport.send(type, payload, sessionId);
}

function dmDiscordOutputRequestChannels() {
  return dmDiscordOutputSend("discord.output.channels.request", {});
}

function dmDiscordOutputRequestState() {
  return dmDiscordOutputSend("discord.output.state.request", {});
}

function dmDiscordOutputSetChannel(channelId) {
  return dmDiscordOutputSend("discord.output.channel.set", {
    channelId: String(channelId ?? "").trim() || null
  });
}

function dmDiscordOutputSendMessage(kind, { text = "", sessionId = null, profileName = null } = {}) {
  return dmDiscordOutputSend("discord.output.message.request", {
    kind,
    text: String(text ?? ""),
    sessionId: String(sessionId ?? "").trim() || null,
    profileName: String(profileName ?? "").trim() || null
  }, sessionId);
}

function dmDiscordOutputSnapshot() {
  return {
    connected: dmDiscordOutputConnected(),
    channels: dmDiscordOutputState.channels.map(channel => ({ ...channel })),
    selectedChannel: dmDiscordOutputState.selectedChannel ? { ...dmDiscordOutputState.selectedChannel } : null,
    validation: dmDiscordOutputState.validation ? { ...dmDiscordOutputState.validation } : null,
    gatewayReady: dmDiscordOutputState.gatewayReady,
    observedAt: dmDiscordOutputState.observedAt,
    error: dmDiscordOutputState.error,
    lastResult: dmDiscordOutputState.lastResult ? { ...dmDiscordOutputState.lastResult } : null
  };
}

function dmDiscordOutputNotify() {
  Hooks.callAll("dmCockpitDiscordOutputStateChanged", dmDiscordOutputSnapshot());
}

function dmDiscordOutputIngest(envelope) {
  if (!envelope || typeof envelope !== "object" || envelope.v !== "1.0") return;
  const payload = envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {};

  if (envelope.type === "hello.ack") {
    dmDiscordOutputRequestState();
    dmDiscordOutputRequestChannels();
    return;
  }

  if (envelope.type === "discord.output.channels.result") {
    dmDiscordOutputState.channels = Array.isArray(payload.channels)
      ? payload.channels.map(channel => ({ ...channel }))
      : [];
    if (payload.selectedChannel) dmDiscordOutputState.selectedChannel = { ...payload.selectedChannel };
    dmDiscordOutputState.observedAt = payload.observedAt ?? new Date().toISOString();
    dmDiscordOutputState.error = payload.error ?? null;
    dmDiscordOutputNotify();
    return;
  }

  if (envelope.type === "discord.output.state") {
    dmDiscordOutputState.gatewayReady = Boolean(payload.gatewayReady);
    dmDiscordOutputState.selectedChannel = payload.selectedChannel ? { ...payload.selectedChannel } : null;
    dmDiscordOutputState.validation = payload.validation ? { ...payload.validation } : null;
    dmDiscordOutputState.error = payload.validation?.valid === false ? (payload.validation.error ?? null) : null;
    dmDiscordOutputState.observedAt = payload.updatedAt ?? new Date().toISOString();
    dmDiscordOutputNotify();
    return;
  }

  if (envelope.type === "discord.output.message.result") {
    dmDiscordOutputState.lastResult = { ...payload };
    dmDiscordOutputNotify();
    const automatic = String(payload.requestId ?? "").startsWith("auto-capture-notice:");
    if (!automatic) {
      if (payload.status === "sent") {
        const kind = payload.kind === "recap" ? "Session-Recap" : "Aufnahmehinweis";
        ui.notifications?.info(`DM Cockpit: ${kind} an Discord gesendet.`);
      } else if (payload.status === "failed") {
        ui.notifications?.error(`DM Cockpit: Discord-Versand fehlgeschlagen${payload.error ? ` – ${payload.error}` : "."}`);
      }
    }
  }
}

function dmDiscordOutputInstallTransportBridge() {
  const transport = dmDiscordOutputTransport();
  if (!transport || transport.__dmCockpitDiscordOutputWrapped) return Boolean(transport);
  const originalIngest = transport.ingest.bind(transport);
  transport.ingest = envelope => {
    const result = originalIngest(envelope);
    try {
      dmDiscordOutputIngest(envelope);
    } catch (error) {
      console.warn("DM Cockpit | Discord-Output-Nachricht konnte nicht verarbeitet werden", error);
    }
    return result;
  };
  transport.__dmCockpitDiscordOutputWrapped = true;
  dmDiscordOutputState.transportWrapped = true;
  return true;
}

function dmDiscordOutputOptions(snapshot) {
  const selectedId = snapshot.selectedChannel?.channelId ?? "";
  const entries = [`<option value="">Kein Ausgabekanal</option>`];
  const known = new Set();
  for (const channel of snapshot.channels) {
    const id = String(channel.channelId ?? "").trim();
    if (!id) continue;
    known.add(id);
    const label = String(channel.label ?? `#${channel.name ?? id}`);
    entries.push(`<option value="${dmDiscordOutputEscape(id)}"${id === selectedId ? " selected" : ""}>${dmDiscordOutputEscape(label)}</option>`);
  }
  if (selectedId && !known.has(selectedId)) {
    const fallback = snapshot.selectedChannel?.channelName ? `#${snapshot.selectedChannel.channelName}` : selectedId;
    entries.push(`<option value="${dmDiscordOutputEscape(selectedId)}" selected>${dmDiscordOutputEscape(fallback)} · aktuell gespeichert</option>`);
  }
  return entries.join("");
}

function dmDiscordOutputStatus(snapshot) {
  if (!snapshot.connected) return { text: "Companion nicht verbunden", className: "" };
  if (!snapshot.gatewayReady) return { text: "Discord noch nicht bereit", className: "" };
  if (!snapshot.selectedChannel) return { text: "Kein Ausgabekanal gewählt", className: "" };
  if (snapshot.validation?.valid === false) return { text: "Ausgabekanal nicht verwendbar", className: "is-error" };
  return { text: "Discord-Ausgabe bereit", className: "is-online" };
}

function dmDiscordOutputLastResult(snapshot) {
  const result = snapshot.lastResult;
  if (!result) return "Noch keine Nachricht über diesen Ausgabepfad gesendet.";
  const kind = result.kind === "recap" ? "Recap" : "Aufnahmehinweis";
  if (result.status === "sent") return `${kind} erfolgreich gesendet${result.channelName ? ` → #${result.channelName}` : ""}.`;
  return `${kind} fehlgeschlagen${result.error ? `: ${result.error}` : "."}`;
}

function dmDiscordOutputHtml(snapshot) {
  const status = dmDiscordOutputStatus(snapshot);
  return `<details id="dm-discord-output" class="dm-cockpit-card dm-cockpit-wide dm-collapsible" open>
    <summary class="dm-cockpit-card-title">
      <div>
        <h3>Discord-Ausgabe</h3>
        <p class="card-subtitle">Textkanal jederzeit wechseln · Aufnahmehinweis · bewusstes Recap-Posting</p>
      </div>
      <span class="dm-summary-chevron"><i class="fa-solid fa-chevron-down"></i></span>
    </summary>
    <div class="dm-card-body" data-dm-discord-output-root>
      <div class="dm-discord-output-statusbar">
        <span class="dm-discord-output-status ${status.className}"><i class="fa-solid fa-circle"></i> ${dmDiscordOutputEscape(status.text)}</span>
        <span class="dm-discord-output-status"><i class="fa-brands fa-discord"></i> ${snapshot.selectedChannel ? dmDiscordOutputEscape(`#${snapshot.selectedChannel.channelName ?? snapshot.selectedChannel.channelId}`) : "kein Kanal"}</span>
      </div>

      <div class="dm-discord-output-grid">
        <label>
          <span>Discord-Textkanal</span>
          <select data-dm-discord-output-channel>${dmDiscordOutputOptions(snapshot)}</select>
        </label>
        <div class="dm-section-actions dm-discord-output-actions">
          <button type="button" class="dm-button-primary small" data-dm-discord-output-save><i class="fa-solid fa-floppy-disk"></i> Kanal übernehmen</button>
          <button type="button" class="dm-button-secondary small" data-dm-discord-output-refresh><i class="fa-solid fa-rotate"></i> Kanäle aktualisieren</button>
          <button type="button" class="dm-button-secondary small" data-dm-discord-output-notice${snapshot.selectedChannel ? "" : " disabled"}><i class="fa-solid fa-microphone-lines"></i> Hinweis senden</button>
        </div>
      </div>

      <div class="dm-discord-output-notice">
        <i class="fa-solid fa-shield-halved"></i>
        <span>Der Bot sendet nur in den hier gewählten Kanal. Erwähnungen werden beim Versand deaktiviert. Beim Sessionstart wird ein transparenter Transkriptionshinweis automatisch höchstens einmal erfolgreich gesendet. Recaps werden niemals automatisch gepostet.</span>
      </div>
      ${snapshot.error ? `<div class="dm-discord-output-error"><i class="fa-solid fa-triangle-exclamation"></i> ${dmDiscordOutputEscape(snapshot.error)}</div>` : ""}
      <div class="dm-discord-output-last"><strong>Letzter Versand:</strong> ${dmDiscordOutputEscape(dmDiscordOutputLastResult(snapshot))}</div>
    </div>
  </details>`;
}

function dmDiscordOutputBind(section) {
  if (!section || section.dataset.dmDiscordOutputBound === "1") return;
  section.dataset.dmDiscordOutputBound = "1";

  section.addEventListener("click", event => {
    if (event.target.closest?.("[data-dm-discord-output-refresh]")) {
      if (!dmDiscordOutputRequestChannels() || !dmDiscordOutputRequestState()) {
        ui.notifications?.warn("DM Cockpit: Companion ist nicht verbunden.");
      }
      return;
    }

    if (event.target.closest?.("[data-dm-discord-output-save]")) {
      const channelId = String(section.querySelector("[data-dm-discord-output-channel]")?.value ?? "").trim() || null;
      if (!dmDiscordOutputSetChannel(channelId)) {
        ui.notifications?.warn("DM Cockpit: Companion ist nicht verbunden.");
        return;
      }
      ui.notifications?.info(channelId ? "DM Cockpit: Discord-Ausgabekanal wird übernommen." : "DM Cockpit: Discord-Ausgabekanal wird entfernt.");
      return;
    }

    if (event.target.closest?.("[data-dm-discord-output-notice]")) {
      const profileName = globalThis.DMCockpitSessionIdentityProfile?.snapshot?.()?.activeProfile?.name ?? null;
      if (!dmDiscordOutputSendMessage("capture_notice", { profileName })) {
        ui.notifications?.warn("DM Cockpit: Companion ist nicht verbunden.");
      }
    }
  });
}

function dmDiscordOutputRender(section) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = dmDiscordOutputHtml(dmDiscordOutputSnapshot()).trim();
  const fresh = wrapper.firstElementChild;
  if (!fresh || !section?.isConnected) return section;
  section.replaceWith(fresh);
  dmDiscordOutputBind(fresh);
  return fresh;
}

function dmDiscordOutputInject(application, element) {
  if (!game.user?.isGM || !dmDiscordOutputIsCockpit(application)) return;
  const grid = element.querySelector?.(".dm-cockpit-grid");
  if (!grid || element.querySelector("#dm-discord-output")) return;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = dmDiscordOutputHtml(dmDiscordOutputSnapshot()).trim();
  let section = wrapper.firstElementChild;
  const profile = grid.querySelector("#dm-session-identity-profile");
  if (profile) profile.after(section);
  else grid.appendChild(section);
  dmDiscordOutputBind(section);

  let hookId;
  hookId = Hooks.on("dmCockpitDiscordOutputStateChanged", () => {
    if (!section?.isConnected) {
      Hooks.off("dmCockpitDiscordOutputStateChanged", hookId);
      return;
    }
    section = dmDiscordOutputRender(section);
  });
}

Hooks.once("ready", () => {
  dmDiscordOutputInstallTransportBridge();
  if (dmDiscordOutputConnected()) {
    dmDiscordOutputRequestState();
    dmDiscordOutputRequestChannels();
  }
  globalThis.DMCockpitDiscordOutput = {
    snapshot: () => dmDiscordOutputSnapshot(),
    refresh: () => {
      dmDiscordOutputRequestState();
      dmDiscordOutputRequestChannels();
    },
    selectChannel: channelId => dmDiscordOutputSetChannel(channelId),
    sendNotice: ({ sessionId = null, profileName = null } = {}) => dmDiscordOutputSendMessage("capture_notice", { sessionId, profileName }),
    sendRecap: ({ text, sessionId = null } = {}) => dmDiscordOutputSendMessage("recap", { text, sessionId })
  };
});

Hooks.on("renderApplicationV2", dmDiscordOutputInject);

console.log(`DM Cockpit | ${DM_COCKPIT_DISCORD_OUTPUT_VERSION} Discord-Ausgabe bereit`);
