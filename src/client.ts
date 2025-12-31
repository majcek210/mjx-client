import {
  Client as DiscordClient,
  GatewayIntentBits,
  IntentsBitField,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  Collection,
  ClientEvents,
  Events,
} from "discord.js";
import { CollectCommands, CollectEvents } from "./lib/collect.js";
import logger from "./lib/logger.js";

type ClientOptions = {
  name?: string;
  debug?: boolean;
  intents?: IntentsBitField;
};
export interface Command {
  data: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
export interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute: (...args: ClientEvents[K]) => void | Promise<void>;
}

export default class Client {
  private _name: string;
  private _debug: boolean;
  private started = false;
  private _discord: DiscordClient;

  public commands: Collection<string, Command> = new Collection();
  public events: Collection<string, Event> = new Collection();

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
    console.log(this.events)
    if (this._debug) logger.output(`Loaded ${loaded} out of ${total} events.`);
  }

  private ensureMutable(): void {
    if (this.started) {
      throw new Error("Cannot modify client after start");
    }
  }
}
