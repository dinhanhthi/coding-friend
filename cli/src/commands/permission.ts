import { checkbox, confirm, select } from "@inquirer/prompts";
import chalk from "chalk";
import { homedir } from "os";
import { log } from "../lib/log.js";
import { claudeLocalSettingsPath } from "../lib/paths.js";
import {
  PERMISSION_RULES,
  getExistingRules,
  applyPermissions,
  groupByCategory,
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
  const usedBy = parts.length === 2 ? chalk.dim("· " + parts[1]) : "";

  // Color the [tag] prefix
  const tagMatch = main.match(/^(\[[^\]]+\])\s*(.*)/);
  if (tagMatch) {
    const colorFn = TAG_COLORS[tagMatch[1]] ?? chalk.cyan;
    return `${colorFn(tagMatch[1])} ${tagMatch[2]} ${usedBy}`;
  }
  return `${main} ${usedBy}`;
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

  // eslint-disable-next-line no-constant-condition
  while (true) {
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

    if (chosen === "__apply__") break;

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
}): Promise<void> {
  console.log("=== 🌿 Coding Friend Permissions 🌿 ===");
  console.log();

  // Project-local settings — scoped to this project only
  const settingsPath = claudeLocalSettingsPath();
  const settingsLabel = settingsPath.replace(homedir(), "~");

  const existing = getExistingRules(settingsPath);
  const allRules = PERMISSION_RULES;
  const allRuleStrings = allRules.map((r) => r.rule);

  // Track which existing rules are managed by us (in our registry)
  const managedExisting = existing.filter((r) => allRuleStrings.includes(r));
  const unmanagedExisting = existing.filter((r) => !allRuleStrings.includes(r));

  log.dim(`Settings: ${settingsLabel} (project-local)`);
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

    console.log("Adding recommended permissions:");
    for (const r of toAdd) {
      console.log(`  ${chalk.green("+")} ${r}`);
    }
    console.log();

    applyPermissions(settingsPath, toAdd, []);
    log.success(`Added ${toAdd.length} permission rules.`);
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
    `Done — added ${toAdd.length}, removed ${toRemove.length} rules.`,
  );
}
