import { checkbox, confirm, input, select } from "@inquirer/prompts";
import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { readJson, mergeJson } from "../lib/json.js";
import { log } from "../lib/log.js";
import {
  claudeLocalSettingsPath,
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
} from "../lib/statusline.js";
import {
  hasShellCompletion,
  ensureShellCompletion,
  removeShellCompletion,
} from "../lib/shell-completion.js";
import { getAllRules, getExistingRules } from "../lib/permissions.js";

// ─── Helpers ──────────────────────────────────────────────────────────

function getNestedFieldScope(
  section: "learn" | "memory",
  field: string,
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): string {
  const globalSection = globalCfg?.[section] as
    | Record<string, unknown>
    | undefined;
  const localSection = localCfg?.[section] as
    | Record<string, unknown>
    | undefined;
  const inGlobal = globalSection?.[field] !== undefined;
  const inLocal = localSection?.[field] !== undefined;
  if (inGlobal && inLocal) return "both";
  if (inGlobal) return "global";
  if (inLocal) return "local";
  return "-";
}

function getLearnFieldScope(
  field: string,
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): string {
  return getNestedFieldScope("learn", field, globalCfg, localCfg);
}

function getMemoryFieldScope(
  field: string,
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): string {
  return getNestedFieldScope("memory", field, globalCfg, localCfg);
}

function getMergedNestedValue(
  section: "learn" | "memory",
  field: string,
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): unknown {
  const localSection = localCfg?.[section] as
    | Record<string, unknown>
    | undefined;
  if (localSection?.[field] !== undefined) return localSection[field];
  const globalSection = globalCfg?.[section] as
    | Record<string, unknown>
    | undefined;
  return globalSection?.[field];
}

function getMergedLearnValue(
  field: string,
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): unknown {
  return getMergedNestedValue("learn", field, globalCfg, localCfg);
}

function getMergedMemoryValue(
  field: string,
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): unknown {
  return getMergedNestedValue("memory", field, globalCfg, localCfg);
}

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
  section: "learn" | "memory",
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

function writeMemoryField(
  scope: "global" | "local",
  field: string,
  value: unknown,
): void {
  writeNestedField("memory", scope, field, value);
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
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = getMergedLearnValue("outputDir", globalCfg, localCfg) as
    | string
    | undefined;
  if (currentValue) {
    log.dim(`Current: ${currentValue}`);
  }

  const locationChoice = await select({
    message: "Where to store learning docs?",
    choices: [
      { name: "In this project (docs/learn/)", value: "local" },
      { name: "A separate folder", value: "external" },
    ],
  });

  let outputDir = "docs/learn";
  if (locationChoice === "external") {
    outputDir = await input({
      message: "Enter path (absolute or ~/...):",
      default: currentValue ?? undefined,
      validate: (val) => (val.length > 0 ? true : "Path cannot be empty"),
    });
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

  const scope = await askScope();
  if (scope === "back") return;
  writeLearnField(scope, "outputDir", outputDir);
}

async function editLearnLanguage(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = getMergedLearnValue("language", globalCfg, localCfg) as
    | string
    | undefined;
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

  const scope = await askScope();
  if (scope === "back") return;
  writeLearnField(scope, "language", lang);
}

async function editLearnCategories(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const existingCats = getMergedLearnValue(
    "categories",
    globalCfg,
    localCfg,
  ) as LearnCategory[] | undefined;

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
    choices: catChoices,
  });

  let categories = DEFAULT_CONFIG.learn.categories;
  if (catChoice === "existing" && existingCats) {
    categories = existingCats;
  } else if (catChoice === "custom") {
    console.log();
    if (existingCats && existingCats.length > 0) {
      console.log("Current categories:");
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

  const scope = await askScope();
  if (scope === "back") return;
  writeLearnField(scope, "categories", categories);
}

async function editLearnAutoCommit(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = getMergedLearnValue(
    "autoCommit",
    globalCfg,
    localCfg,
  ) as boolean | undefined;
  if (currentValue !== undefined) {
    log.dim(`Current: ${currentValue}`);
  }

  const value = await confirm({
    message: "Auto-commit learning docs to git after each /cf-learn?",
    default: currentValue ?? false,
  });

  const scope = await askScope();
  if (scope === "back") return;
  writeLearnField(scope, "autoCommit", value);
}

async function editLearnReadmeIndex(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = getMergedLearnValue(
    "readmeIndex",
    globalCfg,
    localCfg,
  ) as boolean | "per-category" | undefined;
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

  const scope = await askScope();
  if (scope === "back") return;
  writeLearnField(scope, "readmeIndex", readmeIndex);
}

async function learnSubMenu(): Promise<void> {
  while (true) {
    const globalCfg = readJson<CodingFriendConfig>(globalConfigPath());
    const localCfg = readJson<CodingFriendConfig>(localConfigPath());

    const outputDirScope = getLearnFieldScope("outputDir", globalCfg, localCfg);
    const outputDirVal = getMergedLearnValue(
      "outputDir",
      globalCfg,
      localCfg,
    ) as string | undefined;

    const langScope = getLearnFieldScope("language", globalCfg, localCfg);
    const langVal = getMergedLearnValue("language", globalCfg, localCfg) as
      | string
      | undefined;

    const catScope = getLearnFieldScope("categories", globalCfg, localCfg);

    const autoCommitScope = getLearnFieldScope(
      "autoCommit",
      globalCfg,
      localCfg,
    );
    const autoCommitVal = getMergedLearnValue(
      "autoCommit",
      globalCfg,
      localCfg,
    ) as boolean | undefined;

    const readmeScope = getLearnFieldScope("readmeIndex", globalCfg, localCfg);
    const readmeVal = getMergedLearnValue(
      "readmeIndex",
      globalCfg,
      localCfg,
    ) as boolean | "per-category" | undefined;

    const choice = await select({
      message: "Learn settings:",
      choices: injectBackChoice(
        [
          {
            name: `Output dir ${formatScopeLabel(outputDirScope)}${outputDirVal ? ` (${outputDirVal})` : ""}`,
            value: "outputDir",
          },
          {
            name: `Language ${formatScopeLabel(langScope)}${langVal ? ` (${langVal})` : ""}`,
            value: "language",
          },
          {
            name: `Categories ${formatScopeLabel(catScope)}`,
            value: "categories",
          },
          {
            name: `Auto-commit ${formatScopeLabel(autoCommitScope)}${autoCommitVal !== undefined ? ` (${autoCommitVal})` : ""}`,
            value: "autoCommit",
          },
          {
            name: `README index ${formatScopeLabel(readmeScope)}${readmeVal !== undefined ? ` (${readmeVal})` : ""}`,
            value: "readmeIndex",
          },
        ],
        "Back",
      ),
    });

    if (choice === BACK) return;

    switch (choice) {
      case "outputDir":
        await editLearnOutputDir(globalCfg, localCfg);
        break;
      case "language":
        await editLearnLanguage(globalCfg, localCfg);
        break;
      case "categories":
        await editLearnCategories(globalCfg, localCfg);
        break;
      case "autoCommit":
        await editLearnAutoCommit(globalCfg, localCfg);
        break;
      case "readmeIndex":
        await editLearnReadmeIndex(globalCfg, localCfg);
        break;
    }
  }
}

// ─── Memory Sub-menu ─────────────────────────────────────────────────

async function editMemoryTier(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = getMergedMemoryValue("tier", globalCfg, localCfg) as
    | string
    | undefined;
  if (currentValue) {
    log.dim(`Current: ${currentValue}`);
  }

  const choice = await select({
    message: "Memory search tier:",
    choices: injectBackChoice(
      [
        {
          name: "auto — detect best available (recommended)",
          value: "auto",
        },
        {
          name: "full — SQLite + FTS5 + vector embeddings (Tier 1)",
          value: "full",
        },
        {
          name: "lite — MiniSearch daemon, in-memory BM25 + fuzzy (Tier 2)",
          value: "lite",
        },
        {
          name: "markdown — file-based substring search (Tier 3)",
          value: "markdown",
        },
      ],
      "Back",
    ),
  });

  if (choice === BACK) return;

  const scope = await askScope();
  if (scope === "back") return;
  writeMemoryField(scope, "tier", choice);
}

async function editMemoryAutoCapture(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = getMergedMemoryValue(
    "autoCapture",
    globalCfg,
    localCfg,
  ) as boolean | undefined;
  if (currentValue !== undefined) {
    log.dim(`Current: ${currentValue}`);
  }

  const value = await confirm({
    message:
      "Auto-capture session context to memory on PreCompact (context window compression)?",
    default: currentValue ?? false,
  });

  const scope = await askScope();
  if (scope === "back") return;
  writeMemoryField(scope, "autoCapture", value);
}

async function editMemoryAutoStart(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentValue = getMergedMemoryValue(
    "autoStart",
    globalCfg,
    localCfg,
  ) as boolean | undefined;
  if (currentValue !== undefined) {
    log.dim(`Current: ${currentValue}`);
  }

  const value = await confirm({
    message: "Auto-start memory daemon when MCP server connects?",
    default: currentValue ?? false,
  });

  const scope = await askScope();
  if (scope === "back") return;
  writeMemoryField(scope, "autoStart", value);
}

async function editMemoryEmbedding(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentEmbedding = getMergedMemoryValue(
    "embedding",
    globalCfg,
    localCfg,
  ) as { provider?: string; model?: string; ollamaUrl?: string } | undefined;

  if (currentEmbedding) {
    const parts = [`provider: ${currentEmbedding.provider ?? "transformers"}`];
    if (currentEmbedding.model) parts.push(`model: ${currentEmbedding.model}`);
    if (currentEmbedding.ollamaUrl)
      parts.push(`url: ${currentEmbedding.ollamaUrl}`);
    log.dim(`Current: ${parts.join(", ")}`);
  }

  const provider = await select({
    message: "Embedding provider:",
    choices: injectBackChoice(
      [
        {
          name: "transformers — Transformers.js, runs in-process (no external deps)",
          value: "transformers",
        },
        {
          name: "ollama — Local Ollama server (faster, GPU support, wider model selection)",
          value: "ollama",
        },
      ],
      "Back",
    ),
  });

  if (provider === BACK) return;

  let model: string | undefined;
  let ollamaUrl: string | undefined;

  if (provider === "ollama") {
    model = await input({
      message: "Ollama model name:",
      default: currentEmbedding?.model ?? "all-minilm:l6-v2",
    });
    ollamaUrl = await input({
      message: "Ollama server URL:",
      default: currentEmbedding?.ollamaUrl ?? "http://localhost:11434",
    });
    if (ollamaUrl === "http://localhost:11434") ollamaUrl = undefined;
  } else {
    model = await input({
      message: "Transformers.js model:",
      default: currentEmbedding?.model ?? "Xenova/all-MiniLM-L6-v2",
    });
    if (model === "Xenova/all-MiniLM-L6-v2") model = undefined;
  }

  const scope = await askScope();
  if (scope === "back") return;

  const embedding: Record<string, unknown> = { provider };
  if (model) embedding.model = model;
  if (ollamaUrl) embedding.ollamaUrl = ollamaUrl;
  writeMemoryField(scope, "embedding", embedding);
}

async function editMemoryDaemonTimeout(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentDaemon = getMergedMemoryValue("daemon", globalCfg, localCfg) as
    | { idleTimeout?: number }
    | undefined;
  const currentMs = currentDaemon?.idleTimeout;
  const currentMin = currentMs ? currentMs / 60000 : undefined;

  if (currentMin !== undefined) {
    log.dim(`Current: ${currentMin} minutes`);
  }

  const value = await input({
    message: "Daemon idle timeout (minutes):",
    default: String(currentMin ?? 30),
    validate: (val) => {
      const n = Number(val);
      if (isNaN(n) || n < 1) return "Must be a positive number";
      return true;
    },
  });

  const scope = await askScope();
  if (scope === "back") return;
  writeMemoryField(scope, "daemon", {
    ...currentDaemon,
    idleTimeout: Number(value) * 60000,
  });
}

async function memorySubMenu(): Promise<void> {
  while (true) {
    const globalCfg = readJson<CodingFriendConfig>(globalConfigPath());
    const localCfg = readJson<CodingFriendConfig>(localConfigPath());

    const tierScope = getMemoryFieldScope("tier", globalCfg, localCfg);
    const tierVal = getMergedMemoryValue("tier", globalCfg, localCfg) as
      | string
      | undefined;

    const autoCaptureScope = getMemoryFieldScope(
      "autoCapture",
      globalCfg,
      localCfg,
    );
    const autoCaptureVal = getMergedMemoryValue(
      "autoCapture",
      globalCfg,
      localCfg,
    ) as boolean | undefined;

    const autoStartScope = getMemoryFieldScope(
      "autoStart",
      globalCfg,
      localCfg,
    );
    const autoStartVal = getMergedMemoryValue(
      "autoStart",
      globalCfg,
      localCfg,
    ) as boolean | undefined;

    const embeddingScope = getMemoryFieldScope(
      "embedding",
      globalCfg,
      localCfg,
    );
    const embeddingVal = getMergedMemoryValue(
      "embedding",
      globalCfg,
      localCfg,
    ) as { provider?: string } | undefined;

    const daemonScope = getMemoryFieldScope("daemon", globalCfg, localCfg);
    const daemonVal = getMergedMemoryValue("daemon", globalCfg, localCfg) as
      | { idleTimeout?: number }
      | undefined;

    const choice = await select({
      message: "Memory settings:",
      choices: injectBackChoice(
        [
          {
            name: `Tier ${formatScopeLabel(tierScope)}${tierVal ? ` (${tierVal})` : ""}`,
            value: "tier",
          },
          {
            name: `Auto-capture ${formatScopeLabel(autoCaptureScope)}${autoCaptureVal !== undefined ? ` (${autoCaptureVal})` : ""}`,
            value: "autoCapture",
          },
          {
            name: `Auto-start daemon ${formatScopeLabel(autoStartScope)}${autoStartVal !== undefined ? ` (${autoStartVal})` : ""}`,
            value: "autoStart",
          },
          {
            name: `Embedding ${formatScopeLabel(embeddingScope)}${embeddingVal?.provider ? ` (${embeddingVal.provider})` : ""}`,
            value: "embedding",
          },
          {
            name: `Daemon timeout ${formatScopeLabel(daemonScope)}${daemonVal?.idleTimeout ? ` (${daemonVal.idleTimeout / 60000}min)` : ""}`,
            value: "daemon",
          },
        ],
        "Back",
      ),
    });

    if (choice === BACK) return;

    switch (choice) {
      case "tier":
        await editMemoryTier(globalCfg, localCfg);
        break;
      case "autoCapture":
        await editMemoryAutoCapture(globalCfg, localCfg);
        break;
      case "autoStart":
        await editMemoryAutoStart(globalCfg, localCfg);
        break;
      case "embedding":
        await editMemoryEmbedding(globalCfg, localCfg);
        break;
      case "daemon":
        await editMemoryDaemonTimeout(globalCfg, localCfg);
        break;
    }
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
  saveStatuslineConfig(components);
  writeStatuslineSettings(hookResult.hookPath);

  log.success("Statusline configured!");
  if (components.length < ALL_COMPONENT_IDS.length) {
    log.dim(`Showing: ${components.join(", ")}`);
  } else {
    log.dim("Showing all components.");
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
    `${docsDir}/learn/`,
    `${docsDir}/sessions/`,
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
  const allRules = getAllRules("glob");
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

const em = chalk.hex("#10b981");

export async function configCommand(): Promise<void> {
  console.log();
  console.log(em("  ╭───────────────────────╮"));
  console.log(
    em("  │  ") +
      "✦" +
      em(" ") +
      chalk.bold.white("Coding Friend") +
      em("  ✦   │"),
  );
  console.log(em("  │    ") + chalk.dim("Config") + em("             │"));
  console.log(em("  ╰────────────╮──────────╯"));
  console.log(em("               ╰─▸"));
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

    const statuslineStatus = isStatuslineConfigured()
      ? chalk.green("configured")
      : chalk.yellow("not configured");
    const completionStatus = hasShellCompletion()
      ? chalk.green("installed")
      : chalk.yellow("not installed");

    const projectRules = getExistingRules(claudeLocalSettingsPath());
    const userRules = getExistingRules(claudeSettingsPath());
    const allRules = getAllRules("glob");
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
            description:
              "  Tier, auto-capture, auto-start, embedding provider, daemon timeout",
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
        await memorySubMenu();
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
