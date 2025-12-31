import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";

const pingCommand: any = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Replies with Pong!"),
  execute: async (interaction: ChatInputCommandInteraction) => {
    await interaction.reply("Pong!");
  },
};

export default pingCommand;
