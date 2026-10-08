import { MessageFlags } from "mjx-client";
import type { ErrorHandler } from "mjx-client";

export default {
  async execute(interaction, error) {
    console.error(error);
    if (!interaction.isRepliable()) return;
    const message = { content: "Something went wrong.", flags: MessageFlags.Ephemeral } as const;
    // The handler may have replied or deferred before it threw.
    if (interaction.replied || interaction.deferred) await interaction.followUp(message);
    else await interaction.reply(message);
  },
} satisfies ErrorHandler;
