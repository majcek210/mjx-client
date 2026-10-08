import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from "mjx-client";
import type { Command } from "mjx-client";

export default {
  data: new SlashCommandBuilder()
    .setName("roll")
    .setDescription("Roll a die")
    .addIntegerOption((o) =>
      o.setName("sides").setDescription("Number of sides (default 6)").setMinValue(2).setMaxValue(100)
    ),
  async execute(interaction) {
    const sides = interaction.options.getInteger("sides") ?? 6;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      // The customId routes to buttons/roll/[sides]/index.ts with params.sides set.
      new ButtonBuilder().setCustomId(`roll/${sides}`).setLabel("Roll again").setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({
      content: `d${sides}: **${1 + Math.floor(Math.random() * sides)}**`,
      components: [row],
    });
  },
} satisfies Command;
