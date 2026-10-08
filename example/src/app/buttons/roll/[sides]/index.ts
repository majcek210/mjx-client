import type { Button } from "mjx-client";

export default {
  cooldown: { duration: 2_000, message: "Slow down, the die is still rolling." },
  async execute(interaction, params) {
    const sides = Number(params.sides);
    await interaction.update(`d${sides}: **${1 + Math.floor(Math.random() * sides)}**`);
  },
} satisfies Button;
