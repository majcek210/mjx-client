import {
  Client as DiscordClient,
  GatewayIntentBits,
  IntentsBitField,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
    Collection
} from "discord.js";
import {
    CollectCommands
} from "./lib/collect"
import fs from "fs";
import path from "path";
import logger from "./lib/logger";

type ClientOptions = {
  name?: string;
  debug?: boolean;
  intents?: IntentsBitField;
};
export interface Command {
  data: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export default class Client {
  private _name: string;
  private _debug: boolean;
  private started = false;
  private _discord: DiscordClient;

  public commands: Collection<string, Command> = new Collection();

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

    this._discord.once("ClientReady", () => {
      console.log(`${this._name} logged in as ${this._discord.user?.tag}`);
    });

    this._discord.on("interactionCreate", async (interaction) => {
            if (!interaction.isChatInputCommand()) return;

            const command = this.commands.get(interaction.commandName);
            if (!command) return;

            try { await command.execute(interaction); }
            catch (err) { console.error(err); }
        });

    await this._discord.login(resolvedToken);

    this.started = true;
    return this;
  }

  async registerCommandRoute(dir:string) {
    const { total, loaded, commands } = await CollectCommands(dir);
    commands.forEach((cmd, name) => this.commands.set(name, cmd));
    if (this._debug) logger.output(`Loaded ${loaded} out of ${total} commands.`)
  }

  private ensureMutable(): void {
    if (this.started) {
      throw new Error("Cannot modify client after start");
    }
  }
}
