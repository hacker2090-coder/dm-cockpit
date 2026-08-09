const DM_COCKPIT_DISCORD_COMMAND_BRIDGE_VERSION = "V0.9.30";

const dmDiscordCommandState = {
  session: null,
  diagnostic: null,
  wrapped: false,
  lastRecapRequestId: null
};

function dmDiscordCommandTransport() {
  return globalThis.DMCockpitLiveTranscript?.transport ?? null;
}

function dmDiscordCommandNotify() {
  Hooks.callAll("dmCockpitSessionControlStateChanged", {
    session: dmDiscordCommandState.session ? { ...dmDiscordCommandState.session } : null,
    diagnostic: dmDiscordCommandState.diagnostic ? { ...dmDiscordCommandState.diagnostic } : null
  });
}

function dmDiscordCommandHandleRecapRequest(envelope) {
  if (!game.user?.isGM) return;
  const requestId = String(envelope?.payload?.requestId ?? envelope?.id ?? "").trim();
  if (!requestId || requestId === dmDiscordCommandState.lastRecapRequestId) return;
  dmDiscordCommandState.lastRecapRequestId = requestId;

  const recap = globalThis.DMCockpitSessionRecap?.snapshot?.() ?? null;
  if (!recap?.eventCount) {
    ui.notifications?.warn("DM Cockpit: /dm recap angefordert, aber es gibt noch keine angenommenen Session-Ereignisse.");
    return;
  }

  const output = globalThis.DMCockpitDiscordOutput;
  const outputState = output?.snapshot?.() ?? null;
  if (!output?.sendRecap || !outputState?.selectedChannel) {
    ui.notifications?.warn("DM Cockpit: /dm recap angefordert, aber kein Discord-Ausgabekanal ist bereit.");
    return;
  }

  const sent = output.sendRecap({
    text: recap.discordSummary,
    sessionId: recap.sessionId ?? envelope?.sessionId ?? null
  });
  if (!sent) {
    ui.notifications?.warn("DM Cockpit: /dm recap konnte nicht an den Companion weitergegeben werden.");
    return;
  }
  ui.notifications?.info("DM Cockpit: /dm recap – bestätigtes Recap wird bewusst an Discord gesendet.");
}

function dmDiscordCommandIngest(envelope) {
  if (!envelope || typeof envelope !== "object" || envelope.v !== "1.0") return;
  const payload = envelope.payload && typeof envelope.payload === "object" ? envelope.payload : {};

  if (envelope.type === "hello.ack") {
    dmDiscordCommandTransport()?.send?.("session.control.state.request", {}, null);
    return;
  }

  if (envelope.type === "session.control.state") {
    dmDiscordCommandState.session = { ...payload };
    dmDiscordCommandNotify();
    return;
  }

  if (envelope.type === "diagnostic.state") {
    dmDiscordCommandState.diagnostic = { ...payload };
    dmDiscordCommandNotify();
    return;
  }

  if (envelope.type === "discord.command.recap.request") {
    dmDiscordCommandHandleRecapRequest(envelope);
  }
}

function dmDiscordCommandInstallBridge() {
  const transport = dmDiscordCommandTransport();
  if (!transport || transport.__dmCockpitDiscordCommandWrapped) return Boolean(transport);
  const originalIngest = transport.ingest.bind(transport);
  transport.ingest = envelope => {
    const result = originalIngest(envelope);
    try {
      dmDiscordCommandIngest(envelope);
    } catch (error) {
      console.warn("DM Cockpit | Discord-Command-Bridge konnte Nachricht nicht verarbeiten", error);
    }
    return result;
  };
  transport.__dmCockpitDiscordCommandWrapped = true;
  dmDiscordCommandState.wrapped = true;
  return true;
}

function dmDiscordCommandGmSend(type, payload = {}, sessionId = null) {
  if (!game.user?.isGM) {
    ui.notifications?.warn("DM Cockpit: Session-Steuerung ist dem GM vorbehalten.");
    return false;
  }
  return dmDiscordCommandTransport()?.send?.(type, payload, sessionId) ?? false;
}

Hooks.once("ready", () => {
  dmDiscordCommandInstallBridge();
  globalThis.DMCockpitSessionControl = {
    snapshot: () => ({
      session: dmDiscordCommandState.session ? { ...dmDiscordCommandState.session } : null,
      diagnostic: dmDiscordCommandState.diagnostic ? { ...dmDiscordCommandState.diagnostic } : null
    }),
    requestState: () => dmDiscordCommandTransport()?.send?.("session.control.state.request", {}, null) ?? false,
    start: () => dmDiscordCommandGmSend("session.control.start", { source: "foundry" }, null),
    stop: () => dmDiscordCommandGmSend("session.control.stop", { source: "foundry" }, dmDiscordCommandState.session?.sessionId ?? null)
  };
});

console.log(`DM Cockpit | ${DM_COCKPIT_DISCORD_COMMAND_BRIDGE_VERSION} Discord-Command-/Session-Control-Bridge bereit`);
