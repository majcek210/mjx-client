import type { PermissionResolvable } from "discord.js";
import type { Guard } from "./types.js";

/** Denies interactions that come from DMs. */
export const guildOnly: Guard = (interaction) =>
  interaction.inGuild() || "This can only be used in a server.";

/**
 * Requires the member to hold every listed permission in the current channel.
 * Denies in DMs, where there are no member permissions.
 *
 * @example
 * ```ts
 * guards: [requirePermissions(PermissionFlagsBits.ManageMessages)]
 * ```
 */
export function requirePermissions(...permissions: PermissionResolvable[]): Guard {
  return (interaction) =>
    interaction.memberPermissions?.has(permissions) ||
    "You don't have permission to use this.";
}

/** Allows only the listed user IDs. */
export function requireUsers(...userIds: string[]): Guard {
  const allowed = new Set(userIds);
  return (interaction) =>
    allowed.has(interaction.user.id) || "You can't use this.";
}
