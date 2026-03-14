# mjx-client

[![npm version](https://img.shields.io/npm/v/mjx-client)](https://www.npmjs.com/package/mjx-client)
[![License](https://img.shields.io/npm/l/mjx-client)](LICENSE)

A Discord bot framework built on top of discord.js v14, by majcek210.

---

## Installation

```bash
npm install mjx-client
```

---

## Quick start

```ts
import Client from "mjx-client";

const client = new Client({ debug: true }).setName("My Bot");

await client.use("./dist/app");   // load handlers
await client.start();              // reads TOKEN env var
await client.pushCommands();       // register slash commands with Discord
```

---

## App directory structure

```
app/
├── commands/
│   ├── ping/index.ts              # /ping
│   └── settings/
│       ├── index.ts               # optional group metadata
│       └── volume/index.ts        # /settings volume
├── events/
│   └── ready/index.ts
├── buttons/
│   └── order/confirm/[size]/[base]/index.ts   # pattern: order/confirm/:size/:base
├── modals/
│   └── order/deliver/[size]/[base]/index.ts
├── select-menus/
│   └── order/base/[size]/index.ts
└── error.ts                       # optional error handler
```

**File-based routing rules:**
- Every route file must be named `index.ts` inside its folder
- `[param]` folders become dynamic segments (`:param` in the pattern)
- `[...rest]` folder captures all remaining segments into `params.rest`
- `(group)` folders are organisational only — stripped from the pattern

---

## Handler examples

**Command** — `commands/ping/index.ts`
```ts
import { SlashCommandBuilder } from "mjx-client";
import type { Command } from "mjx-client";

export default {
  data: new SlashCommandBuilder().setName("ping").setDescription("Pong!"),
  async execute(interaction) {
    await interaction.reply("Pong!");
  },
} satisfies Command;
```

**Subcommand** — `commands/settings/volume/index.ts`
```ts
import { SlashCommandSubcommandBuilder } from "mjx-client";
import type { Subcommand } from "mjx-client";

export default {
  data: new SlashCommandSubcommandBuilder()
    .setName("volume")
    .setDescription("Set the volume"),
  async execute(interaction) { ... },
} satisfies Subcommand;
```

**Button** — `buttons/order/confirm/[size]/[base]/index.ts`
```ts
import type { Button } from "mjx-client";

export default {
  async execute(interaction, params) {
    const { size, base } = params; // captured from folder names
    await interaction.reply(`${size} pizza on ${base} base`);
  },
} satisfies Button;
```

**Error handler** — `error.ts`
```ts
import type { ErrorHandler } from "mjx-client";

export default {
  async execute(interaction, error) {
    console.error(error);
    if (interaction.isRepliable() && !interaction.replied)
      await interaction.reply({ content: "Something went wrong.", ephemeral: true });
  },
  // optional per-type override
  async command(interaction, error) {
    await interaction.reply({ content: "Command failed.", ephemeral: true });
  },
} satisfies ErrorHandler;
```

---

## Client API

| Method | Description |
|--------|-------------|
| `new Client(options?)` | Create a client. Options: `name`, `debug`, `intents` |
| `.setName(name)` | Set the bot display name (min 3 chars) |
| `.setDebug(enabled)` | Toggle debug logging |
| `.setClientId(id)` | Manually set the application ID |
| `.setLoginTimeout(ms)` | Reject login if it takes longer than `ms` |
| `.use(appDir)` | Load handlers from a compiled app directory |
| `.start(token?)` | Log in and start handling interactions |
| `.pushCommands(token?, guildId?)` | Register slash commands via REST |

Builder methods (`setName`, `setDebug`, `setClientId`, `setLoginTimeout`) must be called before `start()`.

---

## License

MIT
