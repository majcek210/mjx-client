import Client, { GatewayIntentBits } from "mjx-client";

const client = new Client({ debug: true, intents: [GatewayIntentBits.Guilds] })
  .setName("Example Bot")
  .setToken(process.env.BOT_TOKEN);

// Resolved next to this file, so it finds src/app under tsx and dist/app after a build.
await client.use(new URL("./app", import.meta.url));
await client.start();
await client.pushCommands(undefined, process.env.GUILD_ID || undefined);
