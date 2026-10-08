# mjx-client example

A small bot with one of each handler kind:

| File | What it does |
|------|--------------|
| `src/index.ts` | Creates the client, loads `app/`, logs in, registers commands |
| `app/commands/ping` | `/ping` with a 5 second cooldown |
| `app/commands/roll` | `/roll [sides]`, replies with a "Roll again" button |
| `app/buttons/roll/[sides]` | Handles that button; `sides` comes from the customId |
| `app/context-menus/user-info` | Right click a user > Apps > User info, servers only |
| `app/events/ready` | Logs once the bot is connected |
| `app/middleware.ts` | Logs every interaction and how long it took |
| `app/error.ts` | Replies when a handler throws |

## Run it

```bash
npm install
cp .env.example .env   # then put your bot token in BOT_TOKEN
npm run dev            # runs the TypeScript sources with tsx
```

Or build first: `npm run build && npm start`.

Set `GUILD_ID` in `.env` while developing. Commands registered to one server show up
immediately; global ones can take up to an hour.

The token variable is called `BOT_TOKEN` here only because `src/index.ts` reads that name.
Change `setToken(process.env.BOT_TOKEN)` to use any other variable.
