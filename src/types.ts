import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  ClientEvents,
  ButtonBuilder,
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
  data: ButtonBuilder;
  execute: (interaction: ButtonInteraction) => Promise<void>;
}
