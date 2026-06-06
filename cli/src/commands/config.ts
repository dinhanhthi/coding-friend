import { checkbox, confirm, input, select } from "@inquirer/prompts";
import chalk from "chalk";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { readJson, mergeJson } from "../lib/json.js";
import { log, printBanner } from "../lib/log.js";
import { resolveLearnDir } from "../lib/config.js";
import { listMdFilesRecursive } from "../lib/fs-utils.js";
import { registerLearnMcp, unregisterLearnMcp } from "../lib/learn-prompts.js";
import {
  claudeLocalSettingsPath,
  claudeProjectSettingsPath,
  claudeSettingsPath,
  globalConfigPath,
  localConfigPath,
  resolvePath,
} from "../lib/paths.js";
import {
  DEFAULT_CONFIG,
  ALL_COMPONENT_IDS,
  type CodingFriendConfig,
  type LearnCategory,
} from "../types.js";
import {
  BACK,
  injectBackChoice,
  askScope,
  showConfigHint,
  getScopeLabel,
  formatScopeLabel,
  getMergedValue,
  applyDocsDirChange,
} from "../lib/prompt-utils.js";
import { run } from "../lib/exec.js";
import {
  findStatuslineHookPath,
  isStatuslineConfigured,
  selectStatuslineComponents,
  saveStatuslineConfig,
  writeStatuslineSettings,
  getCurrentAccountEmail,
  loadStatuslineAlias,
  saveStatuslineAlias,
  promptAccountAlias,
} from "../lib/statusline.js";
import {
  hasShellCompletion,
  ensureShellCompletion,
  removeShellCompletion,
} from "../lib/shell-completion.js";
import { getAllRules, getExistingRules } from "../lib/permissions.js";
import { memoryConfigMenu } from "../lib/memory-prompts.js";

// ─── Helpers ──────────────────────────────────────────────────────────

function writeToScope(
  scope: "global" | "local",
  data: Record<string, unknown>,
): void {
  const targetPath =
    scope === "global" ? globalConfigPath() : localConfigPath();
  mergeJson(targetPath, data);
  log.success(`Saved to ${targetPath}`);
}

/**
 * Write a nested sub-field to the chosen scope, preserving other fields in the section.
 */
function writeNestedField(
  section: "learn" | "memory" | "review",
  scope: "global" | "local",
  field: string,
  value: unknown,
): void {
  const targetPath =
    scope === "global" ? globalConfigPath() : localConfigPath();
  const existingConfig = readJson<CodingFriendConfig>(targetPath);
  const existingSection =
    (existingConfig?.[section] as Record<string, unknown>) ?? {};
  const updated = { ...existingSection, [field]: value };
  mergeJson(targetPath, { [section]: updated });
  log.success(`Saved to ${targetPath}`);
}

function writeLearnField(
  scope: "global" | "local",
  field: string,
  value: unknown,
): void {
  writeNestedField("learn", scope, field, value);
}

// ─── Option Editors ───────────────────────────────────────────────────

async function editDocsDir(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = getMergedValue("docsDir", globalCfg, localCfg) as
    | string
    | undefined;
  if (currentValue) {
    log.dim(`Current: ${currentValue}`);
  }

  const value = await input({
    message: "Docs folder name:",
    default: currentValue ?? DEFAULT_CONFIG.docsDir,
    validate: (val) => {
      if (!val) return "Folder name cannot be empty";
      if (val.includes("/") || val.includes("\\"))
        return "Must be a folder name, not a path (no slashes)";
      return true;
    },
  });

  const scope = await askScope();
  if (scope === "back") return;
  applyDocsDirChange(value, currentValue, scope);
  writeToScope(scope, { docsDir: value });
}

async function editLanguage(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = getMergedValue("language", globalCfg, localCfg) as
    | string
    | undefined;
  if (currentValue) {
    log.dim(`Current: ${currentValue}`);
  }

  const choice = await select({
    message: "What language should generated docs be written in?",
    choices: injectBackChoice(
      [
        { name: "English", value: "en" },
        { name: "Vietnamese", value: "vi" },
        { name: "Other", value: "_other" },
      ],
      "Back",
    ),
  });

  if (choice === BACK) return;

  let lang = choice;
  if (choice === "_other") {
    lang = await input({ message: "Enter language name:" });
    if (!lang) lang = "en";
  }

  const scope = await askScope();
  if (scope === "back") return;
  writeToScope(scope, { language: lang });
}

// ─── Learn Sub-menu ───────────────────────────────────────────────────

async function editLearnOutputDir(
  globalCfg: CodingFriendConfig | null,
): Promise<void> {
  const defaultLearnDir = DEFAULT_CONFIG.learn.outputDir;
  const oldOutputDir = globalCfg?.learn?.outputDir ?? defaultLearnDir;
  log.dim(`Current: ${oldOutputDir}`);

  const hasDistinctCurrent = oldOutputDir !== defaultLearnDir;
  const locationChoices: { name: string; value: string }[] = [];
  if (hasDistinctCurrent) {
    locationChoices.push({
      name: `Keep global (${oldOutputDir})`,
      value: "current",
    });
  }
  locationChoices.push({
    name: `Use default (${defaultLearnDir})`,
    value: "default",
  });
  locationChoices.push({ name: "Custom path…", value: "custom" });

  const locationChoice = await select({
    message: "Where to store learning docs?",
    choices: locationChoices,
  });

  let newOutputDir = defaultLearnDir;
  if (locationChoice === "current") {
    newOutputDir = oldOutputDir;
  } else if (locationChoice === "custom") {
    newOutputDir = await input({
      message: "Enter path (absolute or ~/...):",
      default: oldOutputDir !== defaultLearnDir ? oldOutputDir : undefined,
      validate: (val) => {
        if (val.length === 0) return "Path cannot be empty";
        if (!val.startsWith("/") && !val.startsWith("~/"))
          return "Path must be absolute (e.g. /home/user/learn) or start with ~/ (e.g. ~/learn)";
        return true;
      },
    });
    const resolved = resolvePath(newOutputDir);
    if (!existsSync(resolved)) {
      const create = await confirm({
        message: `Folder ${resolved} doesn't exist. Create it?`,
        default: true,
      });
      if (create) {
        mkdirSync(resolved, { recursive: true });
        log.success(`Created ${resolved}`);
      }
    }
  }

  const oldResolved = resolvePath(oldOutputDir);
  const newResolved = resolvePath(newOutputDir);

  // Always save new outputDir to global config
  writeLearnField("global", "outputDir", newOutputDir);

  if (oldResolved !== newResolved) {
    // Offer to migrate docs if old path has .md files
    const mdFiles = existsSync(oldResolved)
      ? listMdFilesRecursive(oldResolved)
      : [];
    if (mdFiles.length > 0) {
      const doMove = await confirm({
        message: `Found ${mdFiles.length} learning doc(s) in ${oldResolved}. Move entire folder to ${newResolved}? (overwrites any existing files at target)`,
        default: true,
      });
      if (doMove) {
        const existingAtTarget = existsSync(newResolved)
          ? listMdFilesRecursive(newResolved)
          : [];
        if (existingAtTarget.length > 0) {
          const doOverwrite = await confirm({
            message: `${newResolved} already contains ${existingAtTarget.length} file(s). Overwrite them?`,
            default: false,
          });
          if (!doOverwrite) {
            log.dim("Move cancelled. Config saved with new path.");
            return;
          }
        }
        mkdirSync(newResolved, { recursive: true });
        cpSync(oldResolved, newResolved, { recursive: true });
        rmSync(oldResolved, { recursive: true, force: true });
        log.success(
          `Moved ${mdFiles.length} doc(s) from ${oldResolved} to ${newResolved}.`,
        );
      }
    }

    // Re-register MCP with new path (unless learn is disabled)
    if (!globalCfg?.learn?.disabled) {
      unregisterLearnMcp();
      const registered = registerLearnMcp(newResolved);
      if (registered) {
        log.success(
          `Updated CF Learn MCP to point to ${newResolved}. Restart Claude Code to apply.`,
        );
      } else {
        log.warn(
          `Could not re-register MCP. Run manually:\n  claude mcp add --scope user coding-friend-learn -- npx -y coding-friend-cli mcp-serve-learn ${newResolved}`,
        );
      }
    }
  }
}

async function editLearnLanguage(
  globalCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = globalCfg?.learn?.language;
  if (currentValue) {
    log.dim(`Current: ${currentValue}`);
  }

  const choice = await select({
    message: "What language should /cf-learn notes be written in?",
    choices: injectBackChoice(
      [
        { name: "English", value: "en" },
        { name: "Vietnamese", value: "vi" },
        { name: "Other", value: "_other" },
      ],
      "Back",
    ),
  });

  if (choice === BACK) return;

  let lang = choice;
  if (choice === "_other") {
    lang = await input({ message: "Enter language name:" });
    if (!lang) lang = "en";
  }

  writeLearnField("global", "language", lang);
}

async function editLearnCategories(
  globalCfg: CodingFriendConfig | null,
): Promise<void> {
  const existingCats = globalCfg?.learn?.categories as
    | LearnCategory[]
    | undefined;

  const defaultCats = DEFAULT_CONFIG.learn.categories;
  const defaultNames = defaultCats.map((c) => c.name).join(", ");

  const catChoices: { name: string; value: string }[] = [
    { name: `Use defaults (${defaultNames})`, value: "defaults" },
  ];
  // Only offer the global value when it actually differs from the defaults —
  // otherwise the two options look identical and are confusing.
  if (
    existingCats &&
    existingCats.length > 0 &&
    JSON.stringify(existingCats) !== JSON.stringify(defaultCats)
  ) {
    const existingNames = existingCats.map((c) => c.name).join(", ");
    catChoices.push({
      name: `Keep global (${existingNames})`,
      value: "existing",
    });
  }
  catChoices.push({ name: "Customize", value: "custom" });

  const catChoice = await select({
    message: "Categories for organizing learning docs?",
    choices: catChoices,
  });

  let categories = DEFAULT_CONFIG.learn.categories;
  if (catChoice === "existing" && existingCats) {
    categories = existingCats;
  } else if (catChoice === "custom") {
    console.log();
    if (existingCats && existingCats.length > 0) {
      console.log("Global categories:");
      for (const c of existingCats) {
        log.dim(`  ${c.name}: ${c.description}`);
      }
      console.log();
    }
    console.log(
      'Enter categories (format: "name: description"). Empty line to finish.',
    );
    console.log();
    const customCats: LearnCategory[] = [];
    let keepGoing = true;
    while (keepGoing) {
      const line = await input({
        message: `Category ${customCats.length + 1}:`,
      });
      if (!line) {
        keepGoing = false;
      } else {
        const [name, ...descParts] = line.split(":");
        customCats.push({
          name: name.trim(),
          description: descParts.join(":").trim() || name.trim(),
        });
      }
    }
    if (customCats.length > 0) categories = customCats;
  }

  writeLearnField("global", "categories", categories);
}

async function editLearnAutoCommit(
  globalCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = globalCfg?.learn?.autoCommit;
  if (currentValue !== undefined) {
    log.dim(`Current: ${currentValue}`);
  }
  log.dim(
    "Note: auto-commit only works if your learn folder is a git repository.",
  );

  const value = await confirm({
    message: "Auto-commit learning docs to git after each /cf-learn?",
    default: currentValue ?? false,
  });

  writeLearnField("global", "autoCommit", value);
}

async function editLearnReadmeIndex(
  globalCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = globalCfg?.learn?.readmeIndex as
    | boolean
    | "per-category"
    | undefined;
  if (currentValue !== undefined) {
    log.dim(`Current: ${currentValue}`);
  }

  const indexChoice = await select({
    message: "How should learning docs be indexed?",
    choices: [
      { name: "No index", value: "none" },
      { name: "Single README at root", value: "single" },
      { name: "Per-category READMEs", value: "per-category" },
    ],
  });

  let readmeIndex: boolean | "per-category" = false;
  if (indexChoice === "single") readmeIndex = true;
  else if (indexChoice === "per-category") readmeIndex = "per-category";

  writeLearnField("global", "readmeIndex", readmeIndex);
}

async function editLearnDisabled(
  globalCfg: CodingFriendConfig | null,
): Promise<void> {
  const current = globalCfg?.learn?.disabled ?? false;
  log.dim(`Current: ${current ? "disabled" : "enabled"}`);
  const value = await confirm({
    message: current
      ? "CF Learn is disabled. Re-enable it? (resumes file writing and re-registers MCP)"
      : "Disable CF Learn? (stops file writing and MCP serving)",
    default: !current,
  });
  writeLearnField("global", "disabled", value ? !current : current);

  if (!current && value) {
    // disabling
    const unregistered = unregisterLearnMcp();
    if (unregistered) {
      log.dim(
        "Removed coding-friend-learn from Claude Code MCP. Restart Claude Code to apply.",
      );
    } else {
      log.warn(
        "Could not unregister MCP automatically. Run manually:\n  claude mcp remove --scope user coding-friend-learn",
      );
    }
  } else if (current && value) {
    // re-enabling
    const freshGlobal = readJson<CodingFriendConfig>(globalConfigPath());
    const learnDir = resolveLearnDir(freshGlobal);
    registerLearnMcp(learnDir);
    log.dim(
      "Re-registered coding-friend-learn. Restart Claude Code to activate.",
    );
  }
}

async function learnSubMenu(): Promise<void> {
  while (true) {
    const globalCfg = readJson<CodingFriendConfig>(globalConfigPath());

    const outputDirVal =
      globalCfg?.learn?.outputDir ?? DEFAULT_CONFIG.learn.outputDir;
    const langVal = globalCfg?.learn?.language;
    const autoCommitVal = globalCfg?.learn?.autoCommit;
    const readmeVal = globalCfg?.learn?.readmeIndex;
    const catsVal = (
      globalCfg?.learn?.categories ?? DEFAULT_CONFIG.learn.categories
    )
      .map((c) => c.name)
      .join(", ");
    const isDisabled = globalCfg?.learn?.disabled ?? false;

    const disabledLabel = isDisabled ? chalk.yellow(" [disabled]") : "";
    const choice = await select({
      message: `Learn settings${disabledLabel}:`,
      choices: injectBackChoice(
        [
          {
            name: `Output dir (${outputDirVal})`,
            value: "outputDir",
          },
          {
            name: `Language${langVal ? ` (${langVal})` : ""}`,
            value: "language",
          },
          {
            name: `Categories (${catsVal})`,
            value: "categories",
          },
          {
            name: `Auto-commit${autoCommitVal !== undefined ? ` (${autoCommitVal})` : ""}`,
            value: "autoCommit",
          },
          {
            name: `README index${readmeVal !== undefined ? ` (${readmeVal})` : ""}`,
            value: "readmeIndex",
          },
          {
            name: isDisabled ? "Enable CF Learn" : "Disable CF Learn",
            value: "disabled",
          },
        ],
        "Back",
      ),
    });

    if (choice === BACK) return;

    switch (choice) {
      case "outputDir":
        await editLearnOutputDir(globalCfg);
        break;
      case "language":
        await editLearnLanguage(globalCfg);
        break;
      case "categories":
        await editLearnCategories(globalCfg);
        break;
      case "autoCommit":
        await editLearnAutoCommit(globalCfg);
        break;
      case "readmeIndex":
        await editLearnReadmeIndex(globalCfg);
        break;
      case "disabled":
        await editLearnDisabled(globalCfg);
        break;
    }
  }
}

// ─── Plan Docs ───────────────────────────────────────────────────────

async function editDisableGUIPlan(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = getMergedValue("disableGUIPlan", globalCfg, localCfg) as
    | boolean
    | undefined;
  if (currentValue !== undefined) {
    log.dim(`Current: ${currentValue}`);
  }

  const value = await confirm({
    message:
      "Disable the human overview doc that /cf-plan generates alongside the agent plan?",
    default: currentValue ?? false,
  });

  const scope = await askScope();
  if (scope === "back") return;
  writeToScope(scope, { disableGUIPlan: value });
}

async function editGuiPlanFormat(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = getMergedValue(
    "guiPlanFormat",
    globalCfg,
    localCfg,
  ) as "html" | "md" | undefined;
  if (currentValue !== undefined) {
    log.dim(`Current: ${currentValue}`);
  }

  const choice = await select({
    message: "Format for the /cf-plan human overview doc?",
    choices: injectBackChoice(
      [
        { name: "HTML", value: "html" },
        { name: "Markdown", value: "md" },
      ],
      "Back",
    ),
    default: currentValue ?? "html",
  });

  if (choice === BACK) return;

  const scope = await askScope();
  if (scope === "back") return;
  writeToScope(scope, { guiPlanFormat: choice as "html" | "md" });
}

async function planDocsSubMenu(): Promise<void> {
  while (true) {
    const globalCfg = readJson<CodingFriendConfig>(globalConfigPath());
    const localCfg = readJson<CodingFriendConfig>(localConfigPath());

    const disableVal = getMergedValue(
      "disableGUIPlan",
      globalCfg,
      localCfg,
    ) as boolean | undefined;
    const formatVal = getMergedValue(
      "guiPlanFormat",
      globalCfg,
      localCfg,
    ) as "html" | "md" | undefined;

    const choice = await select({
      message: "Plan docs settings:",
      choices: injectBackChoice(
        [
          {
            name: `Disable overview doc (${disableVal ?? false})`,
            value: "disableGUIPlan",
          },
          {
            name: `Format (${formatVal ?? "html"})`,
            value: "guiPlanFormat",
          },
        ],
        "Back",
      ),
    });

    if (choice === BACK) return;

    switch (choice) {
      case "disableGUIPlan":
        await editDisableGUIPlan(globalCfg, localCfg);
        break;
      case "guiPlanFormat":
        await editGuiPlanFormat(globalCfg, localCfg);
        break;
    }
  }
}

// ─── TDD ─────────────────────────────────────────────────────────────

async function editTdd(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = getMergedValue("tdd", globalCfg, localCfg) as
    | boolean
    | undefined;
  if (currentValue !== undefined) {
    log.dim(`Current: ${currentValue}`);
  }

  const value = await confirm({
    message:
      "Enable TDD by default? (writes failing tests before code — RED → GREEN → REFACTOR)",
    default: currentValue ?? false,
  });

  const scope = await askScope();
  if (scope === "back") return;
  writeToScope(scope, { tdd: value });
}

// ─── Review (Codex dual-review) ──────────────────────────────────────

async function editReviewWithCodex(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = (
    getMergedValue("review", globalCfg, localCfg) as
      | { withCodex?: boolean }
      | undefined
  )?.withCodex;
  if (currentValue !== undefined) {
    log.dim(`Current: ${currentValue}`);
  }
  log.dim("Note: requires the Codex CLI installed and logged in.");

  const value = await confirm({
    message:
      "Run a Codex second-opinion review alongside Claude's by default? (every /cf-review, including auto-invoked ones)",
    default: currentValue ?? false,
  });

  const scope = await askScope();
  if (scope === "back") return;
  writeNestedField("review", scope, "withCodex", value);
}

// ─── Auto-Approve ────────────────────────────────────────────────────

async function editAutoApprove(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = getMergedValue("autoApprove", globalCfg, localCfg) as
    | boolean
    | undefined;
  if (currentValue !== undefined) {
    log.dim(`Current: ${currentValue}`);
  }

  const value = await confirm({
    message:
      "Enable auto-approve? (auto-approves read-only tools + working-dir file edits, LLM classifier for unknowns)",
    default: currentValue ?? false,
  });

  const scope = await askScope();
  if (scope === "back") return;
  writeToScope(scope, { autoApprove: value });

  // Audit dangerous rules if auto-approve is being enabled
  if (value) {
    const { runDangerousRulesAudit } = await import("../lib/permissions.js");
    await runDangerousRulesAudit(
      [
        claudeProjectSettingsPath(),
        claudeLocalSettingsPath(),
        claudeSettingsPath(),
      ],
      log,
      (message) => confirm({ message, default: true }),
    );
    log.dim(
      "Tip: Fine-tune with autoApproveAllowExtra / autoApproveIgnore in config.json",
    );
    log.dim("Docs: https://cf.dinhanhthi.com/docs/reference/auto-approve/");
  }
}

// ─── Statusline ──────────────────────────────────────────────────────

async function editStatusline(): Promise<void> {
  const hookResult = findStatuslineHookPath();
  if (!hookResult) {
    log.error(
      "coding-friend plugin not found in cache. Install it first via Claude Code.",
    );
    return;
  }

  log.info(`Found plugin ${chalk.green(`v${hookResult.version}`)}`);

  if (isStatuslineConfigured()) {
    log.dim("Statusline already configured.");
    const overwrite = await confirm({
      message: "Reconfigure statusline?",
      default: true,
    });
    if (!overwrite) return;
  }

  const components = await selectStatuslineComponents();

  // Account alias (only if account component selected)
  let alias: string | undefined;
  if (components.includes("account")) {
    const email = getCurrentAccountEmail();
    if (email) {
      alias = await promptAccountAlias(email, loadStatuslineAlias(email));
      saveStatuslineAlias(email, alias);
    } else {
      log.dim("No account detected — skipping alias setup.");
    }
  }

  saveStatuslineConfig(components);
  writeStatuslineSettings(hookResult.hookPath);

  log.success("Statusline configured!");
  if (components.length < ALL_COMPONENT_IDS.length) {
    log.dim(`Showing: ${components.join(", ")}`);
  } else {
    log.dim("Showing all components.");
  }
  if (alias) {
    log.dim(`Account alias: ${alias}`);
  }
  log.dim("Restart Claude Code (or start a new session) to see it.");
}

// ─── .gitignore ──────────────────────────────────────────────────────

const GITIGNORE_START = "# >>> coding-friend managed";
const GITIGNORE_END = "# <<< coding-friend managed";

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function editGitignore(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const docsDir =
    (localCfg?.docsDir as string | undefined) ??
    (globalCfg?.docsDir as string | undefined) ??
    DEFAULT_CONFIG.docsDir;

  const allEntries = [
    `${docsDir}/plans/`,
    `${docsDir}/memory/`,
    `${docsDir}/research/`,
    `${docsDir}/sessions/`,
    `${docsDir}/reviews/`,
    `${docsDir}/context/`,
    `${docsDir}/warm/`,
    ".coding-friend/",
  ];

  const existing = existsSync(".gitignore")
    ? readFileSync(".gitignore", "utf-8")
    : "";

  const hasBlock =
    existing.includes(GITIGNORE_START) || existing.includes("# coding-friend");

  if (hasBlock) {
    log.dim(".gitignore already has a coding-friend block.");
  }

  const choice = await select({
    message: "Add coding-friend artifacts to .gitignore?",
    choices: injectBackChoice(
      [
        { name: "Yes, ignore all", value: "all" },
        { name: "Partial — pick which to ignore", value: "partial" },
        { name: "No — keep everything tracked", value: "none" },
      ],
      "Back",
    ),
  });

  if (choice === BACK) return;

  if (choice === "none") {
    log.dim("Skipped .gitignore config.");
    return;
  }

  let entries = allEntries;
  if (choice === "partial") {
    entries = await checkbox({
      message: "Which folders to ignore?",
      choices: allEntries.map((e) => ({ name: e, value: e })),
    });
    if (entries.length === 0) {
      log.dim("Nothing selected.");
      return;
    }
  }

  const block = `${GITIGNORE_START}\n${entries.join("\n")}\n${GITIGNORE_END}`;

  const managedBlockRe = new RegExp(
    `${escapeRegExp(GITIGNORE_START)}[\\s\\S]*?${escapeRegExp(GITIGNORE_END)}`,
  );
  const legacyBlockRe = /# coding-friend\n([\w/.]+\n)*/;

  let updated: string;
  if (managedBlockRe.test(existing)) {
    updated = existing.replace(managedBlockRe, block);
    log.success(`Updated .gitignore: ${entries.join(", ")}`);
  } else if (legacyBlockRe.test(existing)) {
    updated = existing.replace(legacyBlockRe, block);
    log.success(`Migrated .gitignore block: ${entries.join(", ")}`);
  } else {
    updated = existing.trimEnd() + "\n\n" + block + "\n";
    log.success(`Added to .gitignore: ${entries.join(", ")}`);
  }

  writeFileSync(".gitignore", updated);
}

// ─── Shell Completion ────────────────────────────────────────────────

async function editShellCompletion(): Promise<void> {
  const installed = hasShellCompletion();

  if (installed) {
    const choice = await select({
      message: "Shell tab completion is already installed.",
      choices: injectBackChoice(
        [
          { name: "Update to latest", value: "update" },
          { name: "Remove", value: "remove" },
        ],
        "Back",
      ),
    });

    if (choice === BACK) return;

    if (choice === "remove") {
      if (removeShellCompletion()) {
        log.success("Shell completion removed.");
      } else {
        log.warn("Could not remove shell completion.");
      }
      return;
    }

    ensureShellCompletion({ silent: false });
  } else {
    ensureShellCompletion({ silent: false });
  }
}

// ─── Permissions ─────────────────────────────────────────────────────

async function editPermissions(): Promise<void> {
  // Detect current state in both scopes
  const projectPath = claudeLocalSettingsPath();
  const userPath = claudeSettingsPath();
  const projectRules = getExistingRules(projectPath);
  const userRules = getExistingRules(userPath);
  const allRules = getAllRules();
  const allRuleStrings = allRules.map((r) => r.rule);

  const projectManaged = projectRules.filter((r) =>
    allRuleStrings.includes(r),
  ).length;
  const userManaged = userRules.filter((r) =>
    allRuleStrings.includes(r),
  ).length;

  console.log(
    chalk.dim(
      `  Project: ${projectManaged}/${allRules.length} rules · User: ${userManaged}/${allRules.length} rules`,
    ),
  );
  console.log();

  const choice = await select({
    message: "Permissions action:",
    choices: injectBackChoice(
      [
        {
          name: "Run full permission setup (interactive)",
          value: "interactive",
          description: "  Opens `cf permission` — pick categories and rules",
        },
        {
          name: "Apply all recommended (project scope)",
          value: "all-project",
          description:
            "  Quick: adds all recommended rules to .claude/settings.local.json",
        },
        {
          name: "Apply all recommended (user scope)",
          value: "all-user",
          description:
            "  Quick: adds all recommended rules to ~/.claude/settings.json",
        },
      ],
      "Back",
    ),
  });

  if (choice === BACK) return;

  // Dynamic import to avoid circular dependency
  const { permissionCommand } = await import("./permission.js");

  switch (choice) {
    case "interactive":
      await permissionCommand({});
      break;
    case "all-project":
      await permissionCommand({ all: true, project: true });
      break;
    case "all-user":
      await permissionCommand({ all: true, user: true });
      break;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────

export async function configCommand(): Promise<void> {
  console.log();
  printBanner("✨ Coding Friend Config ✨");
  console.log();

  showConfigHint();

  while (true) {
    const globalCfg = readJson<CodingFriendConfig>(globalConfigPath());
    const localCfg = readJson<CodingFriendConfig>(localConfigPath());

    const docsDirScope = getScopeLabel("docsDir", globalCfg, localCfg);
    const docsDirVal = getMergedValue("docsDir", globalCfg, localCfg) as
      | string
      | undefined;

    const langScope = getScopeLabel("language", globalCfg, localCfg);
    const langVal = getMergedValue("language", globalCfg, localCfg) as
      | string
      | undefined;

    const learnScope = getScopeLabel("learn", globalCfg, localCfg);
    const memoryScope = getScopeLabel("memory", globalCfg, localCfg);

    const tddScope = getScopeLabel("tdd", globalCfg, localCfg);
    const tddVal = getMergedValue("tdd", globalCfg, localCfg) as
      | boolean
      | undefined;

    const autoApproveScope = getScopeLabel("autoApprove", globalCfg, localCfg);
    const autoApproveVal = getMergedValue(
      "autoApprove",
      globalCfg,
      localCfg,
    ) as boolean | undefined;

    const reviewScope = getScopeLabel("review", globalCfg, localCfg);
    const withCodexVal = (
      getMergedValue("review", globalCfg, localCfg) as
        | { withCodex?: boolean }
        | undefined
    )?.withCodex;

    const planDocsScope = getScopeLabel("disableGUIPlan", globalCfg, localCfg);

    const statuslineStatus = isStatuslineConfigured()
      ? chalk.green("configured")
      : chalk.yellow("not configured");
    const completionStatus = hasShellCompletion()
      ? chalk.green("installed")
      : chalk.yellow("not installed");

    const projectRules = getExistingRules(claudeLocalSettingsPath());
    const userRules = getExistingRules(claudeSettingsPath());
    const allRules = getAllRules();
    const allRuleStrings = allRules.map((r) => r.rule);
    const configuredCount = new Set([
      ...projectRules.filter((r) => allRuleStrings.includes(r)),
      ...userRules.filter((r) => allRuleStrings.includes(r)),
    ]).size;
    const permissionStatus =
      configuredCount > 0
        ? chalk.green(`${configuredCount}/${allRules.length}`)
        : chalk.yellow(`0/${allRules.length}`);

    const choice = await select({
      message: "What to configure?",
      choices: injectBackChoice(
        [
          {
            name: `docsDir ${formatScopeLabel(docsDirScope)}${docsDirVal ? ` (${docsDirVal})` : ""}`,
            value: "docsDir",
            description:
              "  Top-level folder name for plans, memory, research, and sessions",
          },
          {
            name: `Docs language ${formatScopeLabel(langScope)}${langVal ? ` (${langVal})` : ""}`,
            value: "language",
            description:
              "  Language for /cf-plan, /cf-ask, /cf-remember generated docs",
          },
          {
            name: `Learn settings ${formatScopeLabel(learnScope)}`,
            value: "learn",
            description:
              "  Output dir, language, categories, auto-commit, README index",
          },
          {
            name: `Memory settings ${formatScopeLabel(memoryScope)}`,
            value: "memory",
            description: "  Tier, auto-capture, auto-start, embedding provider",
          },
          {
            name: `TDD ${formatScopeLabel(tddScope)}${tddVal !== undefined ? ` (${tddVal})` : ""}`,
            value: "tdd",
            description:
              "  Enable TDD (RED→GREEN→REFACTOR) by default for all implementations",
          },
          {
            name: `Auto-approve ${formatScopeLabel(autoApproveScope)}${autoApproveVal !== undefined ? ` (${autoApproveVal})` : ""}`,
            value: "autoApprove",
            description:
              "  Auto-approve safe tool calls, block destructive ones, prompt for ambiguous",
          },
          {
            name: `Codex dual-review ${formatScopeLabel(reviewScope)}${withCodexVal !== undefined ? ` (${withCodexVal})` : ""}`,
            value: "review",
            description:
              "  Run a Codex second-opinion review alongside Claude's on every /cf-review",
          },
          {
            name: `Plan docs ${formatScopeLabel(planDocsScope)}`,
            value: "planDocs",
            description:
              "  Human overview doc generated by /cf-plan — enable/disable + format (html/md)",
          },
          {
            name: `Statusline (${statuslineStatus})`,
            value: "statusline",
            description:
              "  Choose which components to show in the Claude Code statusline",
          },
          {
            name: `.gitignore`,
            value: "gitignore",
            description:
              "  Add or update coding-friend artifacts in .gitignore",
          },
          {
            name: `Permissions (${permissionStatus} rules)`,
            value: "permissions",
            description:
              "  Manage Claude Code permissions for Coding Friend skills and hooks",
          },
          {
            name: `Shell completion (${completionStatus})`,
            value: "completion",
            description:
              "  Install, update, or remove tab completion for the cf command",
          },
        ],
        "Exit",
      ),
    });

    if (choice === BACK) {
      process.exit(0);
    }

    switch (choice) {
      case "docsDir":
        await editDocsDir(globalCfg, localCfg);
        break;
      case "language":
        await editLanguage(globalCfg, localCfg);
        break;
      case "learn":
        await learnSubMenu();
        break;
      case "memory":
        await memoryConfigMenu();
        break;
      case "tdd":
        await editTdd(globalCfg, localCfg);
        break;
      case "autoApprove":
        await editAutoApprove(globalCfg, localCfg);
        break;
      case "review":
        await editReviewWithCodex(globalCfg, localCfg);
        break;
      case "planDocs":
        await planDocsSubMenu();
        break;
      case "statusline":
        await editStatusline();
        break;
      case "gitignore":
        await editGitignore(globalCfg, localCfg);
        break;
      case "permissions":
        await editPermissions();
        break;
      case "completion":
        await editShellCompletion();
        break;
    }

    console.log();
  }
}
