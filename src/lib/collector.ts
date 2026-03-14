import path from "path";
import { pathToFileURL } from "url";
import { SlashCommandBuilder } from "discord.js";
import { scanDirectory } from "./scanner.js";
import logger from "./logger.js";
import type { Command, Event, Button, Modal, SelectMenu, Subcommand, CommandGroup, ErrorHandler } from "../types.js";

// ---------------------------------------------------------------------------
// Path → customId helpers
// ---------------------------------------------------------------------------

/** Derives a customId pattern from a scanned file's relative path.
 *
 *  Transforms applied in order:
 *    1. Normalise Windows separators
 *    2. Strip .js extension
 *    3. Strip trailing /index  (leaf filename)
 *    4. Strip (group)/ segments (transparent organisational folders)
 *    5. [...rest] → ...rest   (catch-all segment)
 *    6. [param]   → :param    (dynamic segment)
 *
 *  e.g. "(admin)/order/confirm/[size]/[base]/index.js" → "order/confirm/:size/:base"
 *  e.g. "log/[...rest]/index.js"                       → "log/...rest"
 */
function pathToCustomId(relativePath: string): string {
  return relativePath
    .replace(/\\/g, "/")
    .replace(/\.js$/, "")
    .replace(/\/index$/, "")
    .replace(/\([^)]+\)\//g, "")
    .replace(/\[\.\.\.([^\]]+)\]/g, "...$1")
    .replace(/\[([^\]]+)\]/g, ":$1");
}

/** Validates a derived customId pattern at load time.
 *  Returns the pattern unchanged, or null + a warning if invalid:
 *    - empty string (e.g. a lone (group)/index.ts at the root)
 *    - catch-all segment is not the last segment
 */
function validatedCustomId(customId: string, relativePath: string): string | null {
  if (customId === "") {
    logger.warn(`Skipping ${relativePath}: derived customId is empty`);
    return null;
  }
  const parts = customId.split("/");
  const catchAllIndex = parts.findIndex(p => p.startsWith("..."));
  if (catchAllIndex !== -1 && catchAllIndex !== parts.length - 1) {
    logger.warn(
      `Skipping ${relativePath}: catch-all segment must be the last segment` +
      ` (got "${customId}")`
    );
    return null;
  }
  return customId;
}

// ---------------------------------------------------------------------------
// Specificity sorting
// ---------------------------------------------------------------------------

/** Score for a single pattern: higher = less specific.
 *  Static segments = 0, dynamic (:param) = 1, catch-all (...rest) = 100.
 */
function patternScore(pattern: string): number {
  return pattern.split("/").reduce((n, p) =>
    n + (p.startsWith("...") ? 100 : p.startsWith(":") ? 1 : 0), 0
  );
}

/** Return a new Map with entries sorted from most-specific to least-specific.
 *  Ties are broken by segment count descending (longer static prefix wins).
 */
function sortBySpecificity<T>(map: Map<string, T>): Map<string, T> {
  return new Map(
    [...map.entries()].sort(([a], [b]) => {
      const diff = patternScore(a) - patternScore(b);
      return diff !== 0 ? diff : b.split("/").length - a.split("/").length;
    })
  );
}

// ---------------------------------------------------------------------------
// Depth helpers for command routing
// ---------------------------------------------------------------------------

/** Split a relative path into its logical segments, ignoring (group) folders.
 *  e.g. "(admin)/ping/index.js" → ["ping", "index.js"]  (depth 2)
 *  e.g. "settings/volume/index.js" → ["settings", "volume", "index.js"] (depth 3)
 */
function logicalParts(relativePath: string): string[] {
  return relativePath
    .replace(/\\/g, "/")
    .split("/")
    .filter(p => !/^\([^)]+\)$/.test(p));
}

// ---------------------------------------------------------------------------
// Generic interaction handler collector
// ---------------------------------------------------------------------------

/** Shared loader for Button, Modal, and SelectMenu directories.
 *  Each file must export a default (or named `modKey`) with an `execute` fn.
 *  customId is taken from the export's `customId` field if present, otherwise
 *  derived from the file path via pathToCustomId.
 */
async function collectInteractionHandlers<
  T extends { customId?: string; execute: unknown }
>(
  dir: string,
  modKey: string,
  label: string,
): Promise<{ total: number; loaded: number; handlers: Map<string, T> }> {
  const raw = new Map<string, T>();
  const files = scanDirectory(dir);
  let loaded = 0;

  for (const file of files) {
    try {
      const mod = await import(file.fileUrl) as Record<string, unknown>;
      const handler = (mod.default ?? mod[modKey]) as Partial<T> | undefined;
      if (!handler?.execute) {
        logger.warn(`Skipping ${file.relativePath}: missing execute`);
        continue;
      }
      const derived = handler.customId ?? pathToCustomId(file.relativePath);
      const customId = validatedCustomId(derived, file.relativePath);
      if (customId === null) continue;
      raw.set(customId, { ...handler, customId } as T);
      loaded++;
    } catch (err: unknown) {
      logger.error(`Failed to load ${label} ${file.relativePath}:`, err);
    }
  }

  return { total: files.length, loaded, handlers: sortBySpecificity(raw) };
}

// ---------------------------------------------------------------------------
// Public collectors
// ---------------------------------------------------------------------------

export async function collectCommands(dir: string): Promise<{
  total: number;
  loaded: number;
  commands: Map<string, Command>;
}> {
  const commands = new Map<string, Command>();
  const files = scanDirectory(dir);
  if (files.length === 0) return { total: 0, loaded: 0, commands };

  let loaded = 0;

  // Classify files using logical depth (route groups stripped from count).
  //   depth 2: "ping/index.js" or "(admin)/ping/index.js"  → regular command or group parent
  //   depth 3: "settings/volume/index.js"                  → subcommand
  type FileEntry = { file: (typeof files)[number]; lp: string[] };
  const depth2: FileEntry[] = [];
  const depth3: FileEntry[] = [];

  for (const file of files) {
    const lp = logicalParts(file.relativePath);
    if (lp.length === 2) depth2.push({ file, lp });
    else if (lp.length === 3) depth3.push({ file, lp });
    else logger.warn(`Skipping ${file.relativePath}: subcommand groups (3+ levels) are not yet supported`);
  }

  // Which logical parent names have subcommand children?
  const subcommandParents = new Set(depth3.map(({ lp }) => lp[0]!));

  // --- Regular commands & optional group metadata (depth 2) ---
  const parentDescriptions = new Map<string, string>();

  for (const { file, lp } of depth2) {
    const folderName = lp[0]!;
    try {
      const mod = await import(file.fileUrl) as Record<string, unknown>;
      const exported = mod.default ?? mod.command;

      if (subcommandParents.has(folderName)) {
        // Treat as CommandGroup metadata (description only)
        const group = exported as Partial<CommandGroup> | undefined;
        parentDescriptions.set(folderName, group?.description ?? `${folderName} commands`);
      } else {
        const command = exported as Partial<Command> | undefined;
        if (!command?.data || !command?.execute) {
          logger.warn(`Skipping ${file.relativePath}: missing data or execute`);
          continue;
        }
        commands.set(command.data.name, command as Command);
        loaded++;
      }
    } catch (err: unknown) {
      logger.error(`Failed to load command ${file.relativePath}:`, err);
    }
  }

  // --- Subcommands: group by parent folder (depth 3) ---
  const subsByParent = new Map<string, Array<{ file: (typeof files)[number] }>>();
  for (const { file, lp } of depth3) {
    const parentName = lp[0]!;
    if (!subsByParent.has(parentName)) subsByParent.set(parentName, []);
    subsByParent.get(parentName)!.push({ file });
  }

  for (const [parentFolder, subs] of subsByParent) {
    const description = parentDescriptions.get(parentFolder) ?? `${parentFolder} commands`;
    const builder = new SlashCommandBuilder()
      .setName(parentFolder)
      .setDescription(description);

    const subHandlers = new Map<string, Subcommand>();

    for (const { file } of subs) {
      try {
        const mod = await import(file.fileUrl) as Record<string, unknown>;
        const sub = (mod.default ?? mod.subcommand) as Partial<Subcommand> | undefined;
        if (!sub?.data || !sub?.execute) {
          logger.warn(`Skipping ${file.relativePath}: missing data or execute`);
          continue;
        }
        builder.addSubcommand(sub.data);
        subHandlers.set(sub.data.name, sub as Subcommand);
        loaded++;
      } catch (err: unknown) {
        logger.error(`Failed to load subcommand ${file.relativePath}:`, err);
      }
    }

    const hasAutocomplete = [...subHandlers.values()].some(s => s.autocomplete);

    const command: Command = {
      data: builder as unknown as Command["data"],
      async execute(interaction) {
        const subName = interaction.options.getSubcommand();
        const handler = subHandlers.get(subName);
        if (!handler) {
          logger.warn(`No handler for subcommand /${parentFolder} ${subName}`);
          return;
        }
        await handler.execute(interaction);
      },
      ...(hasAutocomplete ? {
        async autocomplete(interaction) {
          const subName = interaction.options.getSubcommand();
          await subHandlers.get(subName)?.autocomplete?.(interaction);
        },
      } : {}),
    };

    commands.set(parentFolder, command);
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
  total: number; loaded: number; buttons: Map<string, Button>;
}> {
  const { total, loaded, handlers } = await collectInteractionHandlers<Button>(dir, "button", "button");
  return { total, loaded, buttons: handlers };
}

export async function collectModals(dir: string): Promise<{
  total: number; loaded: number; modals: Map<string, Modal>;
}> {
  const { total, loaded, handlers } = await collectInteractionHandlers<Modal>(dir, "modal", "modal");
  return { total, loaded, modals: handlers };
}

export async function collectSelectMenus(dir: string): Promise<{
  total: number; loaded: number; selectMenus: Map<string, SelectMenu>;
}> {
  const { total, loaded, handlers } = await collectInteractionHandlers<SelectMenu>(dir, "selectMenu", "select menu");
  return { total, loaded, selectMenus: handlers };
}

export interface CollectAllResult {
  commands: Map<string, Command>;
  events: Map<string, Event>;
  buttons: Map<string, Button>;
  modals: Map<string, Modal>;
  selectMenus: Map<string, SelectMenu>;
  errorHandler: ErrorHandler | undefined;
  counts: {
    commands: { total: number; loaded: number };
    events: { total: number; loaded: number };
    buttons: { total: number; loaded: number };
    modals: { total: number; loaded: number };
    selectMenus: { total: number; loaded: number };
  };
}

/** Tries to load `{appDir}/error.js` as an ErrorHandler.
 *  Returns undefined silently if the file doesn't exist.
 *  Logs a warning if the file exists but is missing `execute`.
 */
export async function collectErrorHandler(appDir: string): Promise<ErrorHandler | undefined> {
  const errorFile = path.join(appDir, "error.js");
  const errorUrl = pathToFileURL(errorFile).href;
  try {
    const mod = await import(errorUrl) as Record<string, unknown>;
    const handler = (mod.default ?? mod.errorHandler) as Partial<ErrorHandler> | undefined;
    if (!handler?.execute) {
      logger.warn("error.ts found but missing execute function — skipping");
      return undefined;
    }
    return handler as ErrorHandler;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ERR_MODULE_NOT_FOUND") {
      logger.error("Failed to load error handler:", err);
    }
    return undefined;
  }
}

export async function collectAll(appDir: string): Promise<CollectAllResult> {
  const [cmdResult, evtResult, btnResult, modResult, selResult, errorHandler] = await Promise.all([
    collectCommands(path.join(appDir, "commands")),
    collectEvents(path.join(appDir, "events")),
    collectButtons(path.join(appDir, "buttons")),
    collectModals(path.join(appDir, "modals")),
    collectSelectMenus(path.join(appDir, "select-menus")),
    collectErrorHandler(appDir),
  ]);

  return {
    commands: cmdResult.commands,
    events: evtResult.events,
    buttons: btnResult.buttons,
    modals: modResult.modals,
    selectMenus: selResult.selectMenus,
    errorHandler,
    counts: {
      commands: { total: cmdResult.total, loaded: cmdResult.loaded },
      events: { total: evtResult.total, loaded: evtResult.loaded },
      buttons: { total: btnResult.total, loaded: btnResult.loaded },
      modals: { total: modResult.total, loaded: modResult.loaded },
      selectMenus: { total: selResult.total, loaded: selResult.loaded },
    },
  };
}
