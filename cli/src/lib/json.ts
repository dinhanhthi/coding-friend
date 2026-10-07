import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  rmSync,
} from "fs";
import { basename, dirname, join } from "path";

/**
 * Safely read and parse a JSON file. Returns null if file doesn't exist or is invalid.
 */
export function readJson<T = Record<string, unknown>>(
  filePath: string,
): T | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Write an object as JSON to a file, creating parent directories if needed.
 */
export function writeJson(
  filePath: string,
  data: Record<string, unknown>,
): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Write JSON atomically: write a temp file in the same directory, then rename
 * it over the target. On failure the temp file is removed and the old file
 * stays intact.
 */
export function writeJsonAtomic(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const tmp = join(
    dir,
    `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf-8");
    renameSync(tmp, filePath);
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // best effort
    }
    throw err;
  }
}

/**
 * Merge data into an existing JSON file (top-level key merge).
 * Creates the file if it doesn't exist.
 */
export function mergeJson(
  filePath: string,
  data: Record<string, unknown>,
): void {
  const existing = readJson(filePath) ?? {};
  writeJson(filePath, { ...existing, ...data });
}
