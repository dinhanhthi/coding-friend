import { checkbox, confirm, select } from "@inquirer/prompts";
import chalk from "chalk";
import { homedir } from "os";
import { log } from "../lib/log.js";
import { claudeLocalSettingsPath, claudeSettingsPath } from "../lib/paths.js";
import {
  STATIC_RULES,
  getAllRules,
  getExistingRules,
  applyPermissions,
  groupByCategory,
  cleanupStalePluginRules,
  logPluginScriptWarning,
} from "../lib/permissions.js";
import type { PermissionRule } from "../lib/permissions.js";

const TAG_COLORS: Record<string, (s: string) => string> = {
  "[read-only]": chalk.green,
  "[modify]": chalk.yellow,
  "[write]": chalk.yellow,
  "[remote]": chalk.red,
  "[execute]": chalk.magenta,
  "[network]": chalk.magenta,
};

/**
 * Color the description: tag gets a color, "Used by" part is dim.
 */
function colorDescription(desc: string): string {
  const parts = desc.split(" · ");
  const main = parts[0];
  const usedBy =
    parts.length > 1 ? chalk.dim("· " + parts.slice(1).join(" · ")) : "";

  // Color the [tag] prefix
  const tagMatch = main.match(/^(\[[^\]]+\])\s*(.*)/);
  if (tagMatch) {
    const colorFn = TAG_COLORS[tagMatch[1]] ?? chalk.cyan;
    return `${colorFn(tagMatch[1])} ${tagMatch[2]} ${usedBy}`;
  }
  return `${main} ${usedBy}`;
}

/**
 * Resolve which settings file to use based on flags or interactive prompt.
 */
async function resolveSettingsPath(opts: {
  user?: boolean;
  project?: boolean;
}): Promise<{ path: string; label: string; scope: string }> {
  if (opts.user && opts.project) {
    log.error("Cannot use both --user and --project. Pick one.");
    process.exit(1);
  }

  if (opts.user) {
    const p = claudeSettingsPath();
    return { path: p, label: p.replace(homedir(), "~"), scope: "user" };
  }

  if (opts.project) {
    const p = claudeLocalSettingsPath();
    return { path: p, label: p.replace(homedir(), "~"), scope: "project" };
  }

  // Interactive: ask user
  if (!process.stdin.isTTY) {
    // Non-interactive: default to project
    const p = claudeLocalSettingsPath();
    return { path: p, label: p.replace(homedir(), "~"), scope: "project" };
  }

  const scope = await select({
    message: "Where should permissions be saved?",
    choices: [
      {
        name: "Project — .claude/settings.local.json (this project only, gitignored)",
        value: "project" as const,
      },
      {
        name: "User — ~/.claude/settings.json (all projects)",
        value: "user" as const,
      },
    ],
  });

  const p = scope === "user" ? claudeSettingsPath() : claudeLocalSettingsPath();
  return { path: p, label: p.replace(homedir(), "~"), scope };
}

/**
 * Interactive category → permissions two-step flow.
 * Returns the final set of selected managed rule strings.
 */
async function interactiveFlow(
  allRules: PermissionRule[],
  existing: string[],
): Promise<{ toAdd: string[]; toRemove: string[] }> {
  const groups = groupByCategory(allRules);
  const allRuleStrings = allRules.map((r) => r.rule);
  const managedExisting = existing.filter((r) => allRuleStrings.includes(r));

  // Track current state: start with what's already configured
  const enabled = new Set(managedExisting);

  console.log(
    chalk.dim(
      "Full reference: https://cf.dinhanhthi.com/docs/reference/permissions/",
    ),
  );
  console.log();

  let browsing = true;
  while (browsing) {
    // Build category menu
    const categoryChoices: Array<{
      name: string;
      value: string;
    }> = [];

    for (const [category, rules] of groups) {
      const configured = rules.filter((r) => enabled.has(r.rule)).length;
      const total = rules.length;
      let suffix: string;
      if (configured === total)
        suffix = chalk.green(`${configured}/${total} ✓`);
      else if (configured > 0) suffix = chalk.yellow(`${configured}/${total}`);
      else suffix = chalk.dim(`0/${total}`);
      categoryChoices.push({
        name: `${category} (${suffix})`,
        value: category,
      });
    }

    categoryChoices.push({
      name: chalk.green("→ Apply changes"),
      value: "__apply__",
    });

    const chosen = await select({
      message: "Select a category to configure:",
      choices: categoryChoices,
    });

    if (chosen === "__apply__") {
      browsing = false;
      continue;
    }

    // Show permissions in the selected category
    const categoryRules = groups.get(chosen)!;
    const selected = await checkbox({
      message: `${chosen} permissions:`,
      choices: categoryRules.map((rule) => ({
        name: rule.rule,
        value: rule.rule,
        checked: enabled.has(rule.rule),
        description: colorDescription(rule.description),
      })),
    });

    // Update enabled set for this category
    for (const rule of categoryRules) {
      if (selected.includes(rule.rule)) {
        enabled.add(rule.rule);
      } else {
        enabled.delete(rule.rule);
      }
    }
  }

  // Compute diff
  const toAdd = [...enabled].filter((r) => !existing.includes(r));
  const toRemove = managedExisting.filter((r) => !enabled.has(r));
  return { toAdd, toRemove };
}

export async function permissionCommand(opts: {
  all?: boolean;
  user?: boolean;
  project?: boolean;
}): Promise<void> {
  console.log("=== 🌿 Coding Friend Permissions 🌿 ===");
  console.log();

  // Resolve scope
  const {
    path: settingsPath,
    label: settingsLabel,
    scope,
  } = await resolveSettingsPath(opts);

  const existing = getExistingRules(settingsPath);
  const allRules = getAllRules();
  const allRuleStrings = allRules.map((r) => r.rule);

  // Track which existing rules are managed by us (in our registry)
  const managedExisting = existing.filter((r) => allRuleStrings.includes(r));
  const unmanagedExisting = existing.filter((r) => !allRuleStrings.includes(r));

  log.dim(`Settings: ${settingsLabel} (${scope})`);
  log.dim(
    `Current: ${managedExisting.length}/${allRules.length} Coding Friend rules configured`,
  );
  if (unmanagedExisting.length > 0) {
    log.dim(
      `(${unmanagedExisting.length} other permission rules will not be touched)`,
    );
  }
  console.log();

  if (opts.all) {
    // Non-interactive: apply all recommended rules
    const recommended = allRules.filter((r) => r.recommended);
    const toAdd = recommended
      .map((r) => r.rule)
      .filter((r) => !existing.includes(r));

    if (toAdd.length === 0) {
      log.success("All recommended permissions already configured.");
      return;
    }

    // Count by tier
    const staticSet = new Set(STATIC_RULES.map((r) => r.rule));
    const staticCount = toAdd.filter((r) => staticSet.has(r)).length;
    const pluginCount = toAdd.length - staticCount;

    console.log(
      `Adding ${chalk.bold(toAdd.length)} recommended permissions${pluginCount > 0 ? ` (${staticCount} static + ${pluginCount} plugin scripts)` : ""}:`,
    );
    for (const r of toAdd) {
      console.log(`  ${chalk.green("+")} ${r}`);
    }

    // Warn about wide plugin script rule
    if (pluginCount > 0) {
      console.log();
      logPluginScriptWarning(log, chalk);
    }
    console.log();

    const ok =
      !process.stdin.isTTY ||
      (await confirm({
        message: `Apply ${toAdd.length} permission rules to ${settingsLabel}?`,
        default: true,
      }));
    if (!ok) {
      log.dim("Skipped.");
      return;
    }

    applyPermissions(settingsPath, toAdd, []);

    // Clean up stale old-format per-script rules
    const cleaned = cleanupStalePluginRules(settingsPath);
    if (cleaned > 0) {
      log.dim(`Removed ${cleaned} stale old-format plugin rules.`);
    }

    log.success(`Added ${toAdd.length} permission rules to ${settingsLabel}.`);
    return;
  }

  // Interactive: two-step category → permissions flow
  const { toAdd, toRemove } = await interactiveFlow(allRules, existing);

  if (toAdd.length === 0 && toRemove.length === 0) {
    log.dim("No changes.");
    return;
  }

  // Show summary
  console.log();
  if (toAdd.length > 0) {
    console.log(chalk.green(`Adding ${toAdd.length} rules:`));
    for (const r of toAdd) {
      console.log(`  ${chalk.green("+")} ${r}`);
    }
  }
  if (toRemove.length > 0) {
    console.log(chalk.red(`Removing ${toRemove.length} rules:`));
    for (const r of toRemove) {
      console.log(`  ${chalk.red("-")} ${r}`);
    }
  }
  console.log();

  const ok = await confirm({
    message: `Apply changes to ${settingsLabel}?`,
    default: true,
  });

  if (!ok) {
    log.dim("Skipped.");
    return;
  }

  applyPermissions(settingsPath, toAdd, toRemove);
  log.success(
    `Done — added ${toAdd.length}, removed ${toRemove.length} rules in ${settingsLabel}.`,
  );
}
