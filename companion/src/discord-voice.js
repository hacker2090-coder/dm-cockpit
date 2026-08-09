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
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_ATTEMPTS = 5;

function env(name) {
  return String(process.env[name] ?? "").trim();
}

function errorText(error) {
  return String(error?.message ?? error ?? "Unbekannter Fehler");
}

export class DiscordVoiceController {
  constructor({
    onCaptureState = () => {},
    onStatus = () => {},
    onParticipants = () => {}
  } = {}) {
    this.token = env("DISCORD_BOT_TOKEN");
    this.guildId = env("DISCORD_GUILD_ID");
    this.gmUserId = env("DISCORD_GM_USER_ID");
    this.debug = env("DM_COCKPIT_DISCORD_DEBUG") === "1";

    this.onCaptureState = onCaptureState;
    this.onStatus = onStatus;
    this.onParticipants = onParticipants;

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
    this.participantRefreshTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.lastReconnectAt = null;
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
      audioCaptureImplemented: true,
      participantTrackingImplemented: true,
      nicknameManagementImplemented: true,
      reconnect: {
        attempts: this.reconnectAttempts,
        maxAttempts: RECONNECT_MAX_ATTEMPTS,
        scheduled: Boolean(this.reconnectTimer),
        lastReconnectAt: this.lastReconnectAt
      },
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

  clearReconnectTimer() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  resetReconnectState() {
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
  }

  scheduleReconnect(reason = "voice_disconnected") {
    if (this.reconnectTimer || !this.channelId || !this.client || this.gatewayState !== "ready") return;
    if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
      this.setError(new Error(`Voice-Reconnect nach ${RECONNECT_MAX_ATTEMPTS} Versuchen fehlgeschlagen.`));
      return;
    }

    const delay = Math.min(RECONNECT_BASE_MS * (2 ** this.reconnectAttempts), 8_000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.reconnectCurrentVoice(reason);
    }, delay);
    this.reconnectTimer.unref?.();
    this.emitStatus();
  }

  async reconnectCurrentVoice(reason = "voice_disconnected") {
    const channelId = this.channelId;
    if (!channelId || !this.client || this.gatewayState !== "ready") return false;

    this.reconnectAttempts += 1;
    this.lastReconnectAt = new Date().toISOString();
    this.voiceState = "reconnecting";
    this.lastError = null;
    this.emitStatus();
    this.setCaptureState("joining");

    try {
      const guild = await this.client.guilds.fetch(this.guildId);
      const channel = await guild.channels.fetch(channelId);
      if (!channel?.isVoiceBased?.()) throw new Error(`Voice-Reconnect-Ziel ${channelId} ist kein Voice-Channel.`);

      const me = guild.members.me ?? await guild.members.fetchMe();
      const permissions = channel.permissionsFor(me);
      if (!permissions?.has(PermissionsBitField.Flags.ViewChannel)) throw new Error(`Bot darf den Voice-Channel '${channel.name}' nicht sehen.`);
      if (!permissions.has(PermissionsBitField.Flags.Connect)) throw new Error(`Bot darf dem Voice-Channel '${channel.name}' nicht beitreten.`);

      let connection = this.connection ?? getVoiceConnection(this.guildId);
      if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
        connection = joinVoiceChannel({
          channelId,
          guildId: this.guildId,
          adapterCreator: guild.voiceAdapterCreator,
          selfDeaf: false,
          selfMute: true,
          daveEncryption: true,
          debug: this.debug
        });
      } else {
        connection.rejoin({
          channelId,
          selfDeaf: false,
          selfMute: true
        });
      }

      this.connection = connection;
      this.bindConnection(connection);
      await entersState(connection, VoiceConnectionStatus.Ready, JOIN_TIMEOUT_MS);
      this.voiceState = "ready";
      this.lastError = null;
      this.resetReconnectState();
      console.log(`[discord-voice] Voice-Reconnect erfolgreich (${reason}) → '${channel.name}' (${channelId}).`);
      this.emitStatus();
      await this.emitParticipants(channelId);
      this.setCaptureState("paused");
      return true;
    } catch (error) {
      this.lastError = errorText(error);
      this.voiceState = "disconnected";
      console.warn(`[discord-voice] Voice-Reconnect Versuch ${this.reconnectAttempts} fehlgeschlagen: ${this.lastError}`);
      this.emitStatus();
      this.setCaptureState("idle");
      this.scheduleReconnect(reason);
      return false;
    }
  }

  async participantSnapshot(channelId = this.channelId) {
    const normalizedChannelId = String(channelId ?? "").trim() || null;
    if (!this.client || !this.guildId || !normalizedChannelId) {
      return {
        guildId: this.guildId || null,
        channelId: normalizedChannelId,
        observedAt: new Date().toISOString(),
        participants: []
      };
    }

    const guild = await this.client.guilds.fetch(this.guildId);
    const participants = [...guild.voiceStates.cache.values()]
      .filter(state => state.channelId === normalizedChannelId)
      .map(state => {
        const member = state.member ?? null;
        const user = member?.user ?? this.client?.users?.cache?.get(state.id) ?? null;
        const displayName = user?.globalName
          ?? user?.username
          ?? member?.displayName
          ?? String(state.id);
        return {
          discordUserId: String(state.id),
          displayName: String(displayName),
          globalName: user?.globalName ?? null,
          serverNickname: member?.nickname ?? null,
          isBot: Boolean(user?.bot),
          channelId: normalizedChannelId
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));

    return {
      guildId: this.guildId,
      channelId: normalizedChannelId,
      observedAt: new Date().toISOString(),
      participants
    };
  }

  async memberContext(discordUserId) {
    const id = String(discordUserId ?? "").trim();
    if (!this.client || this.gatewayState !== "ready") throw new Error("Discord Gateway ist nicht bereit.");
    if (!this.guildId || !id) throw new Error("Guild- oder Discord-User-ID fehlt.");

    const guild = await this.client.guilds.fetch(this.guildId);
    const voiceMember = guild.voiceStates.cache.get(id)?.member ?? null;
    const member = voiceMember ?? guild.members.cache.get(id) ?? await guild.members.fetch(id);
    const me = guild.members.me ?? await guild.members.fetchMe();
    return { guild, member, me };
  }

  async nicknameMemberState(discordUserId) {
    const id = String(discordUserId ?? "").trim();
    const { member, me } = await this.memberContext(id);
    return {
      guildId: this.guildId,
      discordUserId: id,
      displayName: member.user?.globalName ?? member.user?.username ?? member.displayName ?? id,
      currentNickname: member.nickname ?? null,
      isBot: Boolean(member.user?.bot),
      manageable: Boolean(member.manageable),
      botHasManageNicknames: Boolean(me.permissions?.has(PermissionsBitField.Flags.ManageNicknames))
    };
  }

  async setServerNickname(discordUserId, nickname, reason = "DM Cockpit Session-Identität") {
    const id = String(discordUserId ?? "").trim();
    const { member, me } = await this.memberContext(id);
    if (!me.permissions?.has(PermissionsBitField.Flags.ManageNicknames)) {
      throw new Error("Bot hat keine Discord-Berechtigung 'Manage Nicknames'.");
    }
    if (!member.manageable) {
      throw new Error("Discord-Mitglied kann wegen Rollen-/Eigentümer-Hierarchie nicht umbenannt werden.");
    }

    const normalizedNickname = nickname === null || nickname === undefined || String(nickname).trim() === ""
      ? null
      : String(nickname);
    await member.setNickname(normalizedNickname, String(reason ?? "DM Cockpit Session-Identität").slice(0, 512));
    this.queueParticipantRefresh();
    return this.nicknameMemberState(id);
  }

  async emitParticipants(channelId = this.channelId) {
    const payload = await this.participantSnapshot(channelId);
    this.onParticipants(payload);
    return payload;
  }

  queueParticipantRefresh(delayMs = 75) {
    if (this.participantRefreshTimer) clearTimeout(this.participantRefreshTimer);
    this.participantRefreshTimer = setTimeout(() => {
      this.participantRefreshTimer = null;
      void this.emitParticipants().catch(error => {
        console.warn("[discord-voice] Voice-Teilnehmer konnten nicht aktualisiert werden:", errorText(error));
      });
    }, delayMs);
    this.participantRefreshTimer.unref?.();
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

    client.on(Events.VoiceStateUpdate, (oldState, newState) => {
      if (newState.guild.id !== this.guildId) return;

      if (newState.id === this.gmUserId) {
        this.queueFollow(newState.channelId ?? null);
        return;
      }

      if (this.channelId && (oldState.channelId === this.channelId || newState.channelId === this.channelId)) {
        this.queueParticipantRefresh();
      }
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

    this.clearReconnectTimer();
    const existing = getVoiceConnection(this.guildId);
    let connection = existing;

    this.voiceState = "joining";
    this.channelId = channelId;
    this.lastError = null;
    this.emitStatus();
    this.setCaptureState("joining");

    if (connection && connection.state.status !== VoiceConnectionStatus.Destroyed) {
      if (connection.joinConfig.channelId !== channelId || connection.state.status !== VoiceConnectionStatus.Ready) {
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
    this.resetReconnectState();
    console.log(`[discord-voice] Folge GM in '${channel.name}' (${channelId}); DAVE aktiviert.`);
    this.emitStatus();
    await this.emitParticipants(channelId);

    this.setCaptureState("paused");
  }

  bindConnection(connection) {
    if (this.boundConnections.has(connection)) return;
    this.boundConnections.add(connection);

    connection.on("error", error => {
      console.warn("[discord-voice] Voice-Verbindungsfehler:", errorText(error));
      this.lastError = errorText(error);
      this.emitStatus();
      this.scheduleReconnect("connection_error");
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
          this.voiceState = this.reconnectAttempts ? "reconnecting" : "joining";
          this.setCaptureState("joining");
          break;
        case VoiceConnectionStatus.Ready:
          this.voiceState = "ready";
          this.lastError = null;
          this.resetReconnectState();
          this.setCaptureState("paused");
          this.queueParticipantRefresh();
          break;
        case VoiceConnectionStatus.Disconnected:
          this.voiceState = "disconnected";
          this.setCaptureState("idle");
          this.scheduleReconnect("voice_disconnected");
          break;
        case VoiceConnectionStatus.Destroyed:
          this.voiceState = "disconnected";
          this.connection = null;
          this.setCaptureState("idle");
          if (this.channelId) this.scheduleReconnect("voice_destroyed");
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
    this.clearReconnectTimer();
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
    if (this.participantRefreshTimer) clearTimeout(this.participantRefreshTimer);
    this.participantRefreshTimer = null;
    this.channelId = null;
    this.voiceState = "idle";
    this.lastDaveTransitionId = null;
    this.reconnectAttempts = 0;
    this.emitStatus();
    this.setCaptureState("idle");
    this.onParticipants({
      guildId: this.guildId || null,
      channelId: null,
      observedAt: new Date().toISOString(),
      participants: []
    });
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
