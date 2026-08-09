import { randomUUID } from "node:crypto";
import "./server.js";
import { DiscordAudioReceiver } from "./audio-receive.js";
import { CompanionPublisher } from "./companion-publisher.js";
import { DiscordVoiceController } from "./discord-voice.js";
import { SttService } from "./stt-service.js";

const publisher = new CompanionPublisher({
  onStatus: status => {
    if (process.env.DM_COCKPIT_DISCORD_DEBUG === "1") {
      console.log("[publisher] Status:", JSON.stringify(status));
    }
  }
});
publisher.start();

let activeSessionId = null;

const stt = new SttService({
  onTranscript: async (payload, context) => {
    publisher.send("transcript.segment", payload, context.sessionId ?? activeSessionId);
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
      const identity = {
        discordUserId: String(discordUserId),
        displayName: user.globalName ?? user.username ?? String(discordUserId),
        globalName: user.globalName ?? null,
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
            stt: stt.snapshot().provider
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
      publisher.send("capture.status", {
        state: "idle",
        policy: "notice_only",
        rawAudioRetention: "until_successful_transcription",
        noticeShown: false,
        legalAuthorizationConfirmedExternally: false
      }, activeSessionId);
      publisher.send("session.ended", {
        sessionId: activeSessionId,
        endedAt: new Date().toISOString()
      }, activeSessionId);
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
    publisher.send("session.ended", {
      sessionId: activeSessionId,
      endedAt: new Date().toISOString()
    }, activeSessionId);
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
