import fs from "fs";
import path from "path";
import type { Command } from "../client";
import logger from "./logger";

export async function CollectCommands(dir: string): Promise<{
    total: number;
    loaded: number;
    commands: Map<string, Command>;
}> {
    
    const commands = new Map<string, Command>();
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".ts") || f.endsWith(".js"));
    const total = files.length;
    let loaded = 0;

    for (const file of files) {
        const filePath = path.join(dir, file);
        const module = await import(filePath);
        const command: Command = module.command;
        if (!command?.data || !command?.execute) continue;

        commands.set(command.data.name, command);
        loaded++;
    }

    return { total, loaded, commands };
}
