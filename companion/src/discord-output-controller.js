import { PermissionsBitField } from "discord.js";

function text(value) {
  return String(value ?? "").trim();
}

function errorText(error) {
  return String(error?.message ?? error ?? "Unbekannter Fehler");
}

export class DiscordOutputController {
  constructor({ voice } = {}) {
    if (!voice) throw new Error("DiscordOutputController benötigt voice.");
    this.voice = voice;
  }

  async guildContext() {
    if (!this.voice.client || this.voice.gatewayState !== "ready") {
      throw new Error("Discord Gateway ist nicht bereit.");
    }
    if (!this.voice.guildId) throw new Error("Discord Guild-ID fehlt.");
    const guild = await this.voice.client.guilds.fetch(this.voice.guildId);
    const me = guild.members.me ?? await guild.members.fetchMe();
    return { guild, me };
  }

  channelWritable(channel, me) {
    if (!channel?.isTextBased?.() || channel?.isThread?.()) return false;
    if (typeof channel.send !== "function") return false;
    const permissions = channel.permissionsFor?.(me);
    return Boolean(
      permissions?.has(PermissionsBitField.Flags.ViewChannel)
      && permissions?.has(PermissionsBitField.Flags.SendMessages)
    );
  }

  async listWritableTextChannels() {
    const { guild, me } = await this.guildContext();
    const channels = await guild.channels.fetch();
    const result = [...channels.values()]
      .filter(channel => this.channelWritable(channel, me))
      .map(channel => ({
        channelId: String(channel.id),
        name: String(channel.name ?? channel.id),
        parentId: channel.parentId ? String(channel.parentId) : null,
        parentName: channel.parent?.name ? String(channel.parent.name) : null
      }))
      .sort((a, b) => {
        const parent = String(a.parentName ?? "").localeCompare(String(b.parentName ?? ""), "de");
        return parent || a.name.localeCompare(b.name, "de");
      });
    return {
      guildId: String(guild.id),
      observedAt: new Date().toISOString(),
      channels: result
    };
  }

  async sendMessage({ channelId, text: content, kind = "message", requestId = null } = {}) {
    const id = text(channelId);
    const body = text(content);
    if (!id) throw new Error("Discord-Zielkanal fehlt.");
    if (!body) throw new Error("Discord-Nachricht ist leer.");
    if (Array.from(body).length > 2000) throw new Error("Discord-Nachricht überschreitet 2000 Zeichen.");

    const { guild, me } = await this.guildContext();
    const channel = await guild.channels.fetch(id);
    if (!this.channelWritable(channel, me)) {
      throw new Error("Der konfigurierte Discord-Kanal ist nicht beschreibbar oder nicht mehr verfügbar.");
    }

    try {
      const message = await channel.send({
        content: body,
        allowedMentions: { parse: [] }
      });
      return {
        requestId: requestId ? String(requestId) : null,
        kind: String(kind ?? "message"),
        guildId: String(guild.id),
        channelId: String(channel.id),
        channelName: String(channel.name ?? channel.id),
        messageId: String(message.id),
        sentAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Discord-Nachricht konnte nicht gesendet werden: ${errorText(error)}`);
    }
  }
}
