import { discordOutputStore, identityProfileStore, registerShutdownHandler } from "./server.js";
import { AiExtractionService } from "./ai-extraction-service.js";
import { DiscordAudioReceiver } from "./audio-receive.js";
import { CompanionPublisher } from "./companion-publisher.js";
import { DiscordCommandController } from "./discord-command-controller.js";
import { DiscordNicknameManager } from "./discord-nickname-manager.js";
import { DiscordOutputController } from "./discord-output-controller.js";
import { DiscordVoiceController } from "./discord-voice.js";
import { PlayerCharacterIdentityRegistry } from "./player-character-identity.js";
import { SessionControl } from "./session-control.js";
import { SttService } from "./stt-service.js";

let activeSessionId = null;
let publisher = null;
let nicknameManager = null;
let discordOutput = null;
let commandController = null;
let sessionControl = null;
let attachedVoiceConnection = null;
let latestVoiceStatus = null;
const npcContextBySession = new Map();
const playerIdentity = new PlayerCharacterIdentityRegistry();
const processedAudioSegments = new Map();
const LATEST_NPC_CONTEXT_KEY = "__latest_npc_context__";
const AUDIO_DEDUPE_TTL_MS = 5 * 60_000;

function contextKey(sessionId) {
  return String(sessionId ?? activeSessionId ?? "__no_session__");
}

function pruneAudioDedupe(nowMs = Date.now()) {
  for (const [key, observedAt] of processedAudioSegments) {
    if (nowMs - observedAt > AUDIO_DEDUPE_TTL_MS) processedAudioSegments.delete(key);
  }
}

function audioSegmentKey(segment, sessionId) {
  return [
    sessionId ?? "",
    segment?.discordUserId ?? "",
    segment?.startedAt ?? "",
    segment?.endedAt ?? "",
    segment?.packetCount ?? 0,
    segment?.byteLength ?? 0
  ].join("|");
}

function claimAudioSegment(segment, sessionId) {
  pruneAudioDedupe();
  const key = audioSegmentKey(segment, sessionId);
  if (processedAudioSegments.has(key)) return false;
  processedAudioSegments.set(key, Date.now());
  return true;
}

function sendCaptureStatus(state, sessionId = activeSessionId) {
  publisher?.send("capture.status", {
    state,
    policy: "notice_only",
    rawAudioRetention: "until_successful_transcription",
    noticeShown: Boolean(sessionId && discordOutput?.captureNoticeShown(sessionId)),
    legalAuthorizationConfirmedExternally: false
  }, sessionId ?? null);
}

function currentDiagnostic() {
  const voice = latestVoiceStatus ?? {};
  const output = discordOutput?.snapshot?.() ?? null;
  return {
    gatewayState: voice.gatewayState ?? "unknown",
    voiceState: voice.voiceState ?? "unknown",
    voiceError: voice.lastError ?? null,
    outputReady: Boolean(output?.gatewayReady && output?.selectedChannel && output?.validation?.valid !== false),
    outputError: output?.validation?.valid === false ? (output.validation.error ?? "Ausgabekanal nicht verwendbar") : null,
    error: voice.lastError ?? (output?.validation?.valid === false ? output.validation.error : null) ?? null
  };
}

function publishDiagnosticState(component = "runtime", state = null, detail = null) {
  const diagnostic = currentDiagnostic();
  publisher?.send("diagnostic.state", {
    component,
    state: state ?? (diagnostic.error ? "error" : "ready"),
    detail: detail ? String(detail) : null,
    ...diagnostic,
    updatedAt: new Date().toISOString()
  }, activeSessionId);
  return diagnostic;
}

function updatePresence() {
  commandController?.setPresence(sessionControl?.snapshot?.() ?? {}, currentDiagnostic());
}

const aiExtraction = new AiExtractionService({
  onCandidate: async (type, payload, context) => {
    publisher?.send(type, payload, context.sessionId ?? activeSessionId);
  },
  onStatus: status => {
    if (process.env.DM_COCKPIT_DISCORD_DEBUG === "1") {
      console.log("[ai] Status:", JSON.stringify(status));
    }
  }
});
aiExtraction.start();

function handleSessionControlRequest(message, sessionId) {
  if (!sessionControl) return false;

  if (message?.type === "session.control.start") {
    const result = sessionControl.start({
      requestedByDiscordUserId: message.payload?.requestedByDiscordUserId ?? null,
      metadata: { source: "foundry", requestId: message.id }
    });
    publisher?.send("session.control.result", {
      requestId: message.id,
      action: "start",
      status: result.status,
      state: result.state
    }, result.state?.sessionId ?? sessionId ?? null);
    syncAudioReceiver();
    return true;
  }

  if (message?.type === "session.control.stop") {
    const result = sessionControl.stop({
      requestedByDiscordUserId: message.payload?.requestedByDiscordUserId ?? null,
      reason: "foundry_stop"
    });
    publisher?.send("session.control.result", {
      requestId: message.id,
      action: "stop",
      status: result.status,
      state: result.state
    }, result.endedSessionId ?? sessionId ?? null);
    syncAudioReceiver();
    return true;
  }

  if (message?.type === "session.control.state.request") {
    publisher?.send("session.control.state", sessionControl.snapshot(), sessionControl.sessionId ?? sessionId ?? null);
    return true;
  }

  return false;
}

function handleDiscordOutputRequest(message, sessionId) {
  if (!discordOutput) return false;

  if (message?.type === "discord.output.channels.request") {
    void discordOutput.listChannels()
      .then(payload => publisher?.send("discord.output.channels.result", payload, sessionId))
      .catch(error => {
        publisher?.send("discord.output.channels.result", {
          guildId: discordOutput.guildId,
          channels: [],
          selectedChannel: discordOutput.persistedSelection(),
          observedAt: new Date().toISOString(),
          error: String(error?.message ?? error)
        }, sessionId);
      });
    return true;
  }

  if (message?.type === "discord.output.channel.set") {
    void discordOutput.selectChannel(message.payload?.channelId ?? null).catch(error => {
      publisher?.send("discord.output.state", {
        guildId: discordOutput.guildId,
        gatewayReady: discordOutput.gatewayReady(),
        selectedChannel: discordOutput.persistedSelection(),
        validation: {
          valid: false,
          channelId: message.payload?.channelId ?? null,
          channelName: null,
          label: null,
          error: String(error?.message ?? error)
        },
        updatedAt: new Date().toISOString()
      }, sessionId);
    });
    return true;
  }

  if (message?.type === "discord.output.state.request") {
    void discordOutput.emitState().catch(error => {
      console.warn("[discord-output] Status konnte nicht aktualisiert werden:", error?.message ?? error);
    });
    return true;
  }

  if (message?.type === "discord.output.message.request") {
    const profile = identityProfileStore.activeProfile();
    void discordOutput.sendRequestedMessage({
      requestId: message.id,
      kind: message.payload?.kind,
      text: message.payload?.text ?? "",
      sessionId: message.payload?.sessionId ?? sessionId ?? activeSessionId,
      profileName: message.payload?.profileName ?? profile?.name ?? null
    }).then(result => {
      if (result?.kind === "capture_notice" && result?.status === "sent") {
        sendCaptureStatus(sessionControl?.captureEnabled ? "listening" : "paused", result.sessionId ?? sessionId);
      }
    }).catch(error => {
      console.warn("[discord-output] Nachricht konnte nicht verarbeitet werden:", error?.message ?? error);
    });
    return true;
  }

  return false;
}

function handleProtocolBroadcast(message) {
  const sessionId = message?.sessionId ?? activeSessionId ?? null;

  if (handleSessionControlRequest(message, sessionId)) return;
  if (handleDiscordOutputRequest(message, sessionId)) return;

  if (message?.type === "player.character.mapping.result") {
    if (playerIdentity.replace(message.payload) && process.env.DM_COCKPIT_DISCORD_DEBUG === "1") {
      const snapshot = playerIdentity.snapshot();
      console.log(`[identity] ${snapshot.mappings.length} Spieler-/Charakterzuordnung(en) für Welt ${snapshot.worldId} aktiv.`);
    }
    return;
  }

  if (message?.type === "identity.profile.state") {
    if (nicknameManager?.started) {
      void nicknameManager.handleProfileState(message.payload).catch(error => {
        console.warn("[nickname] Profilzustand konnte nicht abgeglichen werden:", error?.message ?? error);
      });
    }
    return;
  }

  if (message?.type === "npc.context") {
    const payload = message.payload ?? null;
    const npcContext = payload?.actorId ? payload : null;
    npcContextBySession.set(LATEST_NPC_CONTEXT_KEY, npcContext);
    if (sessionId) npcContextBySession.set(contextKey(sessionId), npcContext);
    return;
  }

  if (message?.type === "session.ended") {
    if (sessionId) npcContextBySession.delete(contextKey(sessionId));
    return;
  }

  if (message?.type !== "transcript.segment" || message.payload?.final !== true) return;

  const key = contextKey(sessionId);
  const npcContext = npcContextBySession.has(key)
    ? npcContextBySession.get(key)
    : (npcContextBySession.get(LATEST_NPC_CONTEXT_KEY) ?? null);

  void aiExtraction.submit(message.payload, {
    sessionId,
    npcContext,
    mappingWorldId: playerIdentity.worldId
  }).catch(error => {
    console.warn("[ai] Protocol-Segment konnte nicht verarbeitet werden:", error?.message ?? error);
  });
}

publisher = new CompanionPublisher({
  onStatus: status => {
    updatePresence();
    if (process.env.DM_COCKPIT_DISCORD_DEBUG === "1") {
      console.log("[publisher] Status:", JSON.stringify(status));
    }
  },
  onMessage: handleProtocolBroadcast
});
publisher.start();

const stt = new SttService({
  onTranscript: async (payload, context) => {
    if (!context.sessionId || context.sessionId !== activeSessionId) return;
    publisher.send(
      "transcript.segment",
      playerIdentity.enrichTranscript(payload),
      context.sessionId
    );
  },
  onStatus: status => {
    if (process.env.DM_COCKPIT_DISCORD_DEBUG === "1") {
      console.log("[stt] Status:", JSON.stringify(status));
    }
  }
});
stt.start();

async function resolveSpeaker(discordUserId) {
  try {
    const user = await discordVoice.client?.users.fetch(discordUserId);
    if (user) {
      const guild = discordVoice.client?.guilds?.cache?.get(discordVoice.guildId) ?? null;
      const voiceMember = guild?.voiceStates?.cache?.get(String(discordUserId))?.member ?? null;
      const identity = {
        discordUserId: String(discordUserId),
        displayName: user.globalName ?? user.username ?? String(discordUserId),
        globalName: user.globalName ?? null,
        serverNickname: voiceMember?.nickname ?? null,
        isBot: Boolean(user.bot)
      };
      publisher.send("speaker.upserted", identity, activeSessionId);
      return identity;
    }
  } catch (error) {
    console.warn(`[stt] Sprechername für ${discordUserId} konnte nicht geladen werden:`, error?.message ?? error);
  }

  return {
    discordUserId: String(discordUserId),
    displayName: String(discordUserId),
    globalName: null,
    serverNickname: null,
    isBot: false
  };
}

async function processAudioSegment(segment) {
  const sessionId = String(segment?.sessionId ?? "").trim() || null;
  if (!sessionId || sessionId !== activeSessionId || !sessionControl?.active) {
    if (Array.isArray(segment?.opusPackets)) segment.opusPackets.length = 0;
    return;
  }
  if (!claimAudioSegment(segment, sessionId)) {
    if (Array.isArray(segment?.opusPackets)) segment.opusPackets.length = 0;
    return;
  }

  const speaker = await resolveSpeaker(segment.discordUserId);
  if (sessionId !== activeSessionId) {
    if (Array.isArray(segment.opusPackets)) segment.opusPackets.length = 0;
    return;
  }

  const result = await stt.submit(segment, {
    sessionId,
    speakerName: speaker.displayName
  });

  if (result?.status === "disabled") {
    console.log(
      `[audio-receive] STT noch deaktiviert: User ${segment.discordUserId}, ${segment.packetCount} Pakete, ${segment.byteLength} Bytes.`
    );
  }
}

const audioReceiver = new DiscordAudioReceiver({
  onSegment: segment => {
    const sessionId = activeSessionId;
    if (!sessionId || !sessionControl?.captureEnabled) {
      if (Array.isArray(segment.opusPackets)) segment.opusPackets.length = 0;
      return;
    }
    segment.sessionId = sessionId;
    void processAudioSegment(segment).catch(error => {
      console.warn("[stt] Segmentverarbeitung fehlgeschlagen:", error?.message ?? error);
      if (Array.isArray(segment.opusPackets)) segment.opusPackets.length = 0;
    });
  },
  onStatus: status => {
    if (process.env.DM_COCKPIT_DISCORD_DEBUG === "1") {
      console.log("[audio-receive] Status:", JSON.stringify(status));
    }
  }
});

function syncAudioReceiver() {
  if (!sessionControl) return;
  const connection = discordVoice.connection;
  const shouldAttach = Boolean(sessionControl.captureEnabled && connection?.receiver);

  if (shouldAttach) {
    if (connection !== attachedVoiceConnection) {
      try {
        audioReceiver.attach(connection, { botUserId: discordVoice.botUserId });
        attachedVoiceConnection = connection;
      } catch (error) {
        console.warn("[audio-receive] Konnte Receiver nicht anbinden:", error?.message ?? error);
        sendCaptureStatus("error", activeSessionId);
        publishDiagnosticState("audio_receiver", "error", error?.message ?? error);
        return;
      }
    }
    sendCaptureStatus("listening", activeSessionId);
    return;
  }

  if (attachedVoiceConnection) {
    audioReceiver.detach(sessionControl.active ? "Voice vorübergehend nicht bereit" : "Keine aktive Session");
    attachedVoiceConnection = null;
  }
  sendCaptureStatus(sessionControl.active ? "paused" : "idle", activeSessionId);
}

const discordVoice = new DiscordVoiceController({
  onCaptureState: state => {
    console.log(`[discord-voice] Capture-Status: ${state}`);
    if (!sessionControl?.active) return sendCaptureStatus("idle", null);
    if (state === "error") return sendCaptureStatus("error", activeSessionId);
    sendCaptureStatus(sessionControl.captureEnabled ? "listening" : "paused", activeSessionId);
  },
  onParticipants: payload => {
    publisher.send("voice.participants", payload, activeSessionId);
    if (nicknameManager?.started) {
      void nicknameManager.handleParticipants(payload).catch(error => {
        console.warn("[nickname] Teilnehmerzustand konnte nicht abgeglichen werden:", error?.message ?? error);
      });
    }
  },
  onStatus: status => {
    latestVoiceStatus = status;
    sessionControl?.setVoiceState({
      ready: status?.voiceState === "ready",
      channelId: status?.channelId ?? null,
      reason: status?.voiceState === "ready" ? "voice_ready" : `voice_${status?.voiceState ?? "unknown"}`
    });
    syncAudioReceiver();
    publishDiagnosticState(
      "discord_voice",
      status?.gatewayState === "error" || status?.voiceState === "error" ? "error" : "ready",
      status?.lastError ?? null
    );

    if (status?.gatewayState === "ready") {
      if (discordOutput) {
        void discordOutput.emitState().catch(error => {
          console.warn("[discord-output] Status nach Discord-Ready fehlgeschlagen:", error?.message ?? error);
        });
      }
      if (commandController) {
        void commandController.start().catch(error => {
          console.warn("[discord-command] Slash Commands konnten nicht registriert werden:", error?.message ?? error);
        });
      }
    }
    updatePresence();
    if (process.env.DM_COCKPIT_DISCORD_DEBUG === "1") {
      console.log("[discord-voice] Status:", JSON.stringify(status));
    }
  }
});

nicknameManager = new DiscordNicknameManager({
  voice: discordVoice,
  store: identityProfileStore,
  onStatus: status => {
    publisher.send("nickname.status", {
      ...status,
      updatedAt: new Date().toISOString()
    }, activeSessionId);
    if (process.env.DM_COCKPIT_DISCORD_DEBUG === "1") {
      console.log("[nickname] Status:", JSON.stringify(status));
    }
  }
});
nicknameManager.start();

discordOutput = new DiscordOutputController({
  voice: discordVoice,
  store: discordOutputStore,
  onState: state => {
    publisher.send("discord.output.state", state, activeSessionId);
    publishDiagnosticState(
      "discord_output",
      state?.validation?.valid === false ? "error" : "ready",
      state?.validation?.valid === false ? state.validation.error : null
    );
    updatePresence();
    if (process.env.DM_COCKPIT_DISCORD_DEBUG === "1") {
      console.log("[discord-output] Status:", JSON.stringify(state));
    }
  },
  onResult: result => {
    publisher.send("discord.output.message.result", {
      ...result,
      updatedAt: new Date().toISOString()
    }, result?.sessionId ?? activeSessionId);
    if (process.env.DM_COCKPIT_DISCORD_DEBUG === "1") {
      console.log("[discord-output] Ergebnis:", JSON.stringify(result));
    }
  }
});

sessionControl = new SessionControl({
  onStarted: event => {
    activeSessionId = event.sessionId;
    const activeProfile = identityProfileStore.activeProfile();
    publisher.send("session.started", {
      sessionId: activeSessionId,
      startedAt: event.startedAt,
      startedByDiscordUserId: event.startedByDiscordUserId,
      guildId: discordVoice.guildId,
      voiceChannelId: discordVoice.channelId,
      gmDiscordUserId: discordVoice.gmUserId,
      capturePolicy: "notice_only",
      providers: {
        stt: stt.snapshot().provider,
        ai: aiExtraction.snapshot().provider
      },
      identityProfileId: activeProfile?.profileId ?? null,
      startMode: "manual"
    }, activeSessionId);

    void discordOutput.sendRequestedMessage({
      requestId: `auto-capture-notice:${activeSessionId}`,
      kind: "capture_notice",
      sessionId: activeSessionId,
      profileName: activeProfile?.name ?? null
    }).then(result => {
      if (result?.status === "sent") sendCaptureStatus(sessionControl.captureEnabled ? "listening" : "paused", activeSessionId);
    }).catch(error => {
      console.warn("[discord-output] Automatischer Aufnahmehinweis fehlgeschlagen:", error?.message ?? error);
    });
  },
  onEnded: event => {
    const endedSessionId = event.sessionId;
    if (attachedVoiceConnection) {
      audioReceiver.detach("Session beendet");
      attachedVoiceConnection = null;
    }
    sendCaptureStatus("idle", endedSessionId);
    publisher.send("session.ended", {
      sessionId: endedSessionId,
      startedAt: event.startedAt,
      endedAt: event.endedAt,
      stoppedByDiscordUserId: event.stoppedByDiscordUserId,
      reason: event.reason
    }, endedSessionId);
    npcContextBySession.delete(contextKey(endedSessionId));
    activeSessionId = null;
  },
  onState: state => {
    publisher.send("session.control.state", state, state.sessionId ?? activeSessionId);
    updatePresence();
  }
});
sessionControl.setVoiceState({
  ready: discordVoice.voiceState === "ready",
  channelId: discordVoice.channelId,
  reason: "initial_voice_state"
});

function statusText() {
  const session = sessionControl.snapshot();
  const voice = latestVoiceStatus ?? discordVoice.snapshot();
  const output = discordOutput.snapshot();
  const reconnect = voice.reconnect ?? {};
  const reconnectActive = voice.voiceState === "reconnecting" || Boolean(reconnect.scheduled);
  const lines = [
    `Session: ${session.active ? `aktiv (${session.sessionId})` : "inaktiv"}`,
    `Capture: ${session.captureEnabled ? "aktiv" : session.active ? "pausiert" : "aus"}`,
    `Discord Gateway: ${voice.gatewayState}`,
    `Voice: ${voice.voiceState}${voice.channelId ? ` (${voice.channelId})` : ""}`,
    `Reconnect: ${reconnectActive ? `läuft (${reconnect.attempts ?? 0}/${reconnect.maxAttempts ?? "?"})` : reconnect.allowed ? "bereit" : "aus"}`,
    `Ausgabekanal: ${output.selectedChannel ? `#${output.selectedChannel.channelName ?? output.selectedChannel.channelId}` : "nicht gewählt"}`
  ];
  const error = voice.lastError ?? (output.validation?.valid === false ? output.validation.error : null);
  if (error) lines.push(`Diagnose: ${error}`);
  return `DM Cockpit\n${lines.join("\n")}`;
}

commandController = new DiscordCommandController({
  voice: discordVoice,
  gmUserId: discordVoice.gmUserId,
  onStatusCommand: async () => ({ content: statusText() }),
  onStartCommand: async context => {
    const result = sessionControl.start({
      requestedByDiscordUserId: context.discordUserId,
      metadata: { source: "discord_slash", interactionId: context.interactionId }
    });
    syncAudioReceiver();
    if (result.status === "started") return { content: `DM Cockpit: Session gestartet (${result.state.sessionId}).` };
    if (result.status === "already_active") return { content: `DM Cockpit: Session läuft bereits (${result.state.sessionId}).` };
    return { content: "DM Cockpit: Session kann erst gestartet werden, wenn die Voice-Verbindung bereit ist." };
  },
  onStopCommand: async context => {
    const result = sessionControl.stop({
      requestedByDiscordUserId: context.discordUserId,
      reason: "discord_slash_stop"
    });
    syncAudioReceiver();
    if (result.status === "stopped") return { content: `DM Cockpit: Session beendet (${result.endedSessionId}).` };
    return { content: "DM Cockpit: Es läuft keine Session." };
  },
  onRecapCommand: async context => {
    const sent = publisher.send("discord.command.recap.request", {
      requestId: context.interactionId,
      requestedByDiscordUserId: context.discordUserId,
      sessionId: activeSessionId
    }, activeSessionId);
    return {
      content: sent
        ? "DM Cockpit: Bestätigtes Recap wurde bei Foundry angefordert. Der Versand erfolgt nur über den konfigurierten Discord-Ausgabekanal."
        : "DM Cockpit: Recap-Anfrage wurde vorgemerkt; Foundry/Companion-Verbindung ist derzeit nicht vollständig bereit."
    };
  },
  onDiagnostic: diagnostic => {
    publisher.send("diagnostic.state", {
      ...diagnostic,
      ...currentDiagnostic(),
      updatedAt: diagnostic?.updatedAt ?? new Date().toISOString()
    }, activeSessionId);
  }
});

const receiverWatch = setInterval(() => {
  syncAudioReceiver();
}, 500);
receiverWatch.unref?.();

void discordVoice.start().catch(error => {
  console.error("[discord-voice] Start fehlgeschlagen:", error?.message ?? error);
});

async function stopDiscordVoice() {
  clearInterval(receiverWatch);

  try {
    await nicknameManager?.shutdown();
  } catch (error) {
    console.warn("[nickname] Session-Nicknames konnten beim Shutdown nicht vollständig restauriert werden:", error?.message ?? error);
  }

  commandController?.stop();
  audioReceiver.detach("Companion wird beendet");
  attachedVoiceConnection = null;

  if (sessionControl?.active) {
    sessionControl.stop({ reason: "companion_shutdown" });
  }

  try {
    await discordVoice.stop();
  } catch (error) {
    console.warn("[discord-voice] Fehler beim Beenden:", error?.message ?? error);
  }

  publisher.stop();
}

registerShutdownHandler(stopDiscordVoice);
