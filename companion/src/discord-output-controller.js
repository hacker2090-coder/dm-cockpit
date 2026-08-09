import { ChannelType, PermissionsBitField } from "discord.js";

const ALLOWED_KINDS = new Set(["capture_notice", "recap"]);
const MESSAGE_LIMIT = 2000;

function clean(value) {
  return String(value ?? "").trim();
}

function errorText(error) {
  return String(error?.message ?? error ?? "Unbekannter Fehler");
}

function channelLabel(channel) {
  const parent = clean(channel?.parent?.name);
  const name = clean(channel?.name) || clean(channel?.id) || "Unbekannt";
  return parent ? `${parent} / #${name}` : `#${name}`;
}

export class DiscordOutputController {
  constructor({ voice, store, onState = () => {}, onResult = () => {} } = {}) {
    if (!voice) throw new TypeError("DiscordOutputController benötigt den Discord-Controller.");
    if (!store) throw new TypeError("DiscordOutputController benötigt den Output-Store.");
    this.voice = voice;
    this.store = store;
    this.onState = onState;
    this.onResult = onResult;
  }

  get guildId() {
    return clean(this.voice?.guildId) || null;
  }

  gatewayReady() {
    return Boolean(this.voice?.client && this.voice?.gatewayState === "ready");
  }

  persistedSelection() {
    return this.guildId ? this.store.selectedChannel(this.guildId) : null;
  }

  async guildContext() {
    if (!this.gatewayReady()) throw new Error("Discord Gateway ist nicht bereit.");
    if (!this.guildId) throw new Error("Discord Guild ist nicht konfiguriert.");
    const guild = await this.voice.client.guilds.fetch(this.guildId);
    const me = guild.members.me ?? await guild.members.fetchMe();
    return { guild, me };
  }

  permissions(channel, me) {
    const permissions = channel?.permissionsFor?.(me) ?? null;
    return {
      canView: Boolean(permissions?.has(PermissionsBitField.Flags.ViewChannel)),
      canSend: Boolean(permissions?.has(PermissionsBitField.Flags.SendMessages))
    };
  }

  supportedChannel(channel) {
    return channel?.type === ChannelType.GuildText || channel?.type === ChannelType.GuildAnnouncement;
  }

  async resolveChannel(channelId) {
    const id = clean(channelId);
    if (!id) throw new Error("Discord-Ausgabe-Textkanal fehlt.");
    const { guild, me } = await this.guildContext();
    const channel = await guild.channels.fetch(id);
    if (!channel || !this.supportedChannel(channel)) {
      throw new Error("Der gewählte Discord-Kanal ist kein unterstützter Server-Textkanal.");
    }
    const permissions = this.permissions(channel, me);
    if (!permissions.canView) throw new Error("Bot darf den gewählten Discord-Kanal nicht sehen.");
    if (!permissions.canSend) throw new Error("Bot darf im gewählten Discord-Kanal keine Nachrichten senden.");
    if (typeof channel.send !== "function") throw new Error("Der gewählte Discord-Kanal unterstützt keinen Nachrichtenversand.");
    return { guild, me, channel, permissions };
  }

  async listChannels() {
    const { guild, me } = await this.guildContext();
    const collection = await guild.channels.fetch();
    const channels = [...collection.values()]
      .filter(Boolean)
      .filter(channel => this.supportedChannel(channel))
      .map(channel => {
        const permissions = this.permissions(channel, me);
        return {
          channelId: String(channel.id),
          name: clean(channel.name) || String(channel.id),
          label: channelLabel(channel),
          parentId: clean(channel.parentId) || null,
          parentName: clean(channel.parent?.name) || null,
          canView: permissions.canView,
          canSend: permissions.canSend,
          selectable: permissions.canView && permissions.canSend
        };
      })
      .filter(channel => channel.selectable)
      .sort((a, b) => a.label.localeCompare(b.label, "de"));

    return {
      guildId: this.guildId,
      channels,
      selectedChannel: this.persistedSelection(),
      observedAt: new Date().toISOString()
    };
  }

  async state() {
    const selection = this.persistedSelection();
    let validation = null;
    if (selection && this.gatewayReady()) {
      try {
        const { channel } = await this.resolveChannel(selection.channelId);
        validation = {
          valid: true,
          channelId: String(channel.id),
          channelName: clean(channel.name) || String(channel.id),
          label: channelLabel(channel),
          error: null
        };
      } catch (error) {
        validation = {
          valid: false,
          channelId: selection.channelId,
          channelName: selection.channelName ?? null,
          label: selection.channelName ? `#${selection.channelName}` : selection.channelId,
          error: errorText(error)
        };
      }
    }

    return {
      guildId: this.guildId,
      gatewayReady: this.gatewayReady(),
      selectedChannel: selection,
      validation,
      updatedAt: new Date().toISOString()
    };
  }

  async emitState() {
    const state = await this.state();
    this.onState(state);
    return state;
  }

  async selectChannel(channelId) {
    const id = clean(channelId);
    if (!this.guildId) throw new Error("Discord Guild ist nicht konfiguriert.");
    if (!id) {
      this.store.clearSelectedChannel(this.guildId);
      return this.emitState();
    }
    const { channel } = await this.resolveChannel(id);
    this.store.setSelectedChannel(this.guildId, channel.id, clean(channel.name) || null);
    return this.emitState();
  }

  captureNoticeText({ profileName = null } = {}) {
    const lines = [
      "**DM Cockpit – Transkription aktiv**",
      "Dieser Voice-Call wird für die laufende Pen-&-Paper-Session live transkribiert.",
      "DM Cockpit speichert Roh-Audio nicht dauerhaft."
    ];
    const profile = clean(profileName);
    if (profile) lines.splice(1, 0, `**Runde:** ${profile}`);
    return lines.join("\n");
  }

  async sendRequestedMessage({ requestId, kind, text = "", sessionId = null, profileName = null } = {}) {
    const normalizedRequestId = clean(requestId);
    const normalizedKind = clean(kind);
    if (!normalizedRequestId) throw new Error("Discord-Ausgabe-Request-ID fehlt.");
    if (!ALLOWED_KINDS.has(normalizedKind)) throw new Error(`Discord-Ausgabeart '${normalizedKind}' ist nicht erlaubt.`);

    const previous = this.store.getPost(normalizedRequestId);
    if (previous?.status === "sent") {
      const duplicate = { ...previous, duplicate: true };
      this.onResult(duplicate);
      return duplicate;
    }

    const selection = this.persistedSelection();
    const content = normalizedKind === "capture_notice"
      ? this.captureNoticeText({ profileName })
      : clean(text);

    if (!selection?.channelId) {
      const result = {
        requestId: normalizedRequestId,
        kind: normalizedKind,
        sessionId: clean(sessionId) || null,
        guildId: this.guildId,
        channelId: null,
        discordMessageId: null,
        status: "failed",
        textLength: content.length,
        error: "Kein Discord-Ausgabe-Textkanal ausgewählt."
      };
      this.store.recordPost(result);
      this.onResult(result);
      return result;
    }

    if (!content) {
      const result = {
        requestId: normalizedRequestId,
        kind: normalizedKind,
        sessionId: clean(sessionId) || null,
        guildId: this.guildId,
        channelId: selection.channelId,
        discordMessageId: null,
        status: "failed",
        textLength: 0,
        error: "Discord-Nachricht ist leer."
      };
      this.store.recordPost(result);
      this.onResult(result);
      return result;
    }

    if (content.length > MESSAGE_LIMIT) {
      const result = {
        requestId: normalizedRequestId,
        kind: normalizedKind,
        sessionId: clean(sessionId) || null,
        guildId: this.guildId,
        channelId: selection.channelId,
        discordMessageId: null,
        status: "failed",
        textLength: content.length,
        error: `Discord-Nachricht überschreitet ${MESSAGE_LIMIT} Zeichen.`
      };
      this.store.recordPost(result);
      this.onResult(result);
      return result;
    }

    try {
      const { channel } = await this.resolveChannel(selection.channelId);
      const message = await channel.send({
        content,
        allowedMentions: { parse: [] }
      });
      const result = {
        requestId: normalizedRequestId,
        kind: normalizedKind,
        sessionId: clean(sessionId) || null,
        guildId: this.guildId,
        channelId: String(channel.id),
        channelName: clean(channel.name) || null,
        discordMessageId: clean(message?.id) || null,
        status: "sent",
        textLength: content.length,
        error: null
      };
      this.store.recordPost(result);
      this.onResult(result);
      return result;
    } catch (error) {
      const result = {
        requestId: normalizedRequestId,
        kind: normalizedKind,
        sessionId: clean(sessionId) || null,
        guildId: this.guildId,
        channelId: selection.channelId,
        channelName: selection.channelName ?? null,
        discordMessageId: null,
        status: "failed",
        textLength: content.length,
        error: errorText(error)
      };
      this.store.recordPost(result);
      this.onResult(result);
      return result;
    }
  }

  captureNoticeShown(sessionId) {
    return this.store.hasSent("capture_notice", sessionId, this.guildId);
  }
}
