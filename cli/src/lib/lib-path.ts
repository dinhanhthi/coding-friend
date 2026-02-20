import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve path to a bundled lib package (learn-host or learn-mcp).
 *
 * Search order:
 * 1. cli/lib/<name> — bundled with the npm package (production)
 * 2. ../lib/<name>   — sibling in the repo (local development)
 */
export function getLibPath(name: "learn-host" | "learn-mcp"): string {
  // Production: bundled inside cli/lib/
  const bundled = join(__dirname, "..", "..", "lib", name);
  if (existsSync(bundled)) return bundled;

  // Dev: sibling directory in repo root
  const sibling = join(__dirname, "..", "..", "..", "lib", name);
  if (existsSync(sibling)) return sibling;

  throw new Error(
    `Could not find lib/${name}. Ensure it exists in the CLI package or repo.`,
  );
}
