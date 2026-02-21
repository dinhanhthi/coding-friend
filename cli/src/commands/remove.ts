import { log } from "../lib/log.js";
import { loadConfig } from "../lib/config.js";
import {
  findPluginRoot,
  removePlatformFiles,
  ADAPTABLE_PLATFORMS,
} from "../lib/adapters.js";
import type { PlatformId, InstallScope } from "../adapters/types.js";
import { confirm } from "@inquirer/prompts";

interface RemoveOptions {
  global?: boolean;
  platform?: string;
  yes?: boolean;
}

export async function removeCommand(opts: RemoveOptions): Promise<void> {
  const config = loadConfig();
  const scope: InstallScope = opts.global ? "global" : "local";
  const projectRoot = process.cwd();

  const pluginRoot = findPluginRoot();
  if (!pluginRoot) {
    log.error("Could not find coding-friend plugin installation.");
    process.exit(1);
  }

  // Determine platforms
  let platformIds: PlatformId[];

  if (opts.platform) {
    if (!ADAPTABLE_PLATFORMS.includes(opts.platform as any)) {
      log.error(`Unknown platform: ${opts.platform}`);
      log.dim(`Available: ${ADAPTABLE_PLATFORMS.join(", ")}`);
      process.exit(1);
    }
    platformIds = [opts.platform as PlatformId];
  } else if (config.platforms && config.platforms.length > 0) {
    platformIds = config.platforms.filter(
      (p): p is PlatformId => p !== "claude-code",
    );
  } else {
    platformIds = [...ADAPTABLE_PLATFORMS];
  }

  log.step(`Removing ${scope} coding-friend files for: ${platformIds.join(", ")}`);

  if (!opts.yes) {
    const ok = await confirm({
      message: `Remove coding-friend files from ${platformIds.length} platform(s)?`,
      default: false,
    });
    if (!ok) {
      log.dim("Cancelled.");
      return;
    }
  }

  const results = await removePlatformFiles(
    platformIds,
    scope,
    projectRoot,
    pluginRoot,
    config,
  );

  for (const result of results) {
    if (result.warnings.length > 0) {
      for (const w of result.warnings) {
        log.warn(`${result.platform}: ${w}`);
      }
    }

    if (result.files.length === 0) {
      log.dim(`${result.platform}: no files found`);
      continue;
    }

    log.success(`${result.platform}: ${result.files.length} file(s) removed`);
    for (const f of result.files) {
      log.dim(`  → ${f.path} ${f.content}`);
    }
  }
}
