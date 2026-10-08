import { SlashCommandBuilder } from "mjx-client";
import type { Command } from "mjx-client";

export default {
  data: new SlashCommandBuilder().setName("ping").setDescription("Check that the bot is alive"),
  cooldown: 5_000,
  async execute(interaction) {
    await interaction.reply(`Pong! ${interaction.client.ws.ping}ms`);
  },
} satisfies Command;
