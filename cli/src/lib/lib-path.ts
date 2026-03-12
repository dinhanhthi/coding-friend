import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve path to a lib package (learn-host, learn-mcp, or cf-memory).
 * Lives at cli/lib/<name> in both development and production.
 */
export function getLibPath(
  name: "learn-host" | "learn-mcp" | "cf-memory",
): string {
  // Production (bundled): __dirname = dist/ → ../lib/<name>
  const bundled = join(__dirname, "..", "lib", name);
  if (existsSync(bundled)) return bundled;

  // Development (tsx): __dirname = src/lib/ → ../../lib/<name>
  const dev = join(__dirname, "..", "..", "lib", name);
  if (existsSync(dev)) return dev;

  throw new Error(
    `Could not find lib/${name}. Ensure it exists in the CLI package.`,
  );
}
