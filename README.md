# mjx-client

[![npm version](https://img.shields.io/npm/v/mjx-client)](https://www.npmjs.com/package/mjx-client)
[![License](https://img.shields.io/npm/l/mjx-client)](LICENSE)

A Discord bot framework on top of discord.js v14, by majcek210. Handlers are files in an
`app/` directory: the folder a file sits in decides which command, button, modal or event it
handles.

## Installation

```bash
npm install mjx-client
```

mjx-client is ESM-only and re-exports everything from discord.js, so you don't need to
install discord.js separately.

## Quick start

```ts
import Client from "mjx-client";

const client = new Client({ debug: true })
  .setName("My Bot")
  .setToken(process.env.MY_BOT_TOKEN);               // any env var you like

await client.use(new URL("./app", import.meta.url)); // load handlers
await client.start();                                // log in
await client.pushCommands();                         // register commands with Discord
```

There is a complete small bot in [`example/`](example).

A few things this snippet relies on:

- **Top-level `await`** needs an ES module. Set `"type": "module"` in your `package.json`
  (and `"module": "NodeNext"` in `tsconfig.json`), or wrap the calls in an `async` function.
- **The app directory** can be a path or a `file:` URL. A plain path such as `"./dist/app"`
  is resolved from `process.cwd()`, so it has to match your build output and the directory
  you start the bot from. `new URL("./app", import.meta.url)` is resolved next to the file
  that calls it, so the same line works from `src/` under tsx and from `dist/` after `tsc`.
  If the directory doesn't exist, `use()` logs a warning and loads nothing.
- **The token** comes from wherever you keep it. `setToken(process.env.MY_BOT_TOKEN)` sets
  it once for both `start()` and `pushCommands()`, and throws straight away if the variable
  is empty. You can also pass a token to either call. With neither, both read the `TOKEN`
  env var, then `DISCORD_TOKEN`. mjx-client doesn't load `.env` files; use
  `node --env-file=.env` or dotenv.
- **The application ID** for `pushCommands()` is taken from the logged-in client, or looked
  up with the token when you call it before `start()`. Call `setClientId()` only if you want
  to skip that lookup.

`pushCommands(token, guildId)` registers to one guild, which takes effect immediately.
Global registration can take up to an hour to show up.

## App directory structure

```
app/
├── commands/
│   ├── ping/index.ts              # /ping
│   └── settings/
│       ├── index.ts               # optional group metadata
│       └── volume/index.ts        # /settings volume
├── context-menus/
│   └── report/index.ts            # right click > Apps > Report message
├── events/
│   └── ready/index.ts
├── buttons/
│   └── order/confirm/[size]/[base]/index.ts   # pattern: order/confirm/:size/:base
├── modals/
│   └── order/deliver/[size]/[base]/index.ts
├── select-menus/
│   └── order/base/[size]/index.ts
├── middleware.ts                  # optional, runs around every interaction
└── error.ts                       # optional error handler
```

Routing rules:

- Every route file is named `index` inside its folder. `index.js`, `.mjs` and `.cjs` are
  loaded, and so are `.ts`, `.mts` and `.cts` when your runtime can import TypeScript (tsx,
  ts-node, Node's type stripping). If a folder has both, the JavaScript file wins.
- For buttons, modals and select menus the folder path is the `customId`. `[param]` folders
  become dynamic segments, `[...rest]` captures all remaining segments into `params.rest`,
  and the most specific pattern wins. Set `customId` on the handler to override the path.
- `(group)` folders are for organisation only and are stripped from the pattern.
- Commands and context menus take their name from `data`. Subcommands are one folder deeper
  than their parent; subcommand groups (a third level) aren't supported yet.

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

The parent's `commands/settings/index.ts` is optional. It can export a `CommandGroup` with a
`description`, plus `guards` and a `cooldown` that apply to every subcommand in the folder.

**Autocomplete** — add `autocomplete` to a command or subcommand
```ts
import { SlashCommandBuilder } from "mjx-client";
import type { Command } from "mjx-client";

const FRUITS = ["apple", "banana", "cherry"];

export default {
  data: new SlashCommandBuilder()
    .setName("fruit")
    .setDescription("Pick a fruit")
    .addStringOption((o) =>
      o.setName("name").setDescription("Fruit").setAutocomplete(true).setRequired(true)
    ),
  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    await interaction.respond(
      FRUITS.filter((f) => f.startsWith(typed)).map((f) => ({ name: f, value: f }))
    );
  },
  async execute(interaction) {
    await interaction.reply(interaction.options.getString("name", true));
  },
} satisfies Command;
```

**Context menu** — `context-menus/report/index.ts`
```ts
import { ApplicationCommandType, ContextMenuCommandBuilder, MessageFlags } from "mjx-client";
import type { ContextMenu } from "mjx-client";

export default {
  data: new ContextMenuCommandBuilder()
    .setName("Report message")
    .setType(ApplicationCommandType.Message),
  async execute(interaction) {
    if (!interaction.isMessageContextMenuCommand()) return;
    await interaction.reply({
      content: `Reported ${interaction.targetMessage.url}`,
      flags: MessageFlags.Ephemeral,
    });
  },
} satisfies ContextMenu;
```

Use `ApplicationCommandType.User` and `isUserContextMenuCommand()` for a user menu.
`pushCommands()` registers context menus together with slash commands.

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

Modals (`Modal`) and select menus (`SelectMenu`) have the same shape. A button with
`customId` `order/confirm/large/thin` reaches the handler above with
`{ size: "large", base: "thin" }`.

**Event** — `events/ready/index.ts`
```ts
import { Events } from "mjx-client";
import type { Event } from "mjx-client";

export default {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Logged in as ${client.user.tag}`);
  },
} satisfies Event<typeof Events.ClientReady>;
```

## Guards and cooldowns

Commands, subcommands, context menus, buttons, modals and select menus all accept `guards`
and `cooldown`.

```ts
import { PermissionFlagsBits, SlashCommandBuilder, guildOnly, requirePermissions } from "mjx-client";
import type { Command, Guard } from "mjx-client";

const notOnWeekends: Guard = () =>
  ![0, 6].includes(new Date().getDay()) || "Come back on Monday.";

export default {
  data: new SlashCommandBuilder().setName("purge").setDescription("Delete recent messages"),
  guards: [guildOnly, requirePermissions(PermissionFlagsBits.ManageMessages), notOnWeekends],
  cooldown: { duration: 30_000, scope: "channel" },
  async execute(interaction) { ... },
} satisfies Command;
```

A guard receives the interaction and returns `true` to allow it. Returning `false` denies
with a default message, and returning a string denies with that string. Denials are sent as
ephemeral replies and `execute` doesn't run. Guards run in order and may be async.

Built-in guards: `guildOnly`, `requirePermissions(...permissions)`, `requireUsers(...ids)`.

`cooldown` is a number of milliseconds, or an object:

| Field | Description |
|-------|-------------|
| `duration` | Length in milliseconds |
| `scope` | `"user"` (default), `"guild"`, `"channel"` or `"global"` |
| `message` | Reply while on cooldown: a string, or a function of the remaining milliseconds |

The cooldown starts once the guards pass, so a denied interaction doesn't use it up.
Cooldowns are kept in memory and reset when the bot restarts. Autocomplete requests skip
both guards and cooldowns.

## Middleware

Middleware runs around every routed interaction, before guards and cooldowns. Call `next()`
to continue. Returning without calling it stops the interaction there, and anything thrown
goes to the error handler.

```ts
// app/middleware.ts
import type { Middleware } from "mjx-client";

const timing: Middleware = async (ctx, next) => {
  const started = Date.now();
  await next();
  console.log(`${ctx.kind} ${ctx.name} took ${Date.now() - started}ms`);
};

const maintenance: Middleware = async (ctx, next) => {
  if (process.env.MAINTENANCE && !ctx.interaction.isAutocomplete()) {
    await ctx.interaction.reply("Back soon.");
    return;
  }
  await next();
};

export default [timing, maintenance];
```

The default export is one function or an array, run in array order. You can also add
middleware in code with `client.middleware(fn)`.

`ctx` has `interaction`, `kind` (`"command"`, `"autocomplete"`, `"contextMenu"`, `"button"`,
`"modal"` or `"selectMenu"`), `name` (command name such as `"settings volume"`, or the
customId pattern), `params` and `client`.

## Error handler

`error.ts` is called when a handler, guard or middleware throws.

```ts
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
  // optional per-type override
  async command(interaction, error) { ... },
} satisfies ErrorHandler;
```

`execute` is the fallback for every interaction type. `command`, `autocomplete`,
`contextMenu`, `button`, `modal` and `selectMenu` override it for one type.

If the interaction still has no response after your handler returns (or you have no
`error.ts`), mjx-client sends an ephemeral "An error occurred." itself, as a follow-up when
the interaction was deferred.

## Client API

| Method | Description |
|--------|-------------|
| `new Client(options?)` | Create a client. Options: `name`, `debug`, `intents`, `token` |
| `.setName(name)` | Set the bot display name (min 3 chars) |
| `.setDebug(enabled)` | Toggle debug logging |
| `.setToken(token)` | Set the bot token for `start()` and `pushCommands()` |
| `.setClientId(id)` | Set the application ID instead of having it looked up |
| `.setLoginTimeout(ms)` | Reject login if it takes longer than `ms` |
| `.use(appDir)` | Load handlers from an app directory (path or `file:` URL). Can be called more than once |
| `.middleware(...fns)` | Add middleware in code |
| `.start(token?)` | Log in and start handling interactions |
| `.pushCommands(token?, guildId?)` | Register slash commands and context menus via REST |
| `.discord` | The underlying discord.js `Client` |

`setName`, `setDebug`, `setToken`, `setClientId` and `setLoginTimeout` must be called before
`start()`.

The default intents are `Guilds`, `GuildMessages` and `MessageContent`. `MessageContent` is
privileged and has to be enabled for the bot in the Discord developer portal; pass your own
`intents` if you don't need it.

Loaded handlers are available as collections: `client.commands`, `client.contextMenus`,
`client.events`, `client.buttons`, `client.modals`, `client.selectMenus`.

For anything the wrapper doesn't cover, use the discord.js client directly:

```ts
client.discord.user?.setActivity("with files");
client.discord.on("guildCreate", (guild) => console.log(`Joined ${guild.name}`));
```

## License

MIT
