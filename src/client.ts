import path from "path";
import {
  Client as DiscordClient,
  GatewayIntentBits,
  Collection,
  Events,
  Routes,
  Interaction,
} from "discord.js";
import { collectAll } from "./lib/collector.js";
import { matchCustomId } from "./lib/router.js";
import logger from "./lib/logger.js";
import { REST } from "@discordjs/rest";

import type { Command, Event, Button, Modal, SelectMenu } from "./types.js";

type ClientOptions = {
  name?: string;
  debug?: boolean;
  intents?: GatewayIntentBits[];
};

export * from "discord.js";
export { REST };
export * from "./types.js";

export default class Client {
  private _name: string;
  private _debug: boolean;
  private started = false;
  private _discord: DiscordClient;

  public commands: Collection<string, Command> = new Collection();
  public events: Collection<string, Event> = new Collection();
  public buttons: Collection<string, Button> = new Collection();
  public modals: Collection<string, Modal> = new Collection();
  public selectMenus: Collection<string, SelectMenu> = new Collection();
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

  setClientId(id: string): this {
    this.clientId = id;
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

  async use(appDir: string): Promise<this> {
    const resolvedDir = path.isAbsolute(appDir)
      ? appDir
      : path.join(process.cwd(), appDir);

    const { commands, events, buttons, modals, selectMenus, counts } = await collectAll(resolvedDir);

    commands.forEach((cmd, name) => this.commands.set(name, cmd));
    buttons.forEach((btn, id) => this.buttons.set(id, btn));
    modals.forEach((modal, id) => this.modals.set(id, modal));
    selectMenus.forEach((menu, id) => this.selectMenus.set(id, menu));
    events.forEach((evt, name) => {
      this.events.set(name, evt);
      if (this.started) this.attachEventListener(evt);
    });

    if (this._debug) {
      logger.output(
        `[use] ${counts.commands.loaded}/${counts.commands.total} commands,` +
        ` ${counts.events.loaded}/${counts.events.total} events,` +
        ` ${counts.buttons.loaded}/${counts.buttons.total} buttons,` +
        ` ${counts.modals.loaded}/${counts.modals.total} modals,` +
        ` ${counts.selectMenus.loaded}/${counts.selectMenus.total} select menus`
      );
    }

    return this;
  }

  async start(token?: string): Promise<this> {
    if (this.started) {
      throw new Error("Client already started");
    }

    const resolvedToken = token ?? process.env.TOKEN ?? process.env.DISCORD_TOKEN;
    if (!resolvedToken) {
      throw new Error("No token provided. Set TOKEN or DISCORD_TOKEN env var.");
    }

    this._discord.once(Events.ClientReady, () => {
      logger.output(`${this._name} logged in as ${this._discord.user?.tag}`);
      if (!this.clientId) {
        this.clientId = this._discord.user?.id;
      }
    });

    this._discord.on("interactionCreate", async (interaction: Interaction) => {
      if (interaction.isChatInputCommand()) {
        const command = this.commands.get(interaction.commandName);
        if (!command) return;
        try {
          await command.execute(interaction);
        } catch (err: unknown) {
          logger.error(`Error in command "${interaction.commandName}":`, err);
        }
      } else if (interaction.isButton()) {
        for (const button of this.buttons.values()) {
          const params = matchCustomId(button.customId, interaction.customId);
          if (params !== null) {
            try {
              await button.execute(interaction, params);
            } catch (err: unknown) {
              logger.error(`Error in button "${button.customId}":`, err);
            }
            break;
          }
        }
      } else if (interaction.isModalSubmit()) {
        for (const modal of this.modals.values()) {
          const params = matchCustomId(modal.customId, interaction.customId);
          if (params !== null) {
            try {
              await modal.execute(interaction, params);
            } catch (err: unknown) {
              logger.error(`Error in modal "${modal.customId}":`, err);
            }
            break;
          }
        }
      } else if (interaction.isAnySelectMenu()) {
        for (const menu of this.selectMenus.values()) {
          const params = matchCustomId(menu.customId, interaction.customId);
          if (params !== null) {
            try {
              await menu.execute(interaction, params);
            } catch (err: unknown) {
              logger.error(`Error in select menu "${menu.customId}":`, err);
            }
            break;
          }
        }
      }
    });

    this.events.forEach((event) => this.attachEventListener(event));

    await this._discord.login(resolvedToken);

    this.started = true;
    return this;
  }

  async pushCommands(token?: string, guildId?: string): Promise<void> {
    const resolvedToken = token ?? process.env.TOKEN ?? process.env.DISCORD_TOKEN;
    if (!resolvedToken) {
      logger.error("No token provided. Set TOKEN or DISCORD_TOKEN env var.");
      return;
    }

    if (!this._discord.isReady()) {
      logger.warn("Client isn't ready yet. Waiting...");
      await new Promise<void>((resolve) => {
        this._discord.once(Events.ClientReady, () => resolve());
      });
    }

    if (!this.clientId) {
      logger.error(
        "Client ID wasn't initialized correctly, try adding it manually with setClientId()"
      );
      return;
    }

    const commandsData = this.commands.map((cmd) => cmd.data.toJSON());
    const rest = new REST({ version: "10" }).setToken(resolvedToken);

    try {
      if (guildId) {
        await rest.put(
          Routes.applicationGuildCommands(this.clientId, guildId),
          { body: commandsData }
        );
        if (this._debug)
          logger.output(`Registered ${commandsData.length} commands to guild ${guildId}`);
      } else {
        await rest.put(Routes.applicationCommands(this.clientId), {
          body: commandsData,
        });
        if (this._debug)
          logger.output(`Registered ${commandsData.length} global commands`);
      }
    } catch (err: unknown) {
      logger.error("Failed to register commands:", err);
    }
  }

  private attachEventListener(event: Event): void {
    const handler = (...args: unknown[]): void => {
      try {
        const result = (event.execute as (...a: unknown[]) => void | Promise<void>)(...args);
        if (result instanceof Promise) {
          result.catch((err: unknown) =>
            logger.error(`Async error in event "${String(event.name)}":`, err)
          );
        }
      } catch (err: unknown) {
        logger.error(`Error in event "${String(event.name)}":`, err);
      }
    };

    if (event.once) {
      this._discord.once(String(event.name), handler);
    } else {
      this._discord.on(String(event.name), handler);
    }
  }

  private ensureMutable(): void {
    if (this.started) {
      throw new Error("Cannot modify client after start");
    }
  }
}
