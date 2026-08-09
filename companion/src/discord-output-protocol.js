import { DiscordOutputStore } from "./discord-output-store.js";

const OUTPUT_KINDS = new Set(["capture_notice", "recap"]);

function text(value) {
  return String(value ?? "").trim();
}

function errorText(error) {
  return String(error?.message ?? error ?? "Unbekannter Fehler");
}

export class DiscordOutputProtocol {
  constructor({ dbPath, send, broadcast, sendError, now = () => new Date().toISOString() } = {}) {
    this.store = new DiscordOutputStore(dbPath);
    this.send = send;
    this.broadcast = broadcast;
    this.sendError = sendError;
    this.now = now;
    this.latestChannels = {
      guildId: null,
      observedAt: this.now(),
      channels: [],
      error: null
    };
    this.features = [
      "discord.text.channels.request",
      "discord.text.channels.result",
      "discord.output.config.set",
      "discord.output.config.request",
      "discord.output.config.result",
      "discord.output.send",
      "discord.output.dispatch",
      "discord.output.sent",
      "discord.output.failed"
    ];
  }

  stats() {
    return this.store.stats();
  }

  normalizeChannels(payload = {}) {
    const channels = Array.isArray(payload.channels)
      ? payload.channels.slice(0, 500).map(entry => ({
          channelId: text(entry?.channelId),
          name: text(entry?.name) || text(entry?.channelId) || "Unbekannt",
          parentId: text(entry?.parentId) || null,
          parentName: text(entry?.parentName) || null
        })).filter(entry => entry.channelId)
      : [];
    return {
      guildId: text(payload.guildId) || null,
      observedAt: text(payload.observedAt) || this.now(),
      channels,
      error: text(payload.error) || null
    };
  }

  configResult(worldId) {
    return this.store.configOrDefault(worldId);
  }

  channelKnownWritable(guildId, channelId) {
    const id = text(channelId);
    if (!id) return true;
    if (!this.latestChannels.channels.length) return true;
    if (guildId && this.latestChannels.guildId && guildId !== this.latestChannels.guildId) return false;
    return this.latestChannels.channels.some(channel => channel.channelId === id);
  }

  handle({ ws, message, payload = {}, sessionId = null, receivedAt = this.now() } = {}) {
    switch (message?.type) {
      case "discord.text.channels.request":
        this.broadcast("discord.text.channels.request", {}, sessionId);
        return true;

      case "discord.text.channels.result":
        this.latestChannels = this.normalizeChannels(payload);
        this.broadcast("discord.text.channels.result", this.latestChannels, sessionId);
        return true;

      case "discord.output.config.set": {
        const worldId = text(payload.worldId);
        const guildId = text(payload.guildId) || this.latestChannels.guildId || null;
        const channelId = text(payload.channelId) || null;
        if (!worldId) {
          this.sendError(ws, "worldId fehlt für Discord-Ausgabe.", "missing_world_id", sessionId);
          return true;
        }
        if (!this.channelKnownWritable(guildId, channelId)) {
          this.sendError(ws, "Der gewählte Discord-Kanal ist nicht als beschreibbar bekannt.", "discord_output_channel_not_writable", sessionId);
          return true;
        }
        const config = this.store.setConfig({
          worldId,
          guildId,
          channelId,
          noticeText: payload.noticeText
        }, receivedAt);
        if (!config) {
          this.sendError(ws, "Discord-Ausgabekonfiguration ist ungültig.", "invalid_discord_output_config", sessionId);
          return true;
        }
        this.broadcast("discord.output.config.result", config, sessionId);
        return true;
      }

      case "discord.output.config.request": {
        const worldId = text(payload.worldId);
        if (!worldId) {
          this.sendError(ws, "worldId fehlt für Discord-Ausgabe.", "missing_world_id", sessionId);
          return true;
        }
        this.send(ws, "discord.output.config.result", this.configResult(worldId), sessionId);
        return true;
      }

      case "discord.output.send": {
        const worldId = text(payload.worldId);
        const kind = text(payload.kind).toLowerCase();
        const requestId = text(payload.requestId) || text(message?.id);
        if (!worldId || !OUTPUT_KINDS.has(kind)) {
          this.send(ws, "discord.output.failed", {
            requestId,
            kind: kind || "unknown",
            channelId: null,
            error: "Ungültiger Discord-Ausgabeauftrag.",
            failedAt: receivedAt
          }, sessionId);
          return true;
        }
        const config = this.configResult(worldId);
        if (!config?.channelId) {
          this.send(ws, "discord.output.failed", {
            requestId,
            kind,
            channelId: null,
            error: "Kein Discord-Zielkanal für diese Foundry-Welt ausgewählt.",
            failedAt: receivedAt
          }, sessionId);
          return true;
        }
        const body = text(payload.text) || (kind === "capture_notice" ? text(config.noticeText) : "");
        if (!body || Array.from(body).length > 2000) {
          this.send(ws, "discord.output.failed", {
            requestId,
            kind,
            channelId: config.channelId,
            error: body ? "Discord-Nachricht überschreitet 2000 Zeichen." : "Discord-Nachricht ist leer.",
            failedAt: receivedAt
          }, sessionId);
          return true;
        }
        this.broadcast("discord.output.dispatch", {
          requestId,
          worldId,
          guildId: config.guildId,
          channelId: config.channelId,
          kind,
          text: body
        }, sessionId);
        return true;
      }

      case "discord.output.sent":
        this.broadcast("discord.output.sent", {
          ...payload,
          sentAt: text(payload.sentAt) || receivedAt
        }, sessionId);
        return true;

      case "discord.output.failed":
        this.broadcast("discord.output.failed", {
          ...payload,
          error: text(payload.error) || "Unbekannter Discord-Ausgabefehler.",
          failedAt: text(payload.failedAt) || receivedAt
        }, sessionId);
        return true;

      default:
        return false;
    }
  }

  close() {
    try {
      this.store.close();
    } catch (error) {
      console.warn(`[discord-output] Store konnte nicht sauber geschlossen werden: ${errorText(error)}`);
    }
  }
}
