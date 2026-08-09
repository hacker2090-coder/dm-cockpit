import {
  ActivityType,
  ApplicationCommandOptionType,
  Events,
  MessageFlags
} from "discord.js";

function text(value, fallback = "") {
  return String(value ?? "").trim() || fallback;
}

function errorText(error) {
  return String(error?.message ?? error ?? "Unbekannter Fehler");
}

const COMMAND_DEFINITION = {
  name: "dm",
  description: "DM Cockpit Session-Steuerung",
  options: [
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "status",
      description: "Zeigt Session-, Voice- und Diagnosezustand"
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "start",
      description: "Startet bewusst eine DM-Cockpit-Session"
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "stop",
      description: "Beendet die aktive DM-Cockpit-Session"
    },
    {
      type: ApplicationCommandOptionType.Subcommand,
      name: "recap",
      description: "Fordert das aktuelle bestätigte Recap aus Foundry an"
    }
  ]
};

export class DiscordCommandController {
  constructor({
    voice,
    gmUserId = null,
    onStatusCommand = async () => ({ content: "Status nicht verfügbar." }),
    onStartCommand = async () => ({ content: "Start nicht verfügbar." }),
    onStopCommand = async () => ({ content: "Stop nicht verfügbar." }),
    onRecapCommand = async () => ({ content: "Recap nicht verfügbar." }),
    onDiagnostic = () => {}
  } = {}) {
    this.voice = voice;
    this.gmUserId = text(gmUserId ?? voice?.gmUserId) || null;
    this.onStatusCommand = onStatusCommand;
    this.onStartCommand = onStartCommand;
    this.onStopCommand = onStopCommand;
    this.onRecapCommand = onRecapCommand;
    this.onDiagnostic = onDiagnostic;

    this.client = null;
    this.registered = false;
    this.boundInteraction = interaction => {
      void this.handleInteraction(interaction).catch(error => {
        console.warn("[discord-command] Interaction fehlgeschlagen:", errorText(error));
      });
    };
  }

  snapshot() {
    return {
      registered: this.registered,
      guildId: this.voice?.guildId ?? null,
      gmUserId: this.gmUserId,
      commands: ["/dm status", "/dm start", "/dm stop", "/dm recap"]
    };
  }

  emitDiagnostic(state, detail = null) {
    this.onDiagnostic({
      component: "discord_commands",
      state,
      detail: detail ? String(detail) : null,
      updatedAt: new Date().toISOString()
    });
  }

  async start() {
    const client = this.voice?.client ?? null;
    if (!client || this.voice?.gatewayState !== "ready") return this.snapshot();
    if (this.client === client && this.registered) return this.snapshot();

    this.stop();
    this.client = client;
    client.on(Events.InteractionCreate, this.boundInteraction);

    try {
      const guild = await client.guilds.fetch(this.voice.guildId);
      await guild.commands.set([COMMAND_DEFINITION]);
      this.registered = true;
      this.emitDiagnostic("ready");
    } catch (error) {
      this.registered = false;
      this.emitDiagnostic("error", errorText(error));
      throw error;
    }

    return this.snapshot();
  }

  stop() {
    if (this.client) this.client.off(Events.InteractionCreate, this.boundInteraction);
    this.client = null;
    this.registered = false;
  }

  authorized(interaction) {
    if (!this.gmUserId) return false;
    return String(interaction?.user?.id ?? "") === this.gmUserId;
  }

  async reply(interaction, result) {
    const content = text(result?.content, "DM Cockpit: Keine Antwort verfügbar.").slice(0, 1900);
    const payload = { content, flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload);
    return interaction.reply(payload);
  }

  async handleInteraction(interaction) {
    if (!interaction?.isChatInputCommand?.() || interaction.commandName !== "dm") return false;

    if (!this.authorized(interaction)) {
      await this.reply(interaction, { content: "DM Cockpit: Dieser Befehl ist für den konfigurierten GM reserviert." });
      return true;
    }

    const subcommand = interaction.options.getSubcommand(true);
    const context = {
      discordUserId: String(interaction.user.id),
      guildId: String(interaction.guildId ?? this.voice?.guildId ?? "") || null,
      channelId: String(interaction.channelId ?? "") || null,
      interactionId: String(interaction.id ?? "") || null
    };

    let result;
    switch (subcommand) {
      case "status":
        result = await this.onStatusCommand(context);
        break;
      case "start":
        result = await this.onStartCommand(context);
        break;
      case "stop":
        result = await this.onStopCommand(context);
        break;
      case "recap":
        result = await this.onRecapCommand(context);
        break;
      default:
        result = { content: `DM Cockpit: Unbekannter Unterbefehl '${subcommand}'.` };
        break;
    }

    await this.reply(interaction, result);
    return true;
  }

  setPresence(sessionState, diagnostic = {}) {
    const user = this.voice?.client?.user ?? null;
    if (!user) return false;

    const active = Boolean(sessionState?.active);
    const voiceReady = Boolean(sessionState?.voiceReady);
    const hasError = Boolean(diagnostic?.error);

    let status = "idle";
    let name = "DM Cockpit · bereit";
    if (hasError) {
      status = "dnd";
      name = "DM Cockpit · Diagnose nötig";
    } else if (active && voiceReady) {
      status = "online";
      name = "DM Cockpit · Session aktiv";
    } else if (active) {
      status = "idle";
      name = "DM Cockpit · Session pausiert";
    } else if (voiceReady) {
      status = "online";
      name = "DM Cockpit · Voice bereit";
    }

    user.setPresence({
      status,
      activities: [{ type: ActivityType.Watching, name }]
    });
    return true;
  }
}
