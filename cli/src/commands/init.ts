import { checkbox, confirm, input, select } from "@inquirer/prompts";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import chalk from "chalk";
import { run } from "../lib/exec.js";
import { mergeJson, readJson, writeJson } from "../lib/json.js";
import { getLibPath } from "../lib/lib-path.js";
import {
  getExistingRules,
  getMissingRules,
  buildLearnDirRules,
  applyPermissions,
} from "../lib/permissions.js";
import { log } from "../lib/log.js";
import {
  claudeSettingsPath,
  globalConfigPath,
  localConfigPath,
  resolvePath,
} from "../lib/paths.js";
import {
  hasShellCompletion,
  ensureShellCompletion,
} from "../lib/shell-completion.js";
import {
  findStatuslineHookPath,
  isStatuslineConfigured,
  selectStatuslineComponents,
  saveStatuslineConfig,
  writeStatuslineSettings,
} from "../lib/statusline.js";
import { commandExists } from "../lib/exec.js";
import {
  DEFAULT_CONFIG,
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
  ensureDocsFolders,
} from "../lib/prompt-utils.js";

const GITIGNORE_START = "# >>> coding-friend managed";
const GITIGNORE_END = "# <<< coding-friend managed";

// ─── Banner & Step UI ─────────────────────────────────────────────────

const em = chalk.hex("#10b981"); // emerald
const dk = chalk.hex("#064e3b"); // dark green

function printBanner(): void {
  console.log();
  console.log(em("  ╭───────────────────────╮"));
  console.log(
    em("  │  ") +
      "✦" +
      em(" ") +
      chalk.bold.white("Coding Friend") +
      em("  ✦   │"),
  );
  console.log(em("  │    ") + chalk.dim("Setup Wizard") + em("       │"));
  console.log(em("  ╰────────────╮──────────╯"));
  console.log(em("               ╰─▸"));
  console.log();
}

let _stepIndex = 0;

function printStepHeader(label: string, description?: string): void {
  _stepIndex++;
  const line = chalk.hex("#10b981")("─".repeat(44));
  console.log();
  console.log(`${line}`);
  console.log(
    `${em("🔶")} ${chalk.bold.hex("#f59e0b")(`Step ${_stepIndex}`)}  ${chalk.dim(label)}`,
  );
  if (description) {
    console.log(`     ${chalk.dim(description)}`);
  }
  console.log(`${line}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────

function isGitRepo(): boolean {
  return run("git", ["rev-parse", "--is-inside-work-tree"]) === "true";
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasGitignoreBlock(): boolean {
  if (!existsSync(".gitignore")) return false;
  const content = readFileSync(".gitignore", "utf-8");
  return (
    content.includes(GITIGNORE_START) || content.includes("# coding-friend")
  );
}

/**
 * Pad a scope/status label to a consistent visible width for alignment.
 */
function paddedScopeLabel(scope: string): string {
  const label = formatScopeLabel(scope);
  // visible lengths: [-]=3, [both]=6, [done]=6, [skip]=6, [local]=7, [global]=8
  const visibleLen = scope.length + 2;
  return label + " ".repeat(Math.max(1, 9 - visibleLen));
}

/**
 * Detect and display project setup status (folders + settings).
 */
function printSetupStatus(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
  gitAvailable: boolean,
): {
  allDone: boolean;
  notLocalCount: number;
  notConfiguredCount: number;
  missingFolders: number;
} {
  const docsDir = getDocsDir(globalCfg, localCfg);
  const subfolders = ["plans", "memory", "research", "learn", "sessions"];

  // ── Folders ──
  const folderStatus = subfolders.map((sub) => ({
    name: `${docsDir}/${sub}`,
    exists: existsSync(`${docsDir}/${sub}`),
  }));
  const foldersReady = folderStatus.filter((f) => f.exists).length;
  const missingFolders = subfolders.length - foldersReady;
  const allFoldersDone = missingFolders === 0;

  const countColor = allFoldersDone ? chalk.green : chalk.yellow;
  console.log(
    `  ${chalk.bold("Folders")} ${countColor(`(${foldersReady}/${subfolders.length})`)}:`,
  );
  for (const f of folderStatus) {
    const icon = f.exists ? chalk.green("✓") : chalk.red("✗");
    const name = f.exists ? chalk.dim(f.name) : f.name;
    console.log(`    ${icon} ${name}`);
  }
  console.log();

  // ── Settings ──
  const configKeys = [
    { key: "docsDir", label: "Docs folder" },
    { key: "language", label: "Docs language" },
    { key: "learn", label: "/cf-learn config" },
  ];

  let notLocalCount = 0;
  let notConfiguredCount = 0;

  console.log(`  ${chalk.bold("Settings")}:`);
  for (const s of configKeys) {
    const scope = getScopeLabel(s.key, globalCfg, localCfg);
    const value = getMergedValue(s.key, globalCfg, localCfg);
    const valueStr =
      value && typeof value === "string" ? ` (${chalk.dim(value)})` : "";
    console.log(`    ${paddedScopeLabel(scope)}${s.label}${valueStr}`);

    if (scope === "-") notConfiguredCount++;
    if (scope === "-" || scope === "global") notLocalCount++;
  }

  // ── Setup items ──
  const setupItems = [
    {
      label: ".gitignore",
      done: !gitAvailable || hasGitignoreBlock(),
      skipped: !gitAvailable,
    },
    { label: "Shell completion", done: hasShellCompletion(), skipped: false },
    { label: "Statusline", done: isStatuslineConfigured(), skipped: false },
    { label: "CF Memory MCP", done: isMemoryMcpConfigured(), skipped: false },
  ];

  for (const item of setupItems) {
    if (item.skipped) {
      console.log(`    ${paddedScopeLabel("skip")}${item.label}`);
    } else if (item.done) {
      console.log(`    ${paddedScopeLabel("done")}${item.label}`);
    } else {
      console.log(`    ${paddedScopeLabel("-")}${item.label}`);
      notConfiguredCount++;
    }
  }
  console.log();

  const allDone = allFoldersDone && notConfiguredCount === 0;
  return { allDone, notLocalCount, notConfiguredCount, missingFolders };
}

/**
 * Write a config value to the chosen scope.
 */
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
 * If user picks BACK sentinel, cancel init and exit.
 */
function handleBack(value: string): void {
  if (value === BACK) {
    console.log();
    log.dim("Init cancelled. Remaining steps skipped — nothing further saved.");
    process.exit(0);
  }
}

/**
 * Get the effective docsDir from merged config.
 */
function getDocsDir(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): string {
  return (
    (localCfg?.docsDir as string | undefined) ??
    (globalCfg?.docsDir as string | undefined) ??
    DEFAULT_CONFIG.docsDir
  );
}

/**
 * Offer a shortcut to use the existing global setting for a step.
 * Returns true if user chose to use the global setting (caller should return early).
 */
async function offerGlobalShortcut(globalDisplay: string): Promise<boolean> {
  const choice = await select({
    message: "How to configure?",
    choices: injectBackChoice(
      [
        {
          name: `Use global setting (${globalDisplay})`,
          value: "use_global",
        },
        { name: "Configure manually", value: "configure" },
      ],
      "Cancel init",
    ),
  });

  handleBack(choice);

  if (choice === "use_global") {
    log.dim("Using global setting.");
    return true;
  }
  return false;
}

// ─── Step Functions ───────────────────────────────────────────────────

async function stepDocsDir(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = getMergedValue("docsDir", globalCfg, localCfg) as
    | string
    | undefined;
  const scopeLabel = getScopeLabel("docsDir", globalCfg, localCfg);

  printStepHeader(
    `Docs folder name ${formatScopeLabel(scopeLabel)}${currentValue ? ` (${chalk.dim(currentValue)})` : ""}`,
    "Where plans, memory, research, and session docs are stored in your project.",
  );

  const globalValue = globalCfg?.docsDir;
  if (globalValue && (await offerGlobalShortcut(globalValue))) {
    const DOCS_SUBFOLDERS = [
      "plans",
      "memory",
      "research",
      "learn",
      "sessions",
    ];
    ensureDocsFolders(globalValue, DOCS_SUBFOLDERS);
    return;
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
  if (scope === "back") {
    log.dim("Skipped docsDir.");
    return;
  }

  const DOCS_SUBFOLDERS = ["plans", "memory", "research", "learn", "sessions"];
  applyDocsDirChange(value, currentValue, scope, DOCS_SUBFOLDERS);
  writeToScope(scope, { docsDir: value });
}

async function stepGitignore(docsDir: string): Promise<void> {
  const hasBlock = hasGitignoreBlock();

  if (hasBlock) {
    printStepHeader(
      `Configure .gitignore ${chalk.green("[done]")}`,
      "Keeps AI-generated docs and config out of your git history.",
    );
    log.dim(".gitignore already configured.");
    return;
  }

  printStepHeader(
    "Configure .gitignore",
    "Keeps Coding Friend's AI-generated docs and config out of your git history. You can edit it later in .gitignore.",
  );

  const choice = await select({
    message: "Add coding-friend artifacts to .gitignore?",
    choices: injectBackChoice(
      [
        { name: "Yes, ignore all", value: "all" },
        { name: "Partial -- pick which to ignore", value: "partial" },
        { name: "No -- keep everything tracked", value: "none" },
      ],
      "Cancel init",
    ),
  });

  handleBack(choice);

  if (choice === "none") {
    log.dim("Skipped .gitignore config.");
    return;
  }

  const allEntries = [
    `${docsDir}/plans/`,
    `${docsDir}/memory/`,
    `${docsDir}/research/`,
    `${docsDir}/learn/`,
    `${docsDir}/sessions/`,
    ".coding-friend/",
  ];

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

  const existing = existsSync(".gitignore")
    ? readFileSync(".gitignore", "utf-8")
    : "";

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

async function stepDocsLanguage(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = getMergedValue("language", globalCfg, localCfg) as
    | string
    | undefined;
  const scopeLabel = getScopeLabel("language", globalCfg, localCfg);

  printStepHeader(
    `Docs language ${formatScopeLabel(scopeLabel)}${currentValue ? ` (${chalk.dim(currentValue)})` : ""}`,
    "Skills like /cf-plan, /cf-ask, /cf-remember will write docs in this language.",
  );

  const globalValue = globalCfg?.language;
  if (globalValue && (await offerGlobalShortcut(globalValue))) return;

  const lang = await selectLanguage(
    "What language should generated docs be written in?",
  );

  const scope = await askScope();
  if (scope === "back") {
    log.dim("Skipped docs language.");
    return;
  }
  writeToScope(scope, { language: lang });
}

async function selectLanguage(message: string): Promise<string> {
  const choice = await select({
    message,
    choices: injectBackChoice(
      [
        { name: "English", value: "en" },
        { name: "Vietnamese", value: "vi" },
        { name: "Other", value: "_other" },
      ],
      "Cancel init",
    ),
  });

  handleBack(choice);

  if (choice === "_other") {
    const lang = await input({ message: "Enter language name:" });
    return lang || "en";
  }
  return choice;
}

async function stepLearnConfig(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
  gitAvailable: boolean,
): Promise<{ outputDir: string; autoCommit: boolean; isExternal: boolean }> {
  const currentLearn = (localCfg?.learn ?? globalCfg?.learn) as
    | CodingFriendConfig["learn"]
    | undefined;
  const scopeLabel = getScopeLabel("learn", globalCfg, localCfg);
  const docsDir = getDocsDir(globalCfg, localCfg);

  printStepHeader(
    `/cf-learn config ${formatScopeLabel(scopeLabel)}`,
    "Controls where and how /cf-learn saves your learning notes.",
  );

  const globalLearn = globalCfg?.learn;
  if (globalLearn) {
    const parts = [
      globalLearn.language || "en",
      globalLearn.outputDir || `${docsDir}/learn`,
    ];
    if (globalLearn.categories) {
      parts.push(`${globalLearn.categories.length} categories`);
    }
    if (await offerGlobalShortcut(parts.join(", "))) {
      const gOutputDir = globalLearn.outputDir || `${docsDir}/learn`;
      const gIsExternal = !gOutputDir.startsWith(`${docsDir}/`);
      return {
        outputDir: gOutputDir,
        autoCommit: globalLearn.autoCommit || false,
        isExternal: gIsExternal,
      };
    }
  }

  // a) Language
  const language = await selectLanguage(
    "What language should /cf-learn notes be written in?",
  );

  // b) Output location
  const locationChoice = await select({
    message: "Where to store learning docs?",
    choices: injectBackChoice(
      [
        { name: `In this project (${docsDir}/learn/)`, value: "local" },
        { name: "A separate folder", value: "external" },
      ],
      "Cancel init",
    ),
  });

  handleBack(locationChoice);

  let outputDir = `${docsDir}/learn`;
  let isExternal = false;
  if (locationChoice === "external") {
    outputDir = await input({
      message: "Enter path (absolute or ~/...):",
      default: currentLearn?.outputDir ?? undefined,
      validate: (val) => (val.length > 0 ? true : "Path cannot be empty"),
    });
    isExternal = true;
    const resolved = resolvePath(outputDir);
    if (!existsSync(resolved)) {
      const create = await confirm({
        message: `Folder ${resolved} doesn't exist. Create it?`,
        default: true,
      });
      if (create) {
        run("mkdir", ["-p", resolved]);
        log.success(`Created ${resolved}`);
      }
    }
  }

  // c) Categories
  const existingCats = currentLearn?.categories;
  const defaultNames = DEFAULT_CONFIG.learn.categories
    .map((c) => c.name)
    .join(", ");

  const catChoices: { name: string; value: string }[] = [
    { name: `Use defaults (${defaultNames})`, value: "defaults" },
  ];
  if (existingCats && existingCats.length > 0) {
    const existingNames = existingCats.map((c) => c.name).join(", ");
    catChoices.push({
      name: `Keep current (${existingNames})`,
      value: "existing",
    });
  }
  catChoices.push({ name: "Customize", value: "custom" });

  const catChoice = await select({
    message: "Categories for organizing learning docs?",
    choices: injectBackChoice(catChoices, "Cancel init"),
  });

  handleBack(catChoice);

  let categories = DEFAULT_CONFIG.learn.categories;
  if (catChoice === "existing" && existingCats) {
    categories = existingCats;
  } else if (catChoice === "custom") {
    console.log();
    if (existingCats && existingCats.length > 0) {
      console.log("Current categories in config.json:");
      for (const c of existingCats) {
        log.dim(`  ${c.name}: ${c.description}`);
      }
      console.log();
    }
    console.log(
      'Enter categories (format: "name: description"). Empty line to finish.',
    );
    log.dim(
      "Tip: you can also edit config.json later -- see https://cf.dinhanhthi.com/docs/configuration/config-json/#learning-extraction",
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

  // d) Auto-commit (only for external + git available)
  let autoCommit = false;
  if (isExternal && gitAvailable) {
    autoCommit = await confirm({
      message: "Auto-commit learning docs to git after each /cf-learn?",
      default: currentLearn?.autoCommit ?? false,
    });
  }

  // e) README index
  const indexChoice = await select({
    message: "How should learning docs be indexed?",
    choices: injectBackChoice(
      [
        { name: "No index", value: "none" },
        { name: "Single README at root", value: "single" },
        { name: "Per-category READMEs", value: "per-category" },
      ],
      "Cancel init",
    ),
  });

  handleBack(indexChoice);

  let readmeIndex: boolean | "per-category" = false;
  if (indexChoice === "single") readmeIndex = true;
  else if (indexChoice === "per-category") readmeIndex = "per-category";

  // f) One askScope() for the whole learn object
  const learnObj = {
    language,
    outputDir,
    categories,
    autoCommit,
    readmeIndex,
  };

  const scope = await askScope();
  if (scope === "back") {
    log.dim("Skipped /cf-learn config.");
    return { outputDir, autoCommit, isExternal };
  }

  // Read existing learn from target scope and merge
  const targetPath =
    scope === "global" ? globalConfigPath() : localConfigPath();
  const existingConfig = readJson<CodingFriendConfig>(targetPath);
  const existingLearn = existingConfig?.learn ?? {};
  mergeJson(targetPath, { learn: { ...existingLearn, ...learnObj } });
  log.success(`Saved to ${targetPath}`);

  return { outputDir, autoCommit, isExternal };
}

async function stepShellCompletion(): Promise<void> {
  if (hasShellCompletion()) {
    printStepHeader(
      `Shell tab completion ${chalk.green("[done]")}`,
      "Enables tab-complete for cf commands in your shell.",
    );
    ensureShellCompletion({ silent: false });
    return;
  }

  printStepHeader(
    "Shell tab completion",
    "Enables tab-complete for cf commands in your shell.",
  );
  ensureShellCompletion();
}

async function stepStatusline(): Promise<void> {
  if (isStatuslineConfigured()) {
    printStepHeader(
      `Configure statusline ${chalk.green("[done]")}`,
      "Shows token count, model, and session info in your terminal prompt.",
    );
    log.dim("Statusline already configured.");
    return;
  }

  printStepHeader(
    "Configure statusline",
    "Shows token count, model, and session info in your terminal prompt.",
  );

  const hookResult = findStatuslineHookPath();
  if (!hookResult) {
    log.warn(
      "coding-friend plugin not found. Install it via Claude Code first, then re-run.",
    );
    return;
  }

  const components = await selectStatuslineComponents();

  if (components.includes("rate_limit")) {
    const missing: string[] = [];
    if (!commandExists("curl")) missing.push("curl");
    if (!commandExists("jq")) missing.push("jq");
    if (missing.length > 0) {
      log.warn(
        `Rate limit requires ${missing.join(" & ")}. Install them first, or the statusline will show a warning instead.`,
      );
    }
  }

  saveStatuslineConfig(components);
  writeStatuslineSettings(hookResult.hookPath);
  log.success("Statusline configured!");
}

function isMemoryMcpConfigured(): boolean {
  const mcpPath = join(process.cwd(), ".mcp.json");
  const config = readJson<Record<string, unknown>>(mcpPath);
  if (!config) return false;
  const servers = config.mcpServers as Record<string, unknown> | undefined;
  return servers != null && "coding-friend-memory" in servers;
}

async function stepMemory(docsDir: string): Promise<void> {
  if (isMemoryMcpConfigured()) {
    printStepHeader(
      `CF Memory MCP ${chalk.green("[done]")}`,
      "Connects the memory system to Claude Code via MCP.",
    );
    log.dim("Memory MCP already configured in .mcp.json.");
    return;
  }

  printStepHeader(
    "CF Memory MCP",
    "Connects the memory system to Claude Code via MCP so skills can store and search memories.",
  );

  const choice = await select({
    message: "Configure CF Memory MCP server?",
    choices: injectBackChoice(
      [
        { name: "Yes, add to .mcp.json", value: "yes" },
        {
          name: "No, I'll configure it later (cf memory mcp)",
          value: "no",
        },
      ],
      "Cancel init",
    ),
  });

  handleBack(choice);

  if (choice === "no") {
    log.dim("Skipped. Run `cf memory mcp` anytime to get the config.");
    return;
  }

  // Build MCP server path
  let serverPath: string;
  try {
    const mcpDir = getLibPath("cf-memory");
    serverPath = join(mcpDir, "dist", "index.js");
    if (!existsSync(serverPath)) {
      log.warn(
        "cf-memory not built yet. Run `cd cli/lib/cf-memory && npm install && npm run build` first.",
      );
      return;
    }
  } catch {
    log.warn(
      "cf-memory package not found. Install the CLI first: npm i -g coding-friend-cli",
    );
    return;
  }

  const memoryDir = join(process.cwd(), docsDir, "memory");
  const mcpPath = join(process.cwd(), ".mcp.json");
  const existing = readJson<Record<string, unknown>>(mcpPath) ?? {};
  const servers =
    (existing.mcpServers as Record<string, unknown> | undefined) ?? {};

  writeJson(mcpPath, {
    ...existing,
    mcpServers: {
      ...servers,
      "coding-friend-memory": {
        command: "node",
        args: [serverPath, memoryDir],
      },
    },
  });
  log.success(`Added coding-friend-memory to .mcp.json`);

  // Ask about autoCapture
  const autoCapture = await confirm({
    message:
      "Enable auto-capture? (saves session summaries to memory before context compaction)",
    default: false,
  });

  if (autoCapture) {
    const scope = await askScope();
    if (scope !== "back") {
      const targetPath =
        scope === "global" ? globalConfigPath() : localConfigPath();
      const existingConfig = readJson<CodingFriendConfig>(targetPath);
      const existingMemory = existingConfig?.memory ?? {};
      mergeJson(targetPath, {
        memory: { ...existingMemory, autoCapture: true },
      });
      log.success(`Saved to ${targetPath}`);
    }
  }
}

async function stepClaudePermissions(
  outputDir: string,
  autoCommit: boolean,
): Promise<void> {
  const resolved = resolvePath(outputDir);
  const homePath = resolved.startsWith(homedir())
    ? resolved.replace(homedir(), "~")
    : resolved;

  const settingsPath = claudeSettingsPath();
  const existing = getExistingRules(settingsPath);

  if (existing.length === 0 && !readJson(settingsPath)) {
    log.warn(
      "~/.claude/settings.json not found. Create it via Claude Code settings first.",
    );
    return;
  }

  const learnRules = buildLearnDirRules(homePath, autoCommit);
  const missing = getMissingRules(existing, learnRules);

  if (missing.length === 0) {
    log.dim("All permission rules already configured.");
    return;
  }

  console.log("\nTo avoid repeated permission prompts, add these rules:");
  for (const r of missing) {
    console.log(`  ${r.rule}`);
  }

  const ok = await confirm({
    message: "Add these to ~/.claude/settings.json?",
    default: true,
  });

  if (!ok) {
    log.dim("Skipped. You'll get prompted each time.");
    return;
  }

  applyPermissions(
    settingsPath,
    missing.map((r) => r.rule),
    [],
  );
  log.success(`Added ${missing.length} permission rules.`);
  log.dim("For all plugin permissions, run: `cf permission`");
}

// ─── Main ─────────────────────────────────────────────────────────────

export async function initCommand(): Promise<void> {
  _stepIndex = 0;
  printBanner();
  showConfigHint();

  // Detect environment
  const gitAvailable = isGitRepo();
  if (!gitAvailable) {
    log.warn("Not inside a git repo -- git-related steps will be skipped.");
    console.log();
  }

  // Load raw configs for status display
  const globalCfg = readJson<CodingFriendConfig>(globalConfigPath());
  const localCfg = readJson<CodingFriendConfig>(localConfigPath());

  // ── Detect & display setup status ──────────────────────────────────

  console.log("Project status:");
  console.log();

  const { allDone, notLocalCount, notConfiguredCount, missingFolders } =
    printSetupStatus(globalCfg, localCfg, gitAvailable);

  if (allDone) {
    if (notLocalCount > 0) {
      console.log(
        chalk.dim(
          `  ${notLocalCount} setting(s) inherited from global config only.`,
        ),
      );
      console.log();
    }
    log.success("All settings configured!");
    console.log();
    const proceed = await confirm({
      message: "Modify settings?",
      default: false,
    });
    if (!proceed) {
      log.dim("No changes. Run `cf init` anytime to reconfigure.");
      return;
    }
  } else {
    const parts: string[] = [];
    if (missingFolders > 0) {
      parts.push(`${missingFolders} folder(s) missing`);
    }
    if (notConfiguredCount > 0) {
      parts.push(`${notConfiguredCount} setting(s) not configured`);
    }
    if (notLocalCount > 0) {
      parts.push(`${notLocalCount} not set locally`);
    }
    if (parts.length > 0) {
      console.log(`  ${chalk.yellow("⚠")} ${parts.join(" · ")}`);
      console.log();
    }
    const proceed = await confirm({
      message: "Run setup wizard?",
      default: true,
    });
    if (!proceed) {
      log.dim("Init cancelled. Run `cf init` anytime to resume.");
      return;
    }
  }

  // ─── Linear step flow ──────────────────────────────────────────────

  // Step 1: docsDir
  await stepDocsDir(globalCfg, localCfg);

  // Re-read configs after docsDir may have been written
  const updatedGlobal = readJson<CodingFriendConfig>(globalConfigPath());
  const updatedLocal = readJson<CodingFriendConfig>(localConfigPath());
  const docsDir = getDocsDir(updatedGlobal, updatedLocal);

  // Step 2: .gitignore (only in git repos)
  if (gitAvailable) {
    await stepGitignore(docsDir);
  } else {
    printStepHeader(
      `Configure .gitignore ${chalk.dim("[skipped]")}`,
      "Keeps AI-generated docs and config out of your git history.",
    );
    log.dim("Skipped — not inside a git repo.");
  }

  // Step 3: Docs language
  await stepDocsLanguage(globalCfg, localCfg);

  // Step 4: /cf-learn config
  const { outputDir, autoCommit, isExternal } = await stepLearnConfig(
    updatedGlobal,
    updatedLocal,
    gitAvailable,
  );

  // Step 5: Shell completion
  await stepShellCompletion();

  // Step 6: Statusline
  await stepStatusline();

  // Step 7: CF Memory MCP
  await stepMemory(docsDir);

  // Step 8: Claude permissions (conditional: only when external learn dir)
  if (isExternal) {
    printStepHeader(
      "Configure Claude permissions",
      "Grants Claude read/write access to your external learn folder without repeated prompts.",
    );
    await stepClaudePermissions(outputDir, autoCommit);
  } else {
    printStepHeader(
      `Configure Claude permissions ${chalk.dim("[skipped]")}`,
      "Grants Claude read/write access to your external learn folder without repeated prompts.",
    );
    log.dim(
      "Skipped — learn directory is inside the project. Run `cf permission` for other permissions.",
    );
  }

  // Final
  console.log();
  log.congrats("Setup complete!");
  log.dim(
    "Available commands: /cf-ask, /cf-plan, /cf-fix, /cf-commit, /cf-review, /cf-ship, /cf-optimize, /cf-remember, /cf-learn, /cf-research, /cf-session, /cf-help",
  );
}
