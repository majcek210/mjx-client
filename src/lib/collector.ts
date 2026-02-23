import path from "path";
import { scanDirectory } from "./scanner.js";
import logger from "./logger.js";
import type { Command, Event, Button } from "../types.js";

export async function collectCommands(dir: string): Promise<{
  total: number;
  loaded: number;
  commands: Map<string, Command>;
}> {
  const commands = new Map<string, Command>();
  const files = scanDirectory(dir);
  let loaded = 0;

  for (const file of files) {
    try {
      const mod = await import(file.fileUrl) as Record<string, unknown>;
      const command = (mod.default ?? mod.command) as Command | undefined;
      if (!command?.data || !command?.execute) {
        logger.warn(`Skipping ${file.relativePath}: missing data or execute`);
        continue;
      }
      commands.set(command.data.name, command);
      loaded++;
    } catch (err: unknown) {
      logger.error(`Failed to load command ${file.relativePath}:`, err);
    }
  }

  return { total: files.length, loaded, commands };
}

export async function collectEvents(dir: string): Promise<{
  total: number;
  loaded: number;
  events: Map<string, Event>;
}> {
  const events = new Map<string, Event>();
  const files = scanDirectory(dir);
  let loaded = 0;

  for (const file of files) {
    try {
      const mod = await import(file.fileUrl) as Record<string, unknown>;
      const event = (mod.default ?? mod.event) as Event | undefined;
      if (!event?.name || !event?.execute) {
        logger.warn(`Skipping ${file.relativePath}: missing name or execute`);
        continue;
      }
      events.set(String(event.name), event);
      loaded++;
    } catch (err: unknown) {
      logger.error(`Failed to load event ${file.relativePath}:`, err);
    }
  }

  return { total: files.length, loaded, events };
}

export async function collectButtons(dir: string): Promise<{
  total: number;
  loaded: number;
  buttons: Map<string, Button>;
}> {
  const buttons = new Map<string, Button>();
  const files = scanDirectory(dir);
  let loaded = 0;

  for (const file of files) {
    try {
      const mod = await import(file.fileUrl) as Record<string, unknown>;
      const button = (mod.default ?? mod.button) as Button | undefined;
      if (!button?.customId || !button?.execute) {
        logger.warn(`Skipping ${file.relativePath}: missing customId or execute`);
        continue;
      }
      buttons.set(button.customId, button);
      loaded++;
    } catch (err: unknown) {
      logger.error(`Failed to load button ${file.relativePath}:`, err);
    }
  }

  return { total: files.length, loaded, buttons };
}

export interface CollectAllResult {
  commands: Map<string, Command>;
  events: Map<string, Event>;
  buttons: Map<string, Button>;
  counts: {
    commands: { total: number; loaded: number };
    events: { total: number; loaded: number };
    buttons: { total: number; loaded: number };
  };
}

export async function collectAll(appDir: string): Promise<CollectAllResult> {
  const [cmdResult, evtResult, btnResult] = await Promise.all([
    collectCommands(path.join(appDir, "commands")),
    collectEvents(path.join(appDir, "events")),
    collectButtons(path.join(appDir, "buttons")),
  ]);

  return {
    commands: cmdResult.commands,
    events: evtResult.events,
    buttons: btnResult.buttons,
    counts: {
      commands: { total: cmdResult.total, loaded: cmdResult.loaded },
      events: { total: evtResult.total, loaded: evtResult.loaded },
      buttons: { total: btnResult.total, loaded: btnResult.loaded },
    },
  };
}
