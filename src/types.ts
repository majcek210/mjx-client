import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  ClientEvents,
  ButtonInteraction,
  ModalSubmitInteraction,
  AnySelectMenuInteraction,
  AutocompleteInteraction,
  ContextMenuCommandBuilder,
  ContextMenuCommandInteraction,
  Interaction,
} from "discord.js";
import type Client from "./client.js";

/** Interaction types that guards and cooldowns can run against. */
export type GuardInteraction =
  | ChatInputCommandInteraction
  | ContextMenuCommandInteraction
  | ButtonInteraction
  | ModalSubmitInteraction
  | AnySelectMenuInteraction;

/**
 * A check that runs before a handler's `execute`.
 * Return `true` to allow the interaction. Return `false` to deny it with the
 * default message, or a string to deny it with that message. The denial is sent
 * as an ephemeral reply and `execute` is not called.
 *
 * @example
 * ```ts
 * const staffOnly: Guard = (interaction) =>
 *   (interaction.inCachedGuild() && interaction.member.roles.cache.has(STAFF_ROLE))
 *     || "Staff only.";
 * ```
 */
export type Guard<I extends GuardInteraction = GuardInteraction> = (
  interaction: I
) => boolean | string | Promise<boolean | string>;

/** What a cooldown is tracked per. Defaults to `"user"`. */
export type CooldownScope = "user" | "guild" | "channel" | "global";

export interface CooldownOptions {
  /** Cooldown length in milliseconds. */
  duration: number;
  /** What the cooldown is tracked per. Defaults to `"user"`. */
  scope?: CooldownScope;
  /**
   * Reply sent while the cooldown is active. A function receives the remaining
   * time in milliseconds. Defaults to a message with a relative timestamp.
   */
  message?: string | ((remainingMs: number) => string);
}

/** A cooldown in milliseconds, or an options object for a scope or custom message. */
export type Cooldown = number | CooldownOptions;

/** Fields shared by every handler that supports guards and cooldowns. */
export interface HandlerOptions<I extends GuardInteraction> {
  /** Checks run in order before `execute`. The first one that denies stops the chain. */
  guards?: Guard<I>[];
  /** Minimum time between uses. Starts when the guards pass, before `execute` runs. */
  cooldown?: Cooldown;
}

/**
 * A top-level slash command.
 *
 * @example
 * ```ts
 * export default {
 *   data: new SlashCommandBuilder().setName("ping").setDescription("Pong!"),
 *   async execute(interaction) {
 *     await interaction.reply("Pong!");
 *   },
 * } satisfies Command;
 * ```
 */
export interface Command extends HandlerOptions<ChatInputCommandInteraction> {
  /** Slash command definition built with `SlashCommandBuilder`, with or without options. */
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  /** Called when a user runs this command. */
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** Called when Discord requests autocomplete suggestions for an option on this command. */
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
  /**
   * Subcommand handlers by name. Set by the loader on commands built from a
   * subcommand folder; leave it out of your own command files.
   */
  subcommands?: Map<string, Subcommand>;
}

/**
 * A single subcommand inside a subcommand-routed command folder.
 * Place at `commands/<parent>/<name>/index.ts`.
 *
 * @example
 * ```ts
 * // commands/settings/volume/index.ts  →  /settings volume
 * export default {
 *   data: new SlashCommandSubcommandBuilder()
 *     .setName("volume")
 *     .setDescription("Set the volume"),
 *   async execute(interaction) { ... },
 * } satisfies Subcommand;
 * ```
 */
export interface Subcommand extends HandlerOptions<ChatInputCommandInteraction> {
  /** Subcommand definition built with `SlashCommandSubcommandBuilder`. */
  data: SlashCommandSubcommandBuilder;
  /** Called when a user runs this subcommand. */
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** Called when Discord requests autocomplete suggestions for an option on this subcommand. */
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

/**
 * Optional metadata exported from a subcommand group parent folder.
 * Place at `commands/<parent>/index.ts` alongside the subcommand files.
 * If omitted, the parent command description defaults to `"<name> commands"`.
 *
 * @example
 * ```ts
 * // commands/settings/index.ts
 * export default { description: "Adjust bot settings" } satisfies CommandGroup;
 * ```
 */
export interface CommandGroup extends HandlerOptions<ChatInputCommandInteraction> {
  /** Description shown in Discord for the parent slash command. */
  description: string;
}

/**
 * A user or message context menu command (right click, then Apps).
 * Place at `context-menus/<name>/index.ts`. The command name comes from `data`,
 * not the folder.
 *
 * @example
 * ```ts
 * // context-menus/report/index.ts
 * export default {
 *   data: new ContextMenuCommandBuilder()
 *     .setName("Report message")
 *     .setType(ApplicationCommandType.Message),
 *   async execute(interaction) {
 *     if (!interaction.isMessageContextMenuCommand()) return;
 *     await interaction.reply({
 *       content: `Reported ${interaction.targetMessage.url}`,
 *       flags: MessageFlags.Ephemeral,
 *     });
 *   },
 * } satisfies ContextMenu;
 * ```
 */
export interface ContextMenu extends HandlerOptions<ContextMenuCommandInteraction> {
  /** Context menu definition built with `ContextMenuCommandBuilder`. */
  data: ContextMenuCommandBuilder;
  /**
   * Called when a user picks this entry. Narrow with `isUserContextMenuCommand()`
   * or `isMessageContextMenuCommand()` to reach `targetUser` or `targetMessage`.
   */
  execute: (interaction: ContextMenuCommandInteraction) => Promise<void>;
}

/**
 * A Discord event handler.
 * Place at `events/<EventName>/index.ts`.
 *
 * @typeParam K - A key of `ClientEvents` (e.g. `"messageCreate"`).
 *
 * @example
 * ```ts
 * // events/ready/index.ts
 * export default {
 *   name: Events.ClientReady,
 *   once: true,
 *   execute(client) { console.log(`Logged in as ${client.user.tag}`); },
 * } satisfies Event<typeof Events.ClientReady>;
 * ```
 */
export interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
  /** The discord.js event name (e.g. `Events.MessageCreate`). */
  name: K;
  /** If `true`, the listener fires only once then removes itself. */
  once?: boolean;
  /** Called when the event fires. Receives the same arguments as discord.js `client.on(name, ...)`. */
  execute: (...args: ClientEvents[K]) => void | Promise<void>;
}

/**
 * A button interaction handler.
 * Place at `buttons/<customId>/index.ts`.
 *
 * The `customId` pattern is derived from the folder path by default.
 * Use `[param]` folders for dynamic segments and `[...rest]` for catch-all routes.
 *
 * @example
 * ```ts
 * // buttons/order/confirm/[size]/[base]/index.ts  →  "order/confirm/:size/:base"
 * export default {
 *   async execute(interaction, params) {
 *     const { size, base } = params;
 *   },
 * } satisfies Button;
 * ```
 */
export interface Button extends HandlerOptions<ButtonInteraction> {
  /**
   * Explicit customId pattern. If omitted, derived from the file path.
   * Supports `:param` for dynamic segments and `...rest` for catch-alls.
   */
  customId?: string;
  /**
   * Called when a button with a matching customId is clicked.
   * @param interaction - The button interaction.
   * @param params - Dynamic route segments captured from the customId pattern.
   */
  execute: (
    interaction: ButtonInteraction,
    params: Record<string, string>
  ) => Promise<void>;
}

/**
 * A modal submit interaction handler.
 * Place at `modals/<customId>/index.ts`.
 *
 * The `customId` pattern is derived from the folder path by default.
 * Use `[param]` folders for dynamic segments and `[...rest]` for catch-all routes.
 *
 * @example
 * ```ts
 * // modals/order/deliver/[size]/[base]/index.ts  →  "order/deliver/:size/:base"
 * export default {
 *   async execute(interaction, params) {
 *     const address = interaction.fields.getTextInputValue("address");
 *   },
 * } satisfies Modal;
 * ```
 */
export interface Modal extends HandlerOptions<ModalSubmitInteraction> {
  /**
   * Explicit customId pattern. If omitted, derived from the file path.
   * Supports `:param` for dynamic segments and `...rest` for catch-alls.
   */
  customId?: string;
  /**
   * Called when a modal with a matching customId is submitted.
   * @param interaction - The modal submit interaction.
   * @param params - Dynamic route segments captured from the customId pattern.
   */
  execute: (
    interaction: ModalSubmitInteraction,
    params: Record<string, string>
  ) => Promise<void>;
}

/**
 * A select menu interaction handler.
 * Place at `select-menus/<customId>/index.ts`.
 *
 * The `customId` pattern is derived from the folder path by default.
 * Use `[param]` folders for dynamic segments and `[...rest]` for catch-all routes.
 * Narrow the interaction type inside `execute` if you need type-specific fields (e.g. `.values`).
 *
 * @example
 * ```ts
 * // select-menus/order/base/[size]/index.ts  →  "order/base/:size"
 * export default {
 *   async execute(interaction, params) {
 *     if (!interaction.isStringSelectMenu()) return;
 *     const chosen = interaction.values[0];
 *   },
 * } satisfies SelectMenu;
 * ```
 */
export interface SelectMenu extends HandlerOptions<AnySelectMenuInteraction> {
  /**
   * Explicit customId pattern. If omitted, derived from the file path.
   * Supports `:param` for dynamic segments and `...rest` for catch-alls.
   */
  customId?: string;
  /**
   * Called when a select menu with a matching customId is used.
   * @param interaction - The select menu interaction (`AnySelectMenuInteraction`). Narrow with
   *   `isStringSelectMenu()`, `isUserSelectMenu()`, etc. for type-specific fields.
   * @param params - Dynamic route segments captured from the customId pattern.
   */
  execute: (
    interaction: AnySelectMenuInteraction,
    params: Record<string, string>
  ) => Promise<void>;
}

/**
 * App-level error handler loaded from `{appDir}/error.ts`.
 *
 * `execute` is the universal fallback called for every interaction type.
 * Define a per-type method to override the behaviour for that specific type.
 * After your handler runs, if the interaction still has no response, the framework
 * sends an ephemeral `"An error occurred."` itself: a reply, or a follow-up when
 * the interaction was deferred.
 *
 * The failing handler may have replied or deferred before it threw, so check both
 * `replied` and `deferred` before calling `reply()`.
 *
 * @example
 * ```ts
 * // app/error.ts
 * export default {
 *   async execute(interaction, error) {
 *     console.error(error);
 *   },
 *   async command(interaction, error) {
 *     const message = { content: "Command failed.", flags: MessageFlags.Ephemeral } as const;
 *     if (interaction.replied || interaction.deferred) await interaction.followUp(message);
 *     else await interaction.reply(message);
 *   },
 * } satisfies ErrorHandler;
 * ```
 */
export interface ErrorHandler {
  /**
   * Universal fallback — called for any interaction type that has no specific override below.
   * @param interaction - The interaction that caused the error.
   * @param error - The thrown value.
   */
  execute: (interaction: Interaction, error: unknown) => void | Promise<void>;
  /**
   * Override for slash command errors. Receives a `ChatInputCommandInteraction`.
   * @param interaction - The slash command interaction.
   * @param error - The thrown value.
   */
  command?: (interaction: ChatInputCommandInteraction, error: unknown) => void | Promise<void>;
  /**
   * Override for autocomplete errors. Receives an `AutocompleteInteraction`.
   * Note: autocomplete interactions cannot be replied to.
   * @param interaction - The autocomplete interaction.
   * @param error - The thrown value.
   */
  autocomplete?: (interaction: AutocompleteInteraction, error: unknown) => void | Promise<void>;
  /**
   * Override for context menu errors. Receives a `ContextMenuCommandInteraction`.
   * @param interaction - The context menu interaction.
   * @param error - The thrown value.
   */
  contextMenu?: (interaction: ContextMenuCommandInteraction, error: unknown) => void | Promise<void>;
  /**
   * Override for button errors. Receives a `ButtonInteraction`.
   * @param interaction - The button interaction.
   * @param error - The thrown value.
   */
  button?: (interaction: ButtonInteraction, error: unknown) => void | Promise<void>;
  /**
   * Override for modal submit errors. Receives a `ModalSubmitInteraction`.
   * @param interaction - The modal submit interaction.
   * @param error - The thrown value.
   */
  modal?: (interaction: ModalSubmitInteraction, error: unknown) => void | Promise<void>;
  /**
   * Override for select menu errors. Receives an `AnySelectMenuInteraction`.
   * @param interaction - The select menu interaction.
   * @param error - The thrown value.
   */
  selectMenu?: (interaction: AnySelectMenuInteraction, error: unknown) => void | Promise<void>;
}

/** Which kind of handler an interaction was routed to. */
export type HandlerKind =
  | "command"
  | "autocomplete"
  | "contextMenu"
  | "button"
  | "modal"
  | "selectMenu";

/** Passed to every {@link Middleware}. */
export interface MiddlewareContext {
  /** The interaction being handled. */
  interaction: GuardInteraction | AutocompleteInteraction;
  /** Which kind of handler it was routed to. */
  kind: HandlerKind;
  /**
   * The matched handler: the command name (`"settings volume"` for a subcommand),
   * the context menu name, or the customId pattern for components and modals.
   */
  name: string;
  /** Dynamic segments captured from the customId. Empty for commands. */
  params: Record<string, string>;
  /** The mjx-client instance. */
  client: Client;
}

/**
 * Runs around every routed interaction, before guards and cooldowns.
 * Call `next()` to continue; return without calling it to stop the interaction
 * there. Anything thrown goes to the error handler.
 *
 * Register with `client.middleware(fn)` or export from `{appDir}/middleware.ts`.
 *
 * @example
 * ```ts
 * // app/middleware.ts
 * const timing: Middleware = async (ctx, next) => {
 *   const started = Date.now();
 *   await next();
 *   console.log(`${ctx.kind} ${ctx.name} took ${Date.now() - started}ms`);
 * };
 * export default [timing];
 * ```
 */
export type Middleware = (
  ctx: MiddlewareContext,
  next: () => Promise<void>
) => void | Promise<void>;
