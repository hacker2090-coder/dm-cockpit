import {
  Client,
  Events,
  GatewayIntentBits,
  PermissionsBitField
} from "discord.js";
import {
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus
} from "@discordjs/voice";

const JOIN_TIMEOUT_MS = 20_000;

function env(name) {
  return String(process.env[name] ?? "").trim();
}

function errorText(error) {
  return String(error?.message ?? error ?? "Unbekannter Fehler");
}

export class DiscordVoiceController {
  constructor({ onCaptureState = () => {}, onStatus = () => {} } = {}) {
    this.token = env("DISCORD_BOT_TOKEN");
    this.guildId = env("DISCORD_GUILD_ID");
    this.gmUserId = env("DISCORD_GM_USER_ID");
    this.debug = env("DM_COCKPIT_DISCORD_DEBUG") === "1";

    this.onCaptureState = onCaptureState;
    this.onStatus = onStatus;

    this.client = null;
    this.connection = null;
    this.started = false;
    this.gatewayState = "disabled";
    this.voiceState = "idle";
    this.channelId = null;
    this.botUserId = null;
    this.lastError = null;
    this.lastDaveTransitionId = null;
    this.boundConnections = new WeakSet();
    this.followQueue = Promise.resolve();
  }

  missingConfiguration() {
    const missing = [];
    if (!this.token) missing.push("DISCORD_BOT_TOKEN");
    if (!this.guildId) missing.push("DISCORD_GUILD_ID");
    if (!this.gmUserId) missing.push("DISCORD_GM_USER_ID");
    return missing;
  }

  snapshot() {
    const missing = this.missingConfiguration();
    return {
      configured: missing.length === 0,
      missingConfiguration: missing,
      gatewayState: this.gatewayState,
      voiceState: this.voiceState,
      guildId: this.guildId || null,
      gmUserId: this.gmUserId || null,
      botUserId: this.botUserId,
      channelId: this.channelId,
      followMode: "configured-gm",
      selfDeaf: false,
      selfMute: true,
      audioCaptureImplemented: false,
      dave: {
        enabled: true,
        library: "@discordjs/voice",
        lastTransitionId: this.lastDaveTransitionId
      },
      lastError: this.lastError
    };
  }

  emitStatus() {
    this.onStatus(this.snapshot());
  }

  setCaptureState(state) {
    this.onCaptureState(state);
  }

  setError(error) {
    const message = errorText(error);
    this.lastError = message;
    this.voiceState = "error";
    console.warn(`[discord-voice] Fehler: ${message}`);
    if (this.debug && error?.stack) console.warn(error.stack);
    this.emitStatus();
    this.setCaptureState("error");
  }

  async start() {
    if (this.started) return this.snapshot();
    this.started = true;

    const missing = this.missingConfiguration();
    if (missing.length) {
      this.gatewayState = "disabled";
      console.log(`[discord-voice] Deaktiviert. Lokal konfigurieren: ${missing.join(", ")}`);
      this.emitStatus();
      return this.snapshot();
    }

    this.gatewayState = "connecting";
    this.emitStatus();

    const client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
    });
    this.client = client;

    client.once(Events.ClientReady, readyClient => {
      this.gatewayState = "ready";
      this.botUserId = readyClient.user.id;
      this.lastError = null;
      console.log(`[discord-voice] Bot bereit als ${readyClient.user.tag}.`);
      this.emitStatus();
      this.queueFollowFromCurrentState();
    });

    client.on(Events.VoiceStateUpdate, (_oldState, newState) => {
      if (newState.guild.id !== this.guildId || newState.id !== this.gmUserId) return;
      this.queueFollow(newState.channelId ?? null);
    });

    client.on(Events.Error, error => {
      this.gatewayState = "error";
      this.lastError = errorText(error);
      console.warn("[discord-voice] Discord Gateway Fehler:", this.lastError);
      this.emitStatus();
    });

    try {
      await client.login(this.token);
    } catch (error) {
      this.gatewayState = "error";
      this.lastError = errorText(error);
      console.error("[discord-voice] Login fehlgeschlagen:", this.lastError);
      this.emitStatus();
    }

    return this.snapshot();
  }

  queueFollowFromCurrentState() {
    this.followQueue = this.followQueue
      .then(async () => {
        const guild = await this.client?.guilds.fetch(this.guildId);
        const gmVoiceState = guild?.voiceStates.cache.get(this.gmUserId);
        await this.followChannel(gmVoiceState?.channelId ?? null);
      })
      .catch(error => this.setError(error));
  }

  queueFollow(channelId) {
    this.followQueue = this.followQueue
      .then(() => this.followChannel(channelId))
      .catch(error => this.setError(error));
  }

  async followChannel(channelId) {
    if (!this.client || this.gatewayState !== "ready") return;

    if (!channelId) {
      this.leaveVoice("GM hat Voice verlassen");
      return;
    }

    const guild = await this.client.guilds.fetch(this.guildId);
    const channel = await guild.channels.fetch(channelId);
    if (!channel?.isVoiceBased?.()) {
      throw new Error(`GM-Channel ${channelId} ist kein Voice-Channel.`);
    }

    const me = guild.members.me ?? await guild.members.fetchMe();
    const permissions = channel.permissionsFor(me);
    if (!permissions?.has(PermissionsBitField.Flags.ViewChannel)) {
      throw new Error(`Bot darf den Voice-Channel '${channel.name}' nicht sehen.`);
    }
    if (!permissions.has(PermissionsBitField.Flags.Connect)) {
      throw new Error(`Bot darf dem Voice-Channel '${channel.name}' nicht beitreten.`);
    }

    const existing = getVoiceConnection(this.guildId);
    let connection = existing;

    this.voiceState = "joining";
    this.channelId = channelId;
    this.lastError = null;
    this.emitStatus();
    this.setCaptureState("joining");

    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
      if (connection.joinConfig.channelId !== channelId) {
        connection.rejoin({
          channelId,
          selfDeaf: false,
          selfMute: true
        });
      }
    } else {
      connection = joinVoiceChannel({
        channelId,
        guildId: this.guildId,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: true,
        daveEncryption: true,
        debug: this.debug
      });
    }

    this.connection = connection;
    this.bindConnection(connection);

    await entersState(connection, VoiceConnectionStatus.Ready, JOIN_TIMEOUT_MS);
    this.voiceState = "ready";
    this.channelId = channelId;
    this.lastError = null;
    console.log(`[discord-voice] Folge GM in '${channel.name}' (${channelId}); DAVE aktiviert.`);
    this.emitStatus();

    // Audio-Capture kommt im nächsten Schritt. Bis dahin ist Voice verbunden, aber Aufnahme pausiert.
    this.setCaptureState("paused");
  }

  bindConnection(connection) {
    if (this.boundConnections.has(connection)) return;
    this.boundConnections.add(connection);

    connection.on("error", error => {
      console.warn("[discord-voice] Voice-Verbindungsfehler:", errorText(error));
      this.setError(error);
    });

    connection.on("transitioned", transitionId => {
      this.lastDaveTransitionId = transitionId;
      this.emitStatus();
      if (this.debug) console.log(`[discord-voice] DAVE Transition ${transitionId}.`);
    });

    connection.on("stateChange", (_oldState, newState) => {
      switch (newState.status) {
        case VoiceConnectionStatus.Signalling:
        case VoiceConnectionStatus.Connecting:
          this.voiceState = "joining";
          this.setCaptureState("joining");
          break;
        case VoiceConnectionStatus.Ready:
          this.voiceState = "ready";
          this.setCaptureState("paused");
          break;
        case VoiceConnectionStatus.Disconnected:
          this.voiceState = "disconnected";
          this.setCaptureState("idle");
          break;
        case VoiceConnectionStatus.Destroyed:
          this.voiceState = "idle";
          this.channelId = null;
          this.setCaptureState("idle");
          break;
        default:
          break;
      }
      this.emitStatus();
    });

    if (this.debug) {
      connection.on("debug", message => console.debug(`[discord-voice] ${message}`));
    }
  }

  leaveVoice(reason = "Voice verlassen") {
    const connection = this.connection ?? getVoiceConnection(this.guildId);
    this.connection = null;

    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
      try {
        connection.destroy();
      } catch (error) {
        console.warn("[discord-voice] Voice konnte nicht sauber beendet werden:", errorText(error));
      }
    }

    if (this.channelId) console.log(`[discord-voice] ${reason}.`);
    this.channelId = null;
    this.voiceState = "idle";
    this.lastDaveTransitionId = null;
    this.emitStatus();
    this.setCaptureState("idle");
  }

  async stop() {
    this.leaveVoice("Companion wird beendet");

    const client = this.client;
    this.client = null;
    if (client) client.destroy();

    this.gatewayState = this.missingConfiguration().length ? "disabled" : "stopped";
    this.botUserId = null;
    this.emitStatus();
  }
}
