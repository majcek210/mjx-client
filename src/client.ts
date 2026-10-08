import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  Client as DiscordClient,
  GatewayIntentBits,
  Collection,
  Events,
  MessageFlags,
  REST,
  Routes,
  Interaction,
} from "discord.js";
import { collectAll, contextMenuKey } from "./lib/collector.js";
import { matchCustomId } from "./lib/router.js";
import logger from "./lib/logger.js";

import type {
  Command, Event, Button, Modal, SelectMenu, ContextMenu, ErrorHandler,
  Cooldown, Guard, GuardInteraction, Middleware, MiddlewareContext,
} from "./types.js";

/** Options passed to the {@link Client} constructor. */
type ClientOptions = {
  /** Display name for the bot. Must be at least 3 characters. Defaults to `"Unnamed Client"`. */
  name?: string;
  /** Enable verbose debug logging. Defaults to `false`. */
  debug?: boolean;
  /** Gateway intents to request. Defaults to `[Guilds, GuildMessages, MessageContent]`. */
  intents?: GatewayIntentBits[];
};

/** Guards and cooldown of one handler, with the name its cooldown is tracked under. */
type Limits = {
  key: string;
  guards?: Guard<never>[] | undefined;
  cooldown?: Cooldown | undefined;
};

const DEFAULT_DENIAL = "You can't use this.";
// Expired cooldown entries are only dropped once the map grows past this.
const COOLDOWN_SWEEP_SIZE = 1000;

export * from "discord.js";
export * from "./types.js";
export * from "./guards.js";

/**
 * The main mjx-client bot client.
 * Wraps discord.js `Client` with file-based routing for commands, context menus,
 * events, buttons, modals, and select menus.
 *
 * @example
 * ```ts
 * import Client from "mjx-client";
 *
 * const client = new Client({ debug: true })
 *   .setName("My Bot")
 *   .setLoginTimeout(15_000);
 *
 * await client.use(new URL("./app", import.meta.url));
 * await client.start(process.env.DISCORD_TOKEN);
 * await client.pushCommands();
 * ```
 */
export default class Client {
  private _name: string;
  private _debug: boolean;
  private started = false;
  private _discord: DiscordClient;

  public commands: Collection<string, Command> = new Collection();
  /** Keyed by `"user:<name>"` or `"message:<name>"`. */
  public contextMenus: Collection<string, ContextMenu> = new Collection();
  public events: Collection<string, Event> = new Collection();
  public buttons: Collection<string, Button> = new Collection();
  public modals: Collection<string, Modal> = new Collection();
  public selectMenus: Collection<string, SelectMenu> = new Collection();
  public clientId: string | undefined = undefined;

  private errorHandler: ErrorHandler | undefined = undefined;
  private middlewares: Middleware[] = [];
  private cooldowns = new Map<string, number>();
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
   * Optional: {@link pushCommands} looks the ID up from the token when it isn't set.
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

  /** The underlying discord.js client, for anything this wrapper doesn't cover. */
  get discord(): DiscordClient {
    return this._discord;
  }

  /**
   * Load handlers from an app directory.
   * Scans for `commands/`, `context-menus/`, `events/`, `buttons/`, `modals/` and
   * `select-menus/` subdirectories, plus optional `error` and `middleware` files.
   * Can be called multiple times to merge handlers from different directories.
   * Safe to call after {@link start}.
   *
   * Handler files may be compiled JavaScript or, when the process can import
   * TypeScript (tsx, ts-node, Node's type stripping), the `.ts` sources.
   *
   * @param appDir - A path (absolute or relative to `process.cwd()`) or a `file:` URL.
   *   Pass `new URL("./app", import.meta.url)` to resolve next to the calling file,
   *   so the same line works from `src/` and from the build output.
   * @returns `this` for chaining.
   *
   * @example
   * ```ts
   * await client.use(new URL("./app", import.meta.url));
   * ```
   */
  async use(appDir: string | URL): Promise<this> {
    const resolvedDir =
      appDir instanceof URL || appDir.startsWith("file:")
        ? fileURLToPath(appDir)
        : path.resolve(appDir);

    if (!fs.existsSync(resolvedDir)) {
      logger.warn(`[use] ${resolvedDir} does not exist, no handlers loaded`);
      return this;
    }

    const {
      commands, contextMenus, events, buttons, modals, selectMenus,
      errorHandler, middleware, counts,
    } = await collectAll(resolvedDir);

    commands.forEach((cmd, name) => this.commands.set(name, cmd));
    contextMenus.forEach((menu, key) => this.contextMenus.set(key, menu));
    buttons.forEach((btn, id) => this.buttons.set(id, btn));
    modals.forEach((modal, id) => this.modals.set(id, modal));
    selectMenus.forEach((menu, id) => this.selectMenus.set(id, menu));
    if (errorHandler) this.errorHandler = errorHandler;
    this.middlewares.push(...middleware);
    events.forEach((evt, name) => {
      this.events.set(name, evt);
      if (this.started) this.attachEventListener(evt);
    });

    if (this._debug) {
      logger.output(
        `[use] ${counts.commands.loaded}/${counts.commands.total} commands,` +
        ` ${counts.contextMenus.loaded}/${counts.contextMenus.total} context menus,` +
        ` ${counts.events.loaded}/${counts.events.total} events,` +
        ` ${counts.buttons.loaded}/${counts.buttons.total} buttons,` +
        ` ${counts.modals.loaded}/${counts.modals.total} modals,` +
        ` ${counts.selectMenus.loaded}/${counts.selectMenus.total} select menus,` +
        ` ${middleware.length} middleware`
      );
    }

    return this;
  }

  /**
   * Add middleware that runs around every routed interaction, in the order added
   * and before guards and cooldowns. Middleware exported from `{appDir}/middleware.ts`
   * is added by {@link use} the same way.
   *
   * @example
   * ```ts
   * client.middleware(async (ctx, next) => {
   *   console.log(`${ctx.interaction.user.tag} -> ${ctx.kind} ${ctx.name}`);
   *   await next();
   * });
   * ```
   */
  middleware(...fns: Middleware[]): this {
    this.middlewares.push(...fns);
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

    const resolvedToken = this.resolveToken(token);

    this._discord.once(Events.ClientReady, () => {
      if (this._debug) logger.output(`${this._name} logged in as ${this._discord.user?.tag}`);
      if (!this.clientId) {
        this.clientId = this._discord.user?.id;
      }
    });

    this._discord.on(Events.InteractionCreate, (interaction) => this.handleInteraction(interaction));

    this.events.forEach((event) => this.attachEventListener(event));

    if (this._loginTimeout !== undefined) {
      const timeout = this._loginTimeout;
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          this._discord.login(resolvedToken),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Login timed out after ${timeout}ms`)), timeout);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    } else {
      await this._discord.login(resolvedToken);
    }

    this.started = true;
    return this;
  }

  /**
   * Register all loaded slash commands and context menus with Discord via the REST API.
   * Pass a `guildId` for instant guild-scoped registration (useful during development).
   * Omit for global registration (can take up to an hour to propagate).
   *
   * Works before or after {@link start}. The application ID comes from
   * {@link setClientId}, the logged-in client, or a lookup with the token.
   *
   * @param token - Bot token. Falls back to `TOKEN` then `DISCORD_TOKEN` env vars.
   * @param guildId - Guild ID for guild-scoped registration. Omit for global.
   * @throws If no token is found or if the application ID can't be resolved.
   */
  async pushCommands(token?: string, guildId?: string): Promise<void> {
    const rest = new REST({ version: "10" }).setToken(this.resolveToken(token));

    if (!this.clientId) {
      if (this._discord.isReady()) {
        this.clientId = this._discord.user.id;
      } else {
        try {
          const app = await rest.get(Routes.currentApplication()) as { id: string };
          this.clientId = app.id;
        } catch (err: unknown) {
          throw new Error(
            "Couldn't look up the application ID from the token, set it with setClientId()",
            { cause: err }
          );
        }
      }
    }

    const commandsData = [
      ...this.commands.map((cmd) => cmd.data.toJSON()),
      ...this.contextMenus.map((menu) => menu.data.toJSON()),
    ];

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

  private resolveToken(token?: string): string {
    const resolved = token ?? process.env.TOKEN ?? process.env.DISCORD_TOKEN;
    if (!resolved) {
      throw new Error("No token provided. Pass one or set the TOKEN or DISCORD_TOKEN env var.");
    }
    return resolved;
  }

  private async handleInteraction(interaction: Interaction): Promise<void> {
    if (interaction.isAutocomplete() || interaction.isChatInputCommand()) {
      const command = this.commands.get(interaction.commandName);
      if (!command) {
        if (this._debug) logger.warn(`No handler for command "${interaction.commandName}"`);
        return;
      }
      const subName = command.subcommands ? interaction.options.getSubcommand(false) : null;
      const sub = subName ? command.subcommands?.get(subName) : undefined;
      const name = subName ? `${interaction.commandName} ${subName}` : interaction.commandName;

      if (interaction.isAutocomplete()) {
        const autocomplete = (sub ?? command).autocomplete;
        if (!autocomplete) {
          if (this._debug) logger.warn(`No autocomplete handler for "${name}"`);
          return;
        }
        await this.run({ interaction, kind: "autocomplete", name, params: {} }, [], () =>
          autocomplete(interaction)
        );
        return;
      }

      const limits: Limits[] = [{ key: interaction.commandName, ...pickLimits(command) }];
      if (sub) limits.push({ key: name, ...pickLimits(sub) });
      // A subcommand folder's command routes to the subcommand itself here, so its
      // own guards and cooldown apply on top of the group's.
      await this.run({ interaction, kind: "command", name, params: {} }, limits, () =>
        (sub ?? command).execute(interaction)
      );
    } else if (interaction.isContextMenuCommand()) {
      const menu = this.contextMenus.get(
        contextMenuKey(interaction.commandType, interaction.commandName)
      );
      if (!menu) {
        if (this._debug) logger.warn(`No handler for context menu "${interaction.commandName}"`);
        return;
      }
      const name = interaction.commandName;
      await this.run(
        { interaction, kind: "contextMenu", name, params: {} },
        [{ key: name, ...pickLimits(menu) }],
        () => menu.execute(interaction)
      );
    } else if (interaction.isButton()) {
      const match = findByCustomId(this.buttons, interaction.customId);
      if (!match) {
        if (this._debug) logger.warn(`No handler matched button "${interaction.customId}"`);
        return;
      }
      const { pattern, handler, params } = match;
      await this.run(
        { interaction, kind: "button", name: pattern, params },
        [{ key: pattern, ...pickLimits(handler) }],
        () => handler.execute(interaction, params)
      );
    } else if (interaction.isModalSubmit()) {
      const match = findByCustomId(this.modals, interaction.customId);
      if (!match) {
        if (this._debug) logger.warn(`No handler matched modal "${interaction.customId}"`);
        return;
      }
      const { pattern, handler, params } = match;
      await this.run(
        { interaction, kind: "modal", name: pattern, params },
        [{ key: pattern, ...pickLimits(handler) }],
        () => handler.execute(interaction, params)
      );
    } else if (interaction.isAnySelectMenu()) {
      const match = findByCustomId(this.selectMenus, interaction.customId);
      if (!match) {
        if (this._debug) logger.warn(`No handler matched select menu "${interaction.customId}"`);
        return;
      }
      const { pattern, handler, params } = match;
      await this.run(
        { interaction, kind: "selectMenu", name: pattern, params },
        [{ key: pattern, ...pickLimits(handler) }],
        () => handler.execute(interaction, params)
      );
    }
  }

  /**
   * Runs one routed interaction: middleware, then guards, then cooldowns, then the
   * handler. `limits` is ordered outermost first. Never rejects; failures go to
   * the error handler.
   */
  private async run(
    route: Omit<MiddlewareContext, "client">,
    limits: Limits[],
    execute: () => Promise<void>
  ): Promise<void> {
    const ctx: MiddlewareContext = { ...route, client: this };
    const { interaction } = ctx;

    const handle = async (): Promise<void> => {
      if (!interaction.isAutocomplete()) {
        for (const { guards } of limits) {
          for (const guard of guards ?? []) {
            const result = await (guard as Guard)(interaction);
            if (result !== true) {
              await this.respond(interaction, typeof result === "string" ? result : DEFAULT_DENIAL);
              return;
            }
          }
        }
        const denial = this.checkCooldowns(ctx.kind, limits, interaction);
        if (denial !== null) {
          await this.respond(interaction, denial);
          return;
        }
      }
      await execute();
    };

    let reached = -1;
    const dispatch = async (i: number): Promise<void> => {
      if (i <= reached) throw new Error("next() called more than once in a middleware");
      reached = i;
      const fn = this.middlewares[i];
      if (!fn) return handle();
      await fn(ctx, () => dispatch(i + 1));
    };

    try {
      await dispatch(0);
    } catch (err: unknown) {
      logger.error(`Error in ${ctx.kind} "${ctx.name}":`, err);
      await this.dispatchError(ctx, err);
    }
  }

  /**
   * Returns the message to send if any of the cooldowns is still running.
   * Otherwise starts them all and returns null.
   */
  private checkCooldowns(kind: string, limits: Limits[], interaction: GuardInteraction): string | null {
    const now = Date.now();
    const pending: Array<[key: string, duration: number]> = [];

    for (const { key, cooldown } of limits) {
      if (cooldown === undefined) continue;
      const options = typeof cooldown === "number" ? { duration: cooldown } : cooldown;
      if (!(options.duration > 0)) continue;

      const scope = options.scope ?? "user";
      // Guild and channel scopes fall back to the user in DMs, where those IDs are missing.
      const scopeId =
        scope === "global" ? "" :
        scope === "guild" ? interaction.guildId ?? interaction.user.id :
        scope === "channel" ? interaction.channelId ?? interaction.user.id :
        interaction.user.id;
      const storeKey = `${kind}:${key}:${scope}:${scopeId}`;

      const expires = this.cooldowns.get(storeKey);
      if (expires !== undefined && expires > now) {
        const { message } = options;
        if (typeof message === "function") return message(expires - now);
        return message ?? `You're on cooldown. Try again <t:${Math.ceil(expires / 1000)}:R>.`;
      }
      pending.push([storeKey, options.duration]);
    }

    for (const [storeKey, duration] of pending) this.cooldowns.set(storeKey, now + duration);

    if (this.cooldowns.size > COOLDOWN_SWEEP_SIZE) {
      for (const [storeKey, expires] of this.cooldowns) {
        if (expires <= now) this.cooldowns.delete(storeKey);
      }
    }
    return null;
  }

  /** Sends an ephemeral message as a reply, or as a follow-up if the interaction already has a response. */
  private async respond(interaction: GuardInteraction, content: string): Promise<void> {
    const message = { content, flags: MessageFlags.Ephemeral } as const;
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp(message);
      else await interaction.reply(message);
    } catch {
      // Interaction expired or was answered in the meantime
    }
  }

  private async dispatchError(ctx: MiddlewareContext, error: unknown): Promise<void> {
    const { interaction } = ctx;

    if (this.errorHandler) {
      const specific = this.errorHandler[ctx.kind] as
        ((i: Interaction, e: unknown) => void | Promise<void>) | undefined;
      const handler = specific ?? this.errorHandler.execute;
      try {
        // ContextMenuCommandInteraction is the base of two Interaction members, not one itself.
        await handler(interaction as Interaction, error);
      } catch (e: unknown) {
        logger.error("Error in error handler:", e);
      }
    }

    // A deferred interaction would otherwise show "thinking..." until it expires.
    if (!interaction.isAutocomplete() && !interaction.replied) {
      await this.respond(interaction, "An error occurred.");
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

function pickLimits(handler: Omit<Limits, "key">): Omit<Limits, "key"> {
  return { guards: handler.guards, cooldown: handler.cooldown };
}

/** First handler whose customId pattern matches. Collections are sorted most specific first. */
function findByCustomId<T>(
  handlers: Collection<string, T>,
  customId: string
): { pattern: string; handler: T; params: Record<string, string> } | null {
  for (const [pattern, handler] of handlers) {
    const params = matchCustomId(pattern, customId);
    if (params !== null) return { pattern, handler, params };
  }
  return null;
}
