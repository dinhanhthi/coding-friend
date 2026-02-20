import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";

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
