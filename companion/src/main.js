import { randomUUID } from "node:crypto";
import "./server.js";
import { AiExtractionService } from "./ai-extraction-service.js";
import { DiscordAudioReceiver } from "./audio-receive.js";
import { CompanionPublisher } from "./companion-publisher.js";
import { DiscordVoiceController } from "./discord-voice.js";
import { SttService } from "./stt-service.js";

let activeSessionId = null;
let publisher = null;
const npcContextBySession = new Map();
const playerCharacterMappings = new Map();
let activeMappingWorldId = null;
const LATEST_NPC_CONTEXT_KEY = "__latest_npc_context__";

function contextKey(sessionId) {
  return String(sessionId ?? activeSessionId ?? "__no_session__");
}

function replaceActiveMappings(payload = {}) {
  const worldId = String(payload.worldId ?? "").trim();
  if (!worldId || !Array.isArray(payload.mappings)) return false;

  playerCharacterMappings.clear();
  for (const raw of payload.mappings) {
    const discordUserId = String(raw?.discordUserId ?? "").trim();
    const actorId = String(raw?.actorId ?? "").trim();
    const characterName = String(raw?.characterName ?? "").trim();
    if (!discordUserId || !actorId || !characterName) continue;
    playerCharacterMappings.set(discordUserId, {
      discordUserId,
      playerName: String(raw?.playerName ?? "").trim() || null,
      actorId,
      actorUuid: String(raw?.actorUuid ?? "").trim() || null,
      characterName
    });
  }
  activeMappingWorldId = worldId;
  if (process.env.DM_COCKPIT_DISCORD_DEBUG === "1") {
    console.log(`[identity] ${playerCharacterMappings.size} Spieler-/Charakterzuordnung(en) für Welt ${worldId} aktiv.`);
  }
  return true;
}

function enrichTranscriptIdentity(payload = {}) {
  const discordUserId = String(payload.discordUserId ?? "").trim();
  const mapping = discordUserId ? playerCharacterMappings.get(discordUserId) : null;
  return {
    ...payload,
    playerName: mapping?.playerName ?? String(payload.speakerName ?? "").trim() || null,
    actorId: mapping?.actorId ?? null,
    actorUuid: mapping?.actorUuid ?? null,
    characterName: mapping?.characterName ?? null
  };
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

function handleProtocolBroadcast(message) {
  const sessionId = message?.sessionId ?? activeSessionId ?? null;

  if (message?.type === "player.character.mapping.result") {
    replaceActiveMappings(message.payload);
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
    mappingWorldId: activeMappingWorldId
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
      enrichTranscriptIdentity(payload),
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
    publisher.send("capture.status", {
      state,
      policy: "notice_only",
      rawAudioRetention: "until_successful_transcription",
      noticeShown: false,
      legalAuthorizationConfirmedExternally: false
    }, activeSessionId);
  },
  onParticipants: payload => {
    publisher.send("voice.participants", payload, activeSessionId);
  },
  onStatus: status => {
    if (process.env.DM_COCKPIT_DISCORD_DEBUG === "1") {
      console.log("[discord-voice] Status:", JSON.stringify(status));
    }
  }
});

let attachedVoiceConnection = null;
const receiverWatch = setInterval(() => {
  const connection = discordVoice.connection;

  if (connection && connection !== attachedVoiceConnection && connection.receiver) {
    try {
      if (!activeSessionId) {
        activeSessionId = `voice_${randomUUID()}`;
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
          }
        }, activeSessionId);
      }

      audioReceiver.attach(connection, { botUserId: discordVoice.botUserId });
      attachedVoiceConnection = connection;
      publisher.send("capture.status", {
        state: "listening",
        policy: "notice_only",
        rawAudioRetention: "until_successful_transcription",
        noticeShown: false,
        legalAuthorizationConfirmedExternally: false
      }, activeSessionId);
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
      publisher.send("capture.status", {
        state: "idle",
        policy: "notice_only",
        rawAudioRetention: "until_successful_transcription",
        noticeShown: false,
        legalAuthorizationConfirmedExternally: false
      }, endedSessionId);
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

process.once("SIGINT", () => void stopDiscordVoice());
process.once("SIGTERM", () => void stopDiscordVoice());
