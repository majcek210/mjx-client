import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ClientEvents,
  ButtonInteraction,
  ModalSubmitInteraction,
  AnySelectMenuInteraction,
} from "discord.js";

export interface Command {
  data: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}
export interface Event<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute: (...args: ClientEvents[K]) => void | Promise<void>;
}

export interface Button {
  customId: string; // supports ":param" segments, e.g. "delete/:itemId"
  execute: (
    interaction: ButtonInteraction,
    params: Record<string, string>
  ) => Promise<void>;
}

export interface Modal {
  customId: string; // supports ":param" segments, e.g. "confirm/:action"
  execute: (
    interaction: ModalSubmitInteraction,
    params: Record<string, string>
  ) => Promise<void>;
}

export interface SelectMenu {
  customId: string; // supports ":param" segments, e.g. "pick/:category"
  execute: (
    interaction: AnySelectMenuInteraction,
    params: Record<string, string>
  ) => Promise<void>;
}
