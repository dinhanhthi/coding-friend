/**
 * Lazy dependency installer for Phase 3 (SQLite + Hybrid Search).
 *
 * Heavy deps (better-sqlite3, sqlite-vec, @huggingface/transformers) are installed
 * into ~/.coding-friend/memory/node_modules/ — NOT bundled with the CLI package.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

/** Dependencies required for Tier 1 (SQLite + Hybrid Search) */
export const SQLITE_DEPS: Record<string, string> = {
  "better-sqlite3": "^11.0.0",
  "sqlite-vec": "^0.1.6",
};

export const EMBEDDING_DEPS: Record<string, string> = {
  "@huggingface/transformers": "^3.4.0",
};

export const ALL_DEPS = { ...SQLITE_DEPS, ...EMBEDDING_DEPS };

export interface DepsManifest {
  version: number;
  installed: Record<string, string>;
  installedAt: string;
}

const MANIFEST_VERSION = 1;

/**
 * Get the base directory for lazy-installed deps.
 */
export function getDepsDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp";
  return path.join(home, ".coding-friend", "memory");
}

/**
 * Get the path to the deps manifest file.
 */
export function getManifestPath(depsDir?: string): string {
  return path.join(depsDir ?? getDepsDir(), "deps.json");
}

/**
 * Read the current deps manifest.
 */
export function readManifest(depsDir?: string): DepsManifest | null {
  const manifestPath = getManifestPath(depsDir);
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Write the deps manifest.
 */
function writeManifest(manifest: DepsManifest, depsDir?: string): void {
  const dir = depsDir ?? getDepsDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getManifestPath(dir), JSON.stringify(manifest, null, 2));
}

/**
 * Check if a specific set of deps are installed and up-to-date.
 */
export function areDepsInstalled(
  deps: Record<string, string>,
  depsDir?: string,
): boolean {
  const dir = depsDir ?? getDepsDir();
  const manifest = readManifest(dir);
  if (!manifest || manifest.version !== MANIFEST_VERSION) return false;

  for (const [pkg, version] of Object.entries(deps)) {
    const installedVersion = manifest.installed[pkg];
    if (!installedVersion) return false;

    // Semver caret range check:
    // ^x.y.z (x>0): same major  →  ^11.0.0 accepts 11.x.x
    // ^0.y.z (y>0): same major+minor  →  ^0.1.6 accepts 0.1.x
    // ^0.0.z: exact  →  ^0.0.3 accepts only 0.0.3
    const requiredParts = version.replace(/^\^/, "").split(".");
    const installedParts = installedVersion.split(".");

    if (requiredParts[0] !== "0") {
      // Major > 0: check major version matches
      if (requiredParts[0] !== installedParts[0]) return false;
    } else if (requiredParts[1] !== "0") {
      // ^0.y.z: check major + minor match
      if (requiredParts[0] !== installedParts[0]) return false;
      if (requiredParts[1] !== installedParts[1]) return false;
    } else {
      // ^0.0.z: exact match required
      if (installedVersion !== version.replace(/^\^/, "")) return false;
    }

    // Also check that the module actually exists on disk
    const modulePath = path.join(dir, "node_modules", pkg);
    if (!fs.existsSync(modulePath)) return false;
  }

  return true;
}

/**
 * Check if SQLite deps are available (quick check for tier detection).
 */
export function areSqliteDepsAvailable(depsDir?: string): boolean {
  return areDepsInstalled(SQLITE_DEPS, depsDir);
}

/**
 * Check if embedding deps are available.
 */
export function areEmbeddingDepsAvailable(depsDir?: string): boolean {
  return areDepsInstalled(EMBEDDING_DEPS, depsDir);
}

export interface InstallOptions {
  onProgress?: (message: string) => void;
  depsDir?: string;
  sqliteOnly?: boolean;
}

/**
 * Ensure all required deps are installed. Installs missing ones.
 *
 * Returns true if all deps are available after this call.
 */
export async function ensureDeps(opts?: InstallOptions): Promise<boolean> {
  const dir = opts?.depsDir ?? getDepsDir();
  const deps = opts?.sqliteOnly ? SQLITE_DEPS : ALL_DEPS;
  const progress = opts?.onProgress ?? (() => {});

  if (areDepsInstalled(deps, dir)) {
    return true;
  }

  progress("Checking build tools...");

  // Verify npm is available
  try {
    execFileSync("npm", ["--version"], { stdio: "ignore" });
  } catch {
    progress("Error: npm not found. Please install Node.js >= 18.");
    return false;
  }

  // Create directory structure
  fs.mkdirSync(dir, { recursive: true });

  // Create a minimal package.json if it doesn't exist
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    fs.writeFileSync(
      pkgPath,
      JSON.stringify(
        {
          name: "cf-memory-deps",
          version: "1.0.0",
          private: true,
          description: "Lazy-installed dependencies for cf-memory Tier 1",
        },
        null,
        2,
      ),
    );
  }

  // Build npm install args: ["install", "--save", "pkg1@ver1", "pkg2@ver2"]
  const installArgs = ["install", "--save"];
  for (const [name, version] of Object.entries(deps)) {
    installArgs.push(`${name}@${version}`);
  }

  progress(`Installing dependencies: ${Object.keys(deps).join(", ")}...`);

  try {
    execFileSync("npm", installArgs, {
      cwd: dir,
      stdio: "pipe",
      timeout: 300_000, // 5 minutes
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown installation error";
    progress(`Installation failed: ${message}`);
    return false;
  }

  // Read actual installed versions from node_modules
  const installed: Record<string, string> = {};
  for (const pkg of Object.keys(deps)) {
    try {
      const pkgJsonPath = path.join(dir, "node_modules", pkg, "package.json");
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
      installed[pkg] = pkgJson.version;
    } catch {
      progress(`Warning: Could not read installed version for ${pkg}`);
    }
  }

  // Write manifest
  const manifest: DepsManifest = {
    version: MANIFEST_VERSION,
    installed,
    installedAt: new Date().toISOString(),
  };
  writeManifest(manifest, dir);

  progress("Dependencies installed successfully.");
  return true;
}

/**
 * Synchronously load a lazily-installed CJS module (e.g., better-sqlite3).
 */
export function loadDepSync<T = unknown>(
  moduleName: string,
  depsDir?: string,
): T {
  const dir = depsDir ?? getDepsDir();
  const modulePath = path.join(dir, "node_modules", moduleName);

  if (!fs.existsSync(modulePath)) {
    throw new Error(
      `Dependency "${moduleName}" not installed. Run "cf memory init" first.`,
    );
  }

  const require = createRequire(path.join(dir, "package.json"));
  return require(moduleName) as T;
}

/**
 * Dynamically import a lazily-installed ESM module (e.g., @huggingface/transformers).
 */
export async function loadDepAsync<T = unknown>(
  moduleName: string,
  depsDir?: string,
): Promise<T> {
  const dir = depsDir ?? getDepsDir();
  const modulePath = path.join(dir, "node_modules", moduleName);

  if (!fs.existsSync(modulePath)) {
    throw new Error(
      `Dependency "${moduleName}" not installed. Run "cf memory init" first.`,
    );
  }

  // Find the main entry point from package.json
  const pkgJsonPath = path.join(modulePath, "package.json");
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));

  // Try: exports → module → main
  const entry =
    typeof pkgJson.exports === "string"
      ? pkgJson.exports
      : (pkgJson.exports?.["."]?.import ??
        pkgJson.exports?.["."]?.default ??
        pkgJson.exports?.["."] ??
        pkgJson.module ??
        pkgJson.main ??
        "index.js");

  const entryPath = path.join(modulePath, entry);
  return (await import(entryPath)) as T;
}
