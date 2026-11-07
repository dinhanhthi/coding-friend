import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  renameSync,
  rmSync,
  statSync,
  chmodSync,
  realpathSync,
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
 * stays intact. Follows a symlinked target (rename would otherwise replace the
 * link itself) and keeps an existing file's mode.
 */
export function writeJsonAtomic(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const target = existsSync(filePath) ? realpathSync(filePath) : filePath;
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : undefined;
  const tmp = join(
    dirname(target),
    `.${basename(target)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", {
      encoding: "utf-8",
      mode,
    });
    if (mode !== undefined) chmodSync(tmp, mode); // umask may strip bits
    renameSync(tmp, target);
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
