import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  fileUrl: string;
}

// Compiled output wins when a folder holds both, so a dist build never loads its sources.
// The TypeScript entries are for running an app directory straight from source (tsx, ts-node,
// or Node's own type stripping).
const EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"];

/** Returns the path of `<dir>/<basename>.<ext>` for the first extension that exists. */
export function findModule(dir: string, basename: string): string | undefined {
  for (const ext of EXTENSIONS) {
    const candidate = path.join(dir, basename + ext);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

export function scanDirectory(dir: string): ScannedFile[] {
  if (!fs.existsSync(dir)) return [];
  const results: ScannedFile[] = [];
  walkDir(dir, dir, results);
  return results;
}

function walkDir(rootDir: string, currentDir: string, results: ScannedFile[]): void {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      walkDir(rootDir, path.join(currentDir, entry.name), results);
    }
  }
  const index = findModule(currentDir, "index");
  if (index) {
    results.push({
      absolutePath: index,
      relativePath: path.relative(rootDir, index),
      fileUrl: pathToFileURL(index).href,
    });
  }
}
