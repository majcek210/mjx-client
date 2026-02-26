import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  ClientEvents,
  ButtonInteraction,
  ModalSubmitInteraction,
  AnySelectMenuInteraction,
  AutocompleteInteraction,
} from "discord.js";

export interface Command {
  data: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

/** A single subcommand inside a subcommand-routed command folder. */
export interface Subcommand {
  data: SlashCommandSubcommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

/** Optional metadata exported from a subcommand group's index.ts. */
export interface CommandGroup {
  description: string;
}

export interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute: (...args: ClientEvents[K]) => void | Promise<void>;
}

export interface Button {
  customId?: string; // explicit override; if omitted, derived from the file path
  execute: (
    interaction: ButtonInteraction,
    params: Record<string, string>
  ) => Promise<void>;
}

export interface Modal {
  customId?: string; // explicit override; if omitted, derived from the file path
  execute: (
    interaction: ModalSubmitInteraction,
    params: Record<string, string>
  ) => Promise<void>;
}

export interface SelectMenu {
  customId?: string; // explicit override; if omitted, derived from the file path
  execute: (
    interaction: AnySelectMenuInteraction,
    params: Record<string, string>
  ) => Promise<void>;
}
