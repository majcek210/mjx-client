import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  ClientEvents,
  ButtonInteraction,
  ModalSubmitInteraction,
  AnySelectMenuInteraction,
  AutocompleteInteraction,
  Interaction,
} from "discord.js";

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
export interface Command {
  /** Slash command definition built with `SlashCommandBuilder`. */
  data: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  /** Called when a user runs this command. */
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  /** Called when Discord requests autocomplete suggestions for an option on this command. */
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
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
export interface Subcommand {
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
export interface CommandGroup {
  /** Description shown in Discord for the parent slash command. */
  description: string;
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
export interface Button {
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
export interface Modal {
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
export interface SelectMenu {
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
 * After your handler runs, if the interaction has not been replied to, the
 * framework sends a default ephemeral `"An error occurred."` reply automatically.
 *
 * @example
 * ```ts
 * // app/error.ts
 * export default {
 *   async execute(interaction, error) {
 *     console.error(error);
 *   },
 *   async command(interaction, error) {
 *     await interaction.reply({ content: "Command failed.", ephemeral: true });
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
