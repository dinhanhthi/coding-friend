import { checkbox, confirm, input, select } from "@inquirer/prompts";
import { appendFileSync, existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { run } from "../lib/exec.js";
import { mergeJson, readJson } from "../lib/json.js";
import { log } from "../lib/log.js";
import {
  claudeSettingsPath,
  globalConfigPath,
  localConfigPath,
  resolvePath,
} from "../lib/paths.js";
import { hasShellCompletion, ensureShellCompletion } from "../lib/shell-completion.js";
import { DEFAULT_CONFIG, type CodingFriendConfig, type LearnCategory } from "../types.js";

interface SetupStep {
  name: string;
  label: string;
  done: boolean;
}

// ─── Detection ────────────────────────────────────────────────────────

function isGitRepo(): boolean {
  return run("git", ["rev-parse", "--is-inside-work-tree"]) === "true";
}

function checkDocsFolders(): boolean {
  const folders = ["docs/plans", "docs/memory", "docs/research", "docs/learn"];
  return folders.every((f) => existsSync(f));
}

function checkGitignore(): boolean {
  if (!existsSync(".gitignore")) return false;
  return readFileSync(".gitignore", "utf-8").includes("# coding-friend");
}

function checkLanguage(): boolean {
  const local = readJson<CodingFriendConfig>(localConfigPath());
  const global = readJson<CodingFriendConfig>(globalConfigPath());
  return !!(local?.language || global?.language);
}

function checkLearnConfig(): boolean {
  const local = readJson<CodingFriendConfig>(localConfigPath());
  const global = readJson<CodingFriendConfig>(globalConfigPath());
  return !!(local?.learn || global?.learn);
}

function getResolvedOutputDir(): string | null {
  const local = readJson<CodingFriendConfig>(localConfigPath());
  if (local?.learn?.outputDir) return resolvePath(local.learn.outputDir);
  const global = readJson<CodingFriendConfig>(globalConfigPath());
  if (global?.learn?.outputDir) return resolvePath(global.learn.outputDir);
  return null;
}

function isExternalOutputDir(outputDir: string | null): boolean {
  if (!outputDir) return false;
  const cwd = process.cwd();
  return !outputDir.startsWith(cwd);
}

function checkClaudePermissions(outputDir: string): boolean {
  const settings = readJson<Record<string, unknown>>(claudeSettingsPath());
  if (!settings) return false;
  const permissions = settings.permissions as { allow?: string[] } | undefined;
  if (!permissions?.allow) return false;
  // Check if at least a Write permission exists for the outputDir
  const homePath = outputDir.replace(homedir(), "~");
  return permissions.allow.some(
    (rule: string) =>
      rule.includes(outputDir) || rule.includes(homePath),
  );
}

// ─── Setup Steps ──────────────────────────────────────────────────────

async function setupDocsFolders(): Promise<void> {
  const folders = ["docs/plans", "docs/memory", "docs/research", "docs/learn"];
  const created: string[] = [];
  for (const f of folders) {
    if (!existsSync(f)) {
      run("mkdir", ["-p", f]);
      created.push(f);
    }
  }
  if (created.length > 0) {
    log.success(`Created: ${created.join(", ")}`);
  } else {
    log.dim("All docs folders already exist.");
  }
}

async function setupGitignore(): Promise<void> {
  const choice = await select({
    message: "Add coding-friend artifacts to .gitignore?",
    choices: [
      { name: "Yes, ignore all", value: "all" },
      { name: "Partial — pick which to ignore", value: "partial" },
      { name: "No — keep everything tracked", value: "none" },
    ],
  });

  if (choice === "none") {
    log.dim("Skipped .gitignore config.");
    return;
  }

  const allEntries = [
    "docs/plans/",
    "docs/memory/",
    "docs/research/",
    "docs/learn/",
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

  // Filter already existing entries
  const existing = existsSync(".gitignore")
    ? readFileSync(".gitignore", "utf-8")
    : "";
  const newEntries = entries.filter((e) => !existing.includes(e));

  if (newEntries.length === 0) {
    log.dim("All entries already in .gitignore.");
    return;
  }

  const block = `\n# coding-friend\n${newEntries.join("\n")}\n`;
  appendFileSync(".gitignore", block);
  log.success(`Added to .gitignore: ${newEntries.join(", ")}`);
}

async function setupLanguage(): Promise<string> {
  const choice = await select({
    message: "What language should generated docs be written in?",
    choices: [
      { name: "English", value: "en" },
      { name: "Vietnamese", value: "vi" },
      { name: "Other", value: "_other" },
    ],
  });

  if (choice === "_other") {
    const lang = await input({ message: "Enter language name:" });
    return lang || "en";
  }
  return choice;
}

async function setupLearnConfig(gitAvailable = true): Promise<{
  outputDir: string;
  categories: LearnCategory[];
  autoCommit: boolean;
  readmeIndex: boolean | "per-category";
  isExternal: boolean;
}> {
  // a) Output location
  const locationChoice = await select({
    message: "Where to store learning docs?",
    choices: [
      { name: "In this project (docs/learn/)", value: "local" },
      { name: "A separate folder", value: "external" },
    ],
  });

  let outputDir = "docs/learn";
  let isExternal = false;
  if (locationChoice === "external") {
    outputDir = await input({
      message: "Enter path (absolute or ~/...):",
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

  // b) Categories
  const catChoice = await select({
    message: "Categories for organizing learning docs?",
    choices: [
      {
        name: "Use defaults (concepts, patterns, languages, tools, debugging)",
        value: "defaults",
      },
      { name: "Customize", value: "custom" },
    ],
  });

  let categories = DEFAULT_CONFIG.learn.categories;
  if (catChoice === "custom") {
    console.log('Enter categories (format: "name: description"). Empty line to finish.');
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

  // c) Auto-commit (only for external + git available)
  let autoCommit = false;
  if (isExternal && gitAvailable) {
    autoCommit = await confirm({
      message: "Auto-commit learning docs to git after each /cf-learn?",
      default: false,
    });
  }

  // d) README index
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

  return { outputDir, categories, autoCommit, readmeIndex, isExternal };
}


async function setupClaudePermissions(outputDir: string, autoCommit: boolean): Promise<void> {
  const resolved = resolvePath(outputDir);
  const homePath = resolved.startsWith(homedir())
    ? resolved.replace(homedir(), "~")
    : resolved;

  const rules: string[] = [
    `Read(${homePath}/**)`,
    `Edit(${homePath}/**)`,
    `Write(${homePath}/**)`,
  ];

  if (autoCommit) {
    rules.push(`Bash(cd ${homePath} && git add:*)`);
    rules.push(`Bash(cd ${homePath} && git commit:*)`);
  }

  // Check existing
  const settingsPath = claudeSettingsPath();
  const settings = readJson<Record<string, unknown>>(settingsPath);
  if (!settings) {
    log.warn(
      "~/.claude/settings.json not found. Create it via Claude Code settings first.",
    );
    return;
  }

  const permissions = (settings.permissions ?? {}) as {
    allow?: string[];
    deny?: string[];
  };
  const existing = permissions.allow ?? [];
  const missing = rules.filter(
    (r) => !existing.some((e) => e === r || e.includes(homePath)),
  );

  if (missing.length === 0) {
    log.dim("All permission rules already configured.");
    return;
  }

  console.log("\nTo avoid repeated permission prompts, add these rules:");
  for (const r of missing) {
    console.log(`  ${r}`);
  }

  const ok = await confirm({
    message: "Add these to ~/.claude/settings.json?",
    default: true,
  });

  if (!ok) {
    log.dim("Skipped. You'll get prompted each time.");
    return;
  }

  permissions.allow = [...existing, ...missing];
  settings.permissions = permissions;
  const { readJson: _r, writeJson: _w, ...restImports } = await import(
    "../lib/json.js"
  );
  _w(settingsPath, settings);
  log.success(`Added ${missing.length} permission rules.`);
}

// ─── Save Config ──────────────────────────────────────────────────────

function isDefaultConfig(config: CodingFriendConfig): boolean {
  if (config.language && config.language !== "en") return false;
  if (config.learn) {
    const l = config.learn;
    if (l.outputDir && l.outputDir !== "docs/learn") return false;
    if (l.autoCommit) return false;
    if (l.readmeIndex) return false;
    if (l.categories) {
      const defaultNames = DEFAULT_CONFIG.learn.categories.map((c) => c.name);
      const configNames = l.categories.map((c) => c.name);
      if (JSON.stringify(defaultNames) !== JSON.stringify(configNames))
        return false;
    }
  }
  return true;
}

async function saveConfig(config: CodingFriendConfig): Promise<void> {
  if (isDefaultConfig(config)) {
    log.dim(
      "All settings match defaults — no config file needed.",
    );
    return;
  }

  const target = await select({
    message: "Save settings as global or project-only?",
    choices: [
      { name: "Global (all projects)", value: "global" },
      { name: "This project only", value: "local" },
      { name: "Both", value: "both" },
    ],
  });

  if (target === "global" || target === "both") {
    mergeJson(globalConfigPath(), config as Record<string, unknown>);
    log.success(`Saved to ${globalConfigPath()}`);
  }
  if (target === "local" || target === "both") {
    mergeJson(localConfigPath(), config as Record<string, unknown>);
    log.success(`Saved to ${localConfigPath()}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────

export async function initCommand(): Promise<void> {
  console.log("=== 🌿 Coding Friend Init 🌿 ===");
  console.log();

  // Step 1: Detect environment
  const gitAvailable = isGitRepo();
  if (!gitAvailable) {
    log.warn("Not inside a git repo — git-related steps will be skipped.");
    console.log();
  }

  // Step 2: Scan
  const resolvedOutputDir = getResolvedOutputDir();
  const hasExternalDir =
    checkLearnConfig() && isExternalOutputDir(resolvedOutputDir);

  const steps: SetupStep[] = [
    { name: "docs", label: "Create docs folders", done: checkDocsFolders() },
    ...(gitAvailable
      ? [{ name: "gitignore", label: "Configure .gitignore", done: checkGitignore() }]
      : []),
    { name: "language", label: "Set docs language", done: checkLanguage() },
    { name: "learn", label: "Configure /cf-learn", done: checkLearnConfig() },
    { name: "completion", label: "Setup shell tab completion", done: hasShellCompletion() },
  ];

  if (hasExternalDir && resolvedOutputDir) {
    steps.push({
      name: "permissions",
      label: "Configure Claude permissions",
      done: checkClaudePermissions(resolvedOutputDir),
    });
  }

  // Step 3: Present
  console.log("coding-friend setup status:");
  for (const step of steps) {
    const status = step.done ? "\x1b[32m[done]\x1b[0m" : "\x1b[33m[pending]\x1b[0m";
    console.log(`  ${status} ${step.label}`);
  }
  console.log();

  const pending = steps.filter((s) => !s.done);
  if (pending.length === 0) {
    log.success("Everything is already configured!");
    return;
  }

  const action = await select({
    message: `${pending.length} pending step(s). What do you want to do?`,
    choices: [
      { name: "Apply all pending", value: "all" },
      { name: "Pick which to apply", value: "pick" },
      { name: "Cancel", value: "cancel" },
    ],
  });

  if (action === "cancel") {
    log.dim("Cancelled.");
    return;
  }

  let selected = pending;
  if (action === "pick") {
    const picked = await checkbox({
      message: "Which steps to apply?",
      choices: pending.map((s) => ({ name: s.label, value: s.name })),
    });
    selected = pending.filter((s) => picked.includes(s.name));
    if (selected.length === 0) {
      log.dim("Nothing selected.");
      return;
    }
  }

  // Step 4: Execute
  const config: CodingFriendConfig = {};
  let learnOutputDir = "docs/learn";
  let learnAutoCommit = false;
  let isExternal = false;

  for (const step of selected) {
    console.log();
    log.step(step.label);

    switch (step.name) {
      case "docs":
        await setupDocsFolders();
        break;

      case "gitignore":
        await setupGitignore();
        break;

      case "language": {
        const lang = await setupLanguage();
        config.language = lang;
        break;
      }

      case "learn": {
        const learn = await setupLearnConfig(gitAvailable);
        config.learn = {
          outputDir: learn.outputDir,
          categories: learn.categories,
          autoCommit: learn.autoCommit,
          readmeIndex: learn.readmeIndex,
        };
        learnOutputDir = learn.outputDir;
        learnAutoCommit = learn.autoCommit;
        isExternal = learn.isExternal;
        break;
      }

      case "completion":
        ensureShellCompletion();
        break;

      case "permissions":
        if (resolvedOutputDir) {
          await setupClaudePermissions(
            resolvedOutputDir,
            learnAutoCommit,
          );
        }
        break;
    }
  }

  // If learn was just configured and has external dir, ask about permissions
  if (
    isExternal &&
    !selected.some((s) => s.name === "permissions") &&
    !checkClaudePermissions(resolvePath(learnOutputDir))
  ) {
    console.log();
    log.step("Configure Claude permissions");
    await setupClaudePermissions(learnOutputDir, learnAutoCommit);
  }

  // Save config
  if (Object.keys(config).length > 0) {
    console.log();
    await saveConfig(config);
  }

  // Final
  console.log();
  log.success("Setup complete!");
  log.dim("Available commands: /cf-plan, /cf-commit, /cf-review, /cf-learn");
}
