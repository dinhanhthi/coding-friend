import chalk from "chalk";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { join, resolve } from "path";

import { readJson } from "../lib/json.js";
import { log } from "../lib/log.js";
import { pluginCachePath, devStatePath } from "../lib/paths.js";

const GUIDE_TEMPLATE = `# Custom Guide for {{SKILL_NAME}}

<!-- Sections are optional — include only the ones you need. -->
<!-- This file is loaded automatically when the skill runs. -->

## Before

<!-- Steps to execute BEFORE the skill's first step. -->
<!-- Example: run a linter, check prerequisites, set up context. -->

## Rules

<!-- Additional rules to apply THROUGHOUT all steps of the skill. -->
<!-- Example: "always use TypeScript strict mode", "never modify tests in src/__tests__". -->

## After

<!-- Steps to execute AFTER the skill's final step. -->
<!-- Example: run a formatter, update a changelog, notify a channel. -->
`;

/**
 * Find the plugin skills directory — checks dev mode first, then plugin cache.
 */
function findPluginSkillsDir(): string | null {
  // 1. Dev mode: local path
  const devState = readJson<{ localPath: string }>(devStatePath());
  if (devState?.localPath) {
    const dir = join(devState.localPath, "plugin", "skills");
    if (existsSync(dir)) return dir;
  }

  // 2. Installed: plugin cache (find latest version dir)
  const cachePath = pluginCachePath();
  if (existsSync(cachePath)) {
    try {
      const versions = readdirSync(cachePath, { withFileTypes: true })
        .filter((e) => e.isDirectory() && /^\d/.test(e.name))
        .map((e) => e.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const ver of versions) {
        const dir = join(cachePath, ver, "plugin", "skills");
        if (existsSync(dir)) return dir;
      }
    } catch {
      // ignore read errors
    }
  }

  return null;
}

/**
 * Check if a skill exists in the plugin.
 */
function skillExists(skillsDir: string, skillName: string): boolean {
  return existsSync(join(skillsDir, skillName, "SKILL.md"));
}

/**
 * `cf guide create <skill-name>` — scaffold a custom guide file.
 */
export function guideCreateCommand(skillName: string): void {
  if (!/^[a-z0-9-]+$/.test(skillName)) {
    log.error(
      `Invalid skill name "${skillName}". Use lowercase letters, numbers, and hyphens only.`,
    );
    return;
  }

  const skillsDir = findPluginSkillsDir();

  if (!skillsDir || !skillExists(skillsDir, skillName)) {
    log.error(
      `Skill "${skillName}" not found. Run "cf guide list" to see available skills.`,
    );
    return;
  }

  const guideDir = resolve(".coding-friend", "skills", `${skillName}-custom`);
  const guidePath = join(guideDir, "SKILL.md");

  if (existsSync(guidePath)) {
    log.warn(`Custom guide already exists: ${guidePath}`);
    return;
  }

  mkdirSync(guideDir, { recursive: true });
  writeFileSync(
    guidePath,
    GUIDE_TEMPLATE.replace(/\{\{SKILL_NAME\}\}/g, skillName),
  );

  log.success(`Created custom guide: ${guidePath}`);
  log.dim("Edit the file to add your Before/Rules/After sections.");
}

/**
 * `cf guide list` — list existing custom guides.
 */
export function guideListCommand(): void {
  const customDir = resolve(".coding-friend", "skills");

  if (!existsSync(customDir)) {
    log.dim(
      "No custom guides found. Run `cf guide create <skill-name>` to create one.",
    );
    return;
  }

  const entries = readdirSync(customDir, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() &&
        e.name.endsWith("-custom") &&
        existsSync(join(customDir, e.name, "SKILL.md")),
    )
    .map((e) => e.name.replace(/-custom$/, ""));

  if (entries.length === 0) {
    log.dim(
      "No custom guides found. Run `cf guide create <skill-name>` to create one.",
    );
    return;
  }

  const skillsDir = findPluginSkillsDir();

  log.info(`Custom guides (${chalk.bold(entries.length)}):`);
  for (const name of entries) {
    const path = join(customDir, `${name}-custom`, "SKILL.md");
    const found = skillsDir != null && skillExists(skillsDir, name);
    const status = found ? chalk.green("✔") : chalk.yellow("⚠ skill not found");
    log.info(
      `  ${status}  ${chalk.cyan(name)}  ${chalk.dim("→")}  ${chalk.dim(path)}`,
    );
  }
}
