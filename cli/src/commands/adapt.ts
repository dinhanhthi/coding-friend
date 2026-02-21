import { log } from "../lib/log.js";
import { loadConfig } from "../lib/config.js";
import {
  findPluginRoot,
  generatePlatformFiles,
  writeGeneratedFiles,
  ADAPTABLE_PLATFORMS,
} from "../lib/adapters.js";
import type { PlatformId } from "../adapters/types.js";
import type { InstallScope } from "../adapters/types.js";

interface AdaptOptions {
  global?: boolean;
  platform?: string;
  dryRun?: boolean;
}

export async function adaptCommand(opts: AdaptOptions): Promise<void> {
  const config = loadConfig();
  const scope: InstallScope = opts.global ? "global" : "local";
  const projectRoot = process.cwd();

  // Find plugin root
  const pluginRoot = findPluginRoot();
  if (!pluginRoot) {
    log.error("Could not find coding-friend plugin installation.");
    log.dim("Install via: /plugin marketplace add dinhanhthi/coding-friend");
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
    log.error("No platforms configured. Run 'cf init' first to select platforms.");
    process.exit(1);
  }

  log.step(`Generating ${scope} files for: ${platformIds.join(", ")}`);

  if (opts.dryRun) {
    log.info("Dry run — showing what would be generated:");
  }

  const results = await generatePlatformFiles(
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
      log.dim(`${result.platform}: no files to generate`);
      continue;
    }

    if (opts.dryRun) {
      log.info(`${result.platform}:`);
      for (const f of result.files) {
        log.dim(`  → ${f.path}${f.merge ? " (merge)" : ""}`);
      }
    } else {
      const written = writeGeneratedFiles(result.files);
      log.success(`${result.platform}: ${written.length} file(s) written`);
      for (const f of written) {
        log.dim(`  → ${f}`);
      }
    }
  }
}
