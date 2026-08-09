import { randomUUID } from "node:crypto";
import { discordOutputStore, identityProfileStore, registerShutdownHandler } from "./server.js";
import { AiExtractionService } from "./ai-extraction-service.js";
import { DiscordAudioReceiver } from "./audio-receive.js";
import { CompanionPublisher } from "./companion-publisher.js";
import { DiscordNicknameManager } from "./discord-nickname-manager.js";
import { DiscordOutputController } from "./discord-output-controller.js";
import { DiscordVoiceController } from "./discord-voice.js";
import { PlayerCharacterIdentityRegistry } from "./player-character-identity.js";
import { SttService } from "./stt-service.js";

let activeSessionId = null;
let publisher = null;
let nicknameManager = null;
let discordOutput = null;
const npcContextBySession = new Map();
const playerIdentity = new PlayerCharacterIdentityRegistry();
const LATEST_NPC_CONTEXT_KEY = "__latest_npc_context__";

function contextKey(sessionId) {
  return String(sessionId ?? activeSessionId ?? "__no_session__");
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
        sendCaptureStatus(discordVoice?.voiceState === "ready" ? "listening" : "paused", result.sessionId ?? sessionId);
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
    if (process.env.DM_COCKPIT_DISCORD_DEBUG === "1") {
      console.log("[publisher] Status:", JSON.stringify(status));
    }
  },
  onMessage: handleProtocolBroadcast
});
publisher.start();

const stt = new SttService({
  onTranscript: async (payload, context) => {
    publisher.send(
      "transcript.segment",
      playerIdentity.enrichTranscript(payload),
      context.sessionId ?? activeSessionId
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
  const speaker = await resolveSpeaker(segment.discordUserId);
  const result = await stt.submit(segment, {
    sessionId: activeSessionId,
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

const discordVoice = new DiscordVoiceController({
  onCaptureState: state => {
    console.log(`[discord-voice] Capture-Status: ${state}`);
    sendCaptureStatus(state, activeSessionId);
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
    if (status?.gatewayState === "ready" && discordOutput) {
      void discordOutput.emitState().catch(error => {
        console.warn("[discord-output] Status nach Discord-Ready fehlgeschlagen:", error?.message ?? error);
      });
    }
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

let attachedVoiceConnection = null;
const receiverWatch = setInterval(() => {
  const connection = discordVoice.connection;

  if (connection && connection !== attachedVoiceConnection && connection.receiver) {
    try {
      const newSession = !activeSessionId;
      if (newSession) {
        activeSessionId = `voice_${randomUUID()}`;
        const activeProfile = identityProfileStore.activeProfile();
        publisher.send("session.started", {
          sessionId: activeSessionId,
          startedAt: new Date().toISOString(),
          guildId: discordVoice.guildId,
          voiceChannelId: discordVoice.channelId,
          gmDiscordUserId: discordVoice.gmUserId,
          capturePolicy: "notice_only",
          providers: {
            stt: stt.snapshot().provider,
            ai: aiExtraction.snapshot().provider
          },
          identityProfileId: activeProfile?.profileId ?? null
        }, activeSessionId);

        void discordOutput.sendRequestedMessage({
          requestId: `auto-capture-notice:${activeSessionId}`,
          kind: "capture_notice",
          sessionId: activeSessionId,
          profileName: activeProfile?.name ?? null
        }).then(result => {
          if (result?.status === "sent") sendCaptureStatus("listening", activeSessionId);
        }).catch(error => {
          console.warn("[discord-output] Automatischer Aufnahmehinweis fehlgeschlagen:", error?.message ?? error);
        });
      }

      audioReceiver.attach(connection, { botUserId: discordVoice.botUserId });
      attachedVoiceConnection = connection;
      sendCaptureStatus("listening", activeSessionId);
    } catch (error) {
      console.warn("[audio-receive] Konnte Receiver nicht anbinden:", error?.message ?? error);
    }
    return;
  }

  if (!connection && attachedVoiceConnection) {
    audioReceiver.detach("Discord Voice verlassen");
    attachedVoiceConnection = null;

    if (activeSessionId) {
      const endedSessionId = activeSessionId;
      sendCaptureStatus("idle", endedSessionId);
      publisher.send("session.ended", {
        sessionId: endedSessionId,
        endedAt: new Date().toISOString()
      }, endedSessionId);
      npcContextBySession.delete(contextKey(endedSessionId));
      activeSessionId = null;
    }
  }
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

  audioReceiver.detach("Companion wird beendet");
  attachedVoiceConnection = null;

  if (activeSessionId) {
    const endedSessionId = activeSessionId;
    publisher.send("session.ended", {
      sessionId: endedSessionId,
      endedAt: new Date().toISOString()
    }, endedSessionId);
    npcContextBySession.delete(contextKey(endedSessionId));
    activeSessionId = null;
  }

  try {
    await discordVoice.stop();
  } catch (error) {
    console.warn("[discord-voice] Fehler beim Beenden:", error?.message ?? error);
  }

  publisher.stop();
}

registerShutdownHandler(stopDiscordVoice);
