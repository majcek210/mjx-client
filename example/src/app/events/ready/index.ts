import { Events } from "mjx-client";
import type { Event } from "mjx-client";

export default {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Ready as ${client.user.tag} in ${client.guilds.cache.size} server(s)`);
  },
} satisfies Event<typeof Events.ClientReady>;
