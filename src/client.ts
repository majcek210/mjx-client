import {
  Client as DiscordClient,
  GatewayIntentBits,
  IntentsBitField,
  Collection,
  Events,
} from "discord.js";
import { CollectButtons, CollectCommands, CollectEvents } from "./lib/collector.js";
import logger from "./lib/logger.js";
import { REST } from "@discordjs/rest";
import { Routes } from "discord.js";
import { Command, Event, Button} from "./types.js";

type ClientOptions = {
  name?: string;
  debug?: boolean;
  intents?: IntentsBitField;
};

export * from "./types.js";

export default class Client {
  private _name: string;
  private _debug: boolean;
  private started = false;
  private _discord: DiscordClient;

  public commands: Collection<string, Command> = new Collection();
  public events: Collection<string, Event> = new Collection();
  public buttons: Collection<string, Button> = new Collection();
  public clientId: string | undefined = undefined;

  constructor(options: ClientOptions = {}) {
    this._name = options.name ?? "Unnamed Client";
    this._debug = options.debug ?? false;

    this._discord = new DiscordClient({
      intents: options.intents ?? [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });
  }

  setName(name: string): this {
    this.ensureMutable();
    if (name.length < 3) {
      throw new Error("Client name must be at least 3 characters");
    }
    this._name = name;
    return this;
  }

  setDebug(enabled: boolean): this {
    this.ensureMutable();
    this._debug = enabled;
    return this;
  }

  get name(): string {
    return this._name;
  }

  get debug(): boolean {
    return this._debug;
  }

  get discord(): DiscordClient {
    return this._discord;
  }

  async start(token?: string): Promise<this> {
    if (this.started) {
      throw new Error("Client already started");
    }

    const resolvedToken = token ?? process.env.DISCORD_TOKEN;
    if (!resolvedToken) {
      throw new Error("DISCORD_TOKEN is missing");
    }

    this._discord.once(Events.ClientReady, () => {
      logger.output(`${this._name} logged in as ${this._discord.user?.tag}`);
      if (!this.clientId) {
        this.clientId = this._discord?.user?.id;
      }
    });

    this._discord.on("interactionCreate", async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (err: any) {
        logger.error(err);
      }
    });

    await this._discord.login(resolvedToken);

    this.events.forEach((event) => {
      if (event.once) {
        try {
          this._discord.once(event.name, (...args) => event.execute(...args));
        } catch (err: any) {
          logger.error(err);
        }
      } else {
        try {
          this._discord.on(event.name, (...args) => event.execute(...args));
        } catch (err: any) {
          logger.error(err);
        }
      }
    });

    this.started = true;
    return this;
  }

  async registerCommandsRoute(dir: string) {
    const { total, loaded, commands } = await CollectCommands(dir);
    commands.forEach((cmd, name) => this.commands.set(name, cmd));
    if (this._debug)
      logger.output(`Loaded ${loaded} out of ${total} commands.`);
  }

  async registerEventsRoute(dir: string) {
    const { total, loaded, events } = await CollectEvents(dir);
    events.forEach((event, name) => this.events.set(name, event));
    if (this._debug) logger.output(`Loaded ${loaded} out of ${total} events.`);
  }
  async registerButtonsRoute(dir: string) {
    const { total, loaded, buttons } = await CollectButtons(dir);
    buttons.forEach((button, name) => this.buttons.set(name, button));
    if (this._debug) logger.output(`Loaded ${loaded} out of ${total} buttons.`);
  }


  async pushCommands(token?: string, guildId?: string) {
    const resolvedToken = token ?? process.env.DISCORD_TOKEN;
    if (!resolvedToken) {
      logger.error("DISCORD_TOKEN is missing");
      return;
    }

    if (!this._discord.isReady()) {
      logger.warn("Client isn't ready yet. Waiting...")
      await new Promise<void>((resolve) => {
        this._discord.once(Events.ClientReady, () => resolve());
      });
    }

    const commandsData = this.commands.map((cmd) => cmd.data.toJSON());
    const rest = new REST({ version: "10" }).setToken(resolvedToken);

    if (!this.clientId) {
      logger.error(
        "Client ID wasnt intalized correctly, try adding it manualy with setClientId"
      );
      return;
    }

    try {
      if (guildId) {
        await rest.put(
          Routes.applicationGuildCommands(this.clientId, guildId),
          { body: commandsData }
        );
        if (this._debug)
          logger.output(
            `Registered ${commandsData.length} commands to guild ${guildId}`
          );
      } else {
        await rest.put(Routes.applicationCommands(this.clientId), {
          body: commandsData,
        });
        if (this._debug)
          logger.output(`Registered ${commandsData.length} global commands`);
      }
    } catch (err: any) {
      logger.error("Failed to register commands:", err);
    }
  }

  private ensureMutable(): void {
    if (this.started) {
      throw new Error("Cannot modify client after start");
    }
  }
}
