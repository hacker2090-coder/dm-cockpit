import "./server.js";
import { DiscordAudioReceiver } from "./audio-receive.js";
import { DiscordVoiceController } from "./discord-voice.js";

const audioReceiver = new DiscordAudioReceiver({
  onSegment: segment => {
    // 0.3.0 testet nur den echten Discord-Empfang und die Sprechertrennung.
    // Die Opus-Pakete werden hier bewusst weder auf Platte geschrieben noch an
    // einen Cloud-Dienst gesendet. Der spätere STT-Adapter übernimmt diesen Callback.
    console.log(
      `[audio-receive] Bereit für späteres STT: User ${segment.discordUserId}, ${segment.packetCount} Pakete, ${segment.byteLength} Bytes.`
    );
  },
  onStatus: status => {
    if (process.env.DM_COCKPIT_DISCORD_DEBUG === "1") {
      const safeStatus = { ...status, activeSpeakers: status.activeSpeakers };
      console.log("[audio-receive] Status:", JSON.stringify(safeStatus));
    }
  }
});

const discordVoice = new DiscordVoiceController({
  onCaptureState: state => {
    console.log(`[discord-voice] Capture-Status: ${state}`);
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
      audioReceiver.attach(connection, { botUserId: discordVoice.botUserId });
      attachedVoiceConnection = connection;
    } catch (error) {
      console.warn("[audio-receive] Konnte Receiver nicht anbinden:", error?.message ?? error);
    }
    return;
  }

  if (!connection && attachedVoiceConnection) {
    audioReceiver.detach("Discord Voice verlassen");
    attachedVoiceConnection = null;
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

  try {
    await discordVoice.stop();
  } catch (error) {
    console.warn("[discord-voice] Fehler beim Beenden:", error?.message ?? error);
  }
}

process.once("SIGINT", () => void stopDiscordVoice());
process.once("SIGTERM", () => void stopDiscordVoice());
