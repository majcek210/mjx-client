import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ClientEvents,
  ButtonInteraction
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
