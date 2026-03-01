import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve path to a lib package (learn-host or learn-mcp).
 * Lives at cli/lib/<name> in both development and production.
 */
export function getLibPath(name: "learn-host" | "learn-mcp"): string {
  const libDir = join(__dirname, "..", "..", "lib", name);
  if (existsSync(libDir)) return libDir;

  throw new Error(
    `Could not find lib/${name}. Ensure it exists in the CLI package.`,
  );
}
