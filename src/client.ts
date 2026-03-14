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

import type { Command, Event, Button, Modal, SelectMenu, ErrorHandler } from "./types.js";

/** Options passed to the {@link Client} constructor. */
type ClientOptions = {
  /** Display name for the bot. Must be at least 3 characters. Defaults to `"Unnamed Client"`. */
  name?: string;
  /** Enable verbose debug logging. Defaults to `false`. */
  debug?: boolean;
  /** Gateway intents to request. Defaults to `[Guilds, GuildMessages, MessageContent]`. */
  intents?: GatewayIntentBits[];
};

export * from "discord.js";
export { REST };
export * from "./types.js";

/**
 * The main mjx-client bot client.
 * Wraps discord.js `Client` with file-based routing for commands, events,
 * buttons, modals, and select menus.
 *
 * @example
 * ```ts
 * import Client from "mjx-client";
 *
 * const client = new Client({ debug: true })
 *   .setName("My Bot")
 *   .setLoginTimeout(15_000);
 *
 * await client.use("./dist/app");
 * await client.start(process.env.TOKEN);
 * await client.pushCommands();
 * ```
 */
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

  private errorHandler: ErrorHandler | undefined = undefined;
  private _loginTimeout: number | undefined = undefined;

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

  /**
   * Set the display name of this client. Must be called before {@link start}.
   * @param name - Display name (min 3 characters).
   * @throws If called after `start()` or if `name` is shorter than 3 characters.
   */
  setName(name: string): this {
    this.ensureMutable();
    if (name.length < 3) {
      throw new Error("Client name must be at least 3 characters");
    }
    this._name = name;
    return this;
  }

  /**
   * Toggle debug logging. Must be called before {@link start}.
   * @throws If called after `start()`.
   */
  setDebug(enabled: boolean): this {
    this.ensureMutable();
    this._debug = enabled;
    return this;
  }

  /**
   * Manually set the bot's Discord application ID.
   * Not required if you call {@link start} first — the ID is resolved automatically on login.
   * Needed when calling {@link pushCommands} before {@link start}.
   * @throws If called after `start()`.
   */
  setClientId(id: string): this {
    this.ensureMutable();
    this.clientId = id;
    return this;
  }

  /**
   * Set a timeout (in milliseconds) for the Discord login call inside {@link start}.
   * If the login does not resolve within this time, `start()` rejects.
   * Not set by default (no timeout).
   * @param ms - Timeout in milliseconds.
   * @throws If called after `start()`.
   */
  setLoginTimeout(ms: number): this {
    this.ensureMutable();
    this._loginTimeout = ms;
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

  /**
   * Load handlers from an app directory.
   * Scans for `commands/`, `events/`, `buttons/`, `modals/`, `select-menus/` subdirectories
   * and an optional `error.ts` file. Can be called multiple times to merge handlers from
   * different directories. Safe to call after {@link start}.
   *
   * @param appDir - Path to the compiled app directory (absolute or relative to `process.cwd()`).
   * @returns `this` for chaining.
   *
   * @example
   * ```ts
   * await client.use("./dist/app");
   * ```
   */
  async use(appDir: string): Promise<this> {
    const resolvedDir = path.isAbsolute(appDir)
      ? appDir
      : path.join(process.cwd(), appDir);

    const { commands, events, buttons, modals, selectMenus, errorHandler, counts } = await collectAll(resolvedDir);

    commands.forEach((cmd, name) => this.commands.set(name, cmd));
    buttons.forEach((btn, id) => this.buttons.set(id, btn));
    modals.forEach((modal, id) => this.modals.set(id, modal));
    selectMenus.forEach((menu, id) => this.selectMenus.set(id, menu));
    if (errorHandler) this.errorHandler = errorHandler;
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

  /**
   * Log in to Discord and begin handling interactions and events.
   * Call {@link use} first to load your handlers.
   *
   * @param token - Bot token. Falls back to `TOKEN` then `DISCORD_TOKEN` env vars.
   * @returns `this` for chaining.
   * @throws If already started, if no token is found, or if login times out (when
   *   {@link setLoginTimeout} is set).
   */
  async start(token?: string): Promise<this> {
    if (this.started) {
      throw new Error("Client already started");
    }

    const resolvedToken = token ?? process.env.TOKEN ?? process.env.DISCORD_TOKEN;
    if (!resolvedToken) {
      throw new Error("No token provided. Set TOKEN or DISCORD_TOKEN env var.");
    }

    this._discord.once(Events.ClientReady, () => {
      if (this._debug) logger.output(`${this._name} logged in as ${this._discord.user?.tag}`);
      if (!this.clientId) {
        this.clientId = this._discord.user?.id;
      }
    });

    this._discord.on("interactionCreate", async (interaction: Interaction) => {
      if (interaction.isAutocomplete()) {
        const command = this.commands.get(interaction.commandName);
        if (!command?.autocomplete) {
          if (this._debug) logger.warn(`No autocomplete handler for "${interaction.commandName}"`);
          return;
        }
        try {
          await command.autocomplete(interaction);
        } catch (err: unknown) {
          logger.error(`Error in autocomplete "${interaction.commandName}":`, err);
        }
      } else if (interaction.isChatInputCommand()) {
        const command = this.commands.get(interaction.commandName);
        if (!command) {
          if (this._debug) logger.warn(`No handler for command "${interaction.commandName}"`);
          return;
        }
        try {
          await command.execute(interaction);
        } catch (err: unknown) {
          logger.error(`Error in command "${interaction.commandName}":`, err);
          await this.dispatchError(interaction, err);
        }
      } else if (interaction.isButton()) {
        let matched = false;
        for (const [customId, button] of this.buttons) {
          const params = matchCustomId(customId, interaction.customId);
          if (params !== null) {
            matched = true;
            try {
              await button.execute(interaction, params);
            } catch (err: unknown) {
              logger.error(`Error in button "${customId}":`, err);
              await this.dispatchError(interaction, err);
            }
            break;
          }
        }
        if (!matched && this._debug) logger.warn(`No handler matched button "${interaction.customId}"`);
      } else if (interaction.isModalSubmit()) {
        let matched = false;
        for (const [customId, modal] of this.modals) {
          const params = matchCustomId(customId, interaction.customId);
          if (params !== null) {
            matched = true;
            try {
              await modal.execute(interaction, params);
            } catch (err: unknown) {
              logger.error(`Error in modal "${customId}":`, err);
              await this.dispatchError(interaction, err);
            }
            break;
          }
        }
        if (!matched && this._debug) logger.warn(`No handler matched modal "${interaction.customId}"`);
      } else if (interaction.isAnySelectMenu()) {
        let matched = false;
        for (const [customId, menu] of this.selectMenus) {
          const params = matchCustomId(customId, interaction.customId);
          if (params !== null) {
            matched = true;
            try {
              await menu.execute(interaction, params);
            } catch (err: unknown) {
              logger.error(`Error in select menu "${customId}":`, err);
              await this.dispatchError(interaction, err);
            }
            break;
          }
        }
        if (!matched && this._debug) logger.warn(`No handler matched select menu "${interaction.customId}"`);
      }
    });

    this.events.forEach((event) => this.attachEventListener(event));

    if (this._loginTimeout !== undefined) {
      const timeout = this._loginTimeout;
      await Promise.race([
        this._discord.login(resolvedToken),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Login timed out after ${timeout}ms`)), timeout)
        ),
      ]);
    } else {
      await this._discord.login(resolvedToken);
    }

    this.started = true;
    return this;
  }

  /**
   * Register all loaded slash commands with Discord via the REST API.
   * Pass a `guildId` for instant guild-scoped registration (useful during development).
   * Omit for global registration (can take up to an hour to propagate).
   *
   * @param token - Bot token. Falls back to `TOKEN` then `DISCORD_TOKEN` env vars.
   * @param guildId - Guild ID for guild-scoped registration. Omit for global.
   * @throws If no token is found or if the client ID is not available.
   */
  async pushCommands(token?: string, guildId?: string): Promise<void> {
    const resolvedToken = token ?? process.env.TOKEN ?? process.env.DISCORD_TOKEN;
    if (!resolvedToken) {
      throw new Error("No token provided. Set TOKEN or DISCORD_TOKEN env var.");
    }

    if (!this._discord.isReady()) {
      logger.warn("Client isn't ready yet. Waiting...");
      await new Promise<void>((resolve) => {
        this._discord.once(Events.ClientReady, () => resolve());
      });
    }

    if (!this.clientId) {
      throw new Error(
        "Client ID wasn't initialized correctly, try adding it manually with setClientId()"
      );
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

  private async dispatchError(interaction: Interaction, error: unknown): Promise<void> {
    if (this.errorHandler) {
      const specific = (
        interaction.isChatInputCommand() ? this.errorHandler.command :
        interaction.isButton() ? this.errorHandler.button :
        interaction.isModalSubmit() ? this.errorHandler.modal :
        interaction.isAnySelectMenu() ? this.errorHandler.selectMenu :
        interaction.isAutocomplete() ? this.errorHandler.autocomplete :
        undefined
      ) as ((i: Interaction, e: unknown) => void | Promise<void>) | undefined;
      const handler = specific ?? this.errorHandler.execute;
      try {
        await handler(interaction, error);
      } catch (e: unknown) {
        logger.error("Error in error handler:", e);
      }
    }

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ content: "An error occurred.", ephemeral: true });
      } catch {
        // Already replied or interaction expired
      }
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
