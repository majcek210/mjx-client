import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

export interface ScannedFile {
  absolutePath: string;
  relativePath: string;
  fileUrl: string;
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
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkDir(rootDir, fullPath, results);
    } else if (entry.isFile() && entry.name === "index.js") {
      results.push({
        absolutePath: fullPath,
        relativePath: path.relative(rootDir, fullPath),
        fileUrl: pathToFileURL(fullPath).href,
      });
    }
  }
}
