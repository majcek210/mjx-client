import { ApplicationCommandType, ContextMenuCommandBuilder, MessageFlags, guildOnly } from "mjx-client";
import type { ContextMenu } from "mjx-client";

export default {
  data: new ContextMenuCommandBuilder().setName("User info").setType(ApplicationCommandType.User),
  guards: [guildOnly],
  async execute(interaction) {
    if (!interaction.isUserContextMenuCommand()) return;
    const user = interaction.targetUser;
    await interaction.reply({
      content: `${user.tag} joined Discord <t:${Math.floor(user.createdTimestamp / 1000)}:R>.`,
      flags: MessageFlags.Ephemeral,
    });
  },
} satisfies ContextMenu;
