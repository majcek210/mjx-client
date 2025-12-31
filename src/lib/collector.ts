import fs from "fs";
import path from "path";
import type { Command,Event } from "../client.js";
import logger from "./logger.js";
import { pathToFileURL } from "url"

export async function CollectCommands(dir: string): Promise<{
  total: number;
  loaded: number;
  commands: Map<string, Command>;
}> {
  try {
    const commands = new Map<string, Command>();
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".js"));
    const total = files.length;
    let loaded = 0;

    for (const file of files) {
      const filePath = path.join(dir, file);
      const module = await import(pathToFileURL(filePath).href)
      const command: Command = module.default ?? module.command;
      if (!command?.data || !command?.execute) continue;

      commands.set(command.data.name, command);
      loaded++;
    }
    return { total, loaded, commands };
  } catch (err:any) {
    logger.error(err);
    return {
      total: 0,
      loaded: 0,
      commands: new Map<string, Command>(),
    };
  }
}

export async function CollectEvents(
  dir: string
): Promise<{
  total: number
  loaded: number
  events: Map<string, Event>
}> {
  try {
    const events = new Map<string, Event>()
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"))

    const total = files.length
    let loaded = 0

    for (const file of files) {
      const filePath = path.join(dir, file)
      const module = await import(pathToFileURL(filePath).href)
      const event: Event = module.default ?? module.event
      if (!event?.name || !event?.execute) continue

      events.set(event.name, event)
      loaded++
    }

    return { total, loaded, events }
  } catch (err:any) {
    logger.error(err)
    return { total: 0, loaded: 0, events: new Map() }
  }
}
