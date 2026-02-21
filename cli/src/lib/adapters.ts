import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  chmodSync,
  readdirSync,
  unlinkSync,
} from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { getAdapter, detectPlatforms, ADAPTABLE_PLATFORMS } from "../adapters/registry.js";
import { parseAllSkills } from "../adapters/core/skill-compiler.js";
import { parseAllHooks } from "../adapters/core/hooks-compiler.js";
import { removeSection } from "../adapters/core/rules-builder.js";
import { SECTION_MARKER_START } from "../adapters/types.js";
import type {
  PlatformId,
  InstallScope,
  GeneratedFile,
  GenerateOptions,
} from "../adapters/types.js";
import type { CodingFriendConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Plugin root resolution
// ---------------------------------------------------------------------------

/**
 * Find the coding-friend plugin root.
 * Looks for the plugin cache or falls back to a git-cloned location.
 */
export function findPluginRoot(): string | null {
  const home = homedir();

  // Check plugin marketplace cache
  const cachePath = join(
    home,
    ".claude",
    "plugins",
    "cache",
    "coding-friend-marketplace",
    "coding-friend",
  );

  if (existsSync(cachePath)) {
    const versions = readdirSync(cachePath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .reverse();

    if (versions.length > 0) {
      return join(cachePath, versions[0]);
    }
  }

  // Check common git clone locations
  const gitPaths = [
    join(home, "git", "coding-friend"),
    join(home, "projects", "coding-friend"),
    join(home, "dev", "coding-friend"),
  ];

  for (const p of gitPaths) {
    if (existsSync(join(p, "skills")) && existsSync(join(p, "hooks"))) {
      return p;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Generate files for platforms
// ---------------------------------------------------------------------------

export interface AdaptResult {
  platform: string;
  files: GeneratedFile[];
  warnings: string[];
}

/**
 * Generate platform files for the given platforms and scope.
 */
export async function generatePlatformFiles(
  platformIds: PlatformId[],
  scope: InstallScope,
  projectRoot: string,
  pluginRoot: string,
  config: CodingFriendConfig,
): Promise<AdaptResult[]> {
  const skills = parseAllSkills(join(pluginRoot, "skills"));
  const hooks = parseAllHooks(pluginRoot);

  const options: GenerateOptions = {
    pluginRoot,
    projectRoot,
    skills,
    hooks,
    config,
  };

  const results: AdaptResult[] = [];

  for (const id of platformIds) {
    if (id === "claude-code") continue;

    const adapter = await getAdapter(id);
    const warnings: string[] = [];

    if (scope === "global" && !adapter.supportsGlobalInstall()) {
      warnings.push(
        `${adapter.name} does not support global installation. Use "cf init" (local) instead.`,
      );
      results.push({ platform: adapter.name, files: [], warnings });
      continue;
    }

    const files = adapter.generate(scope, options);
    results.push({ platform: adapter.name, files, warnings });
  }

  return results;
}

/**
 * Write generated files to disk.
 */
export function writeGeneratedFiles(files: GeneratedFile[]): string[] {
  const written: string[] = [];

  for (const file of files) {
    const dir = dirname(file.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(file.path, file.content, "utf-8");

    // Make shell scripts executable
    if (file.path.endsWith(".sh")) {
      chmodSync(file.path, 0o755);
    }

    written.push(file.path);
  }

  return written;
}

/**
 * Remove coding-friend files for given platforms.
 */
export async function removePlatformFiles(
  platformIds: PlatformId[],
  scope: InstallScope,
  projectRoot: string,
  pluginRoot: string,
  config: CodingFriendConfig,
): Promise<AdaptResult[]> {
  const skills = parseAllSkills(join(pluginRoot, "skills"));
  const hooks = parseAllHooks(pluginRoot);

  const options: GenerateOptions = {
    pluginRoot,
    projectRoot,
    skills,
    hooks,
    config,
  };

  const results: AdaptResult[] = [];

  for (const id of platformIds) {
    if (id === "claude-code") continue;

    const adapter = await getAdapter(id);
    const outputPaths = adapter.getOutputPaths(scope, options);
    const warnings: string[] = [];
    const removed: GeneratedFile[] = [];

    for (const filePath of outputPaths) {
      if (!existsSync(filePath)) continue;

      const content = readFileSync(filePath, "utf-8");
      if (content.includes(SECTION_MARKER_START)) {
        const cleaned = removeSection(content);
        if (cleaned !== null) {
          writeFileSync(filePath, cleaned, "utf-8");
          removed.push({ path: filePath, content: "[section removed]" });
        }
      } else {
        unlinkSync(filePath);
        removed.push({ path: filePath, content: "[deleted]" });
      }
    }

    results.push({ platform: adapter.name, files: removed, warnings });
  }

  return results;
}

export { detectPlatforms, ADAPTABLE_PLATFORMS };
