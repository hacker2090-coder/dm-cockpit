import "./server.js";
import { DiscordVoiceController } from "./discord-voice.js";

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

void discordVoice.start().catch(error => {
  console.error("[discord-voice] Start fehlgeschlagen:", error?.message ?? error);
});

async function stopDiscordVoice() {
  try {
    await discordVoice.stop();
  } catch (error) {
    console.warn("[discord-voice] Fehler beim Beenden:", error?.message ?? error);
  }
}

process.once("SIGINT", () => void stopDiscordVoice());
process.once("SIGTERM", () => void stopDiscordVoice());
