/**
 * Shared memory prompt helpers — used by both `cf config > memory` and `cf memory config/init`.
 */
import { existsSync } from "fs";
import { homedir } from "os";
import { confirm, input, select } from "@inquirer/prompts";
import chalk from "chalk";
import { join } from "path";
import { readJson, mergeJson, writeJson } from "./json.js";
import { log } from "./log.js";
import { globalConfigPath, localConfigPath } from "./paths.js";
import { getLibPath } from "./lib-path.js";
import { resolveMemoryDir } from "./config.js";
import type { CodingFriendConfig } from "../types.js";
import {
  BACK,
  injectBackChoice,
  askScope,
  formatScopeLabel,
} from "./prompt-utils.js";

// ─── Generic nested-field helpers ────────────────────────────────────

export function getMemoryFieldScope(
  field: string,
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): string {
  const globalSection = globalCfg?.memory as
    | Record<string, unknown>
    | undefined;
  const localSection = localCfg?.memory as Record<string, unknown> | undefined;
  const inGlobal = globalSection?.[field] !== undefined;
  const inLocal = localSection?.[field] !== undefined;
  if (inGlobal && inLocal) return "both";
  if (inGlobal) return "global";
  if (inLocal) return "local";
  return "-";
}

export function getMergedMemoryValue(
  field: string,
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): unknown {
  const localSection = localCfg?.memory as Record<string, unknown> | undefined;
  if (localSection?.[field] !== undefined) return localSection[field];
  const globalSection = globalCfg?.memory as
    | Record<string, unknown>
    | undefined;
  return globalSection?.[field];
}

export function writeMemoryField(
  scope: "global" | "local",
  field: string,
  value: unknown,
): void {
  const targetPath =
    scope === "global" ? globalConfigPath() : localConfigPath();
  const existingConfig = readJson<CodingFriendConfig>(targetPath);
  const existingSection =
    (existingConfig?.memory as Record<string, unknown>) ?? {};
  const updated = { ...existingSection, [field]: value };
  mergeJson(targetPath, { memory: updated });
  log.success(`Saved to ${targetPath}`);
}

// ─── Editor functions ────────────────────────────────────────────────

export async function editMemoryTier(
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

export async function editMemoryAutoCapture(
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

export async function editMemoryAutoStart(
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
    default: currentValue ?? true,
  });

  const scope = await askScope();
  if (scope === "back") return;
  writeMemoryField(scope, "autoStart", value);
}

export async function editMemoryEmbedding(
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
    ollamaUrl = await input({
      message: "Ollama server URL:",
      default: currentEmbedding?.ollamaUrl ?? "http://localhost:11434",
    });
    if (ollamaUrl === "http://localhost:11434") ollamaUrl = undefined;

    // Check Ollama health
    const mcpDir = getLibPath("cf-memory");
    try {
      const { isOllamaRunning, hasOllamaEmbeddingModel } = await import(
        join(mcpDir, "dist/lib/ollama.js")
      );
      const url = ollamaUrl ?? "http://localhost:11434";
      const running = await isOllamaRunning(url);

      if (!running) {
        console.log();
        log.warn("Ollama is not running at " + url);
        log.dim(
          "Install Ollama: https://ollama.ai · Docs: https://cf.dinhanhthi.com/cli/cf-memory",
        );
        console.log();
        const fallback = await confirm({
          message: "Fall back to Transformers.js instead?",
          default: true,
        });
        if (fallback) {
          const scope = await askScope();
          if (scope === "back") return;
          writeMemoryField(scope, "embedding", { provider: "transformers" });
          return;
        }
      } else {
        model = await input({
          message: "Ollama model name:",
          default: currentEmbedding?.model ?? "all-minilm:l6-v2",
        });

        const hasModel = await hasOllamaEmbeddingModel(model, url);
        if (!hasModel) {
          console.log();
          log.warn(`Model "${model}" not found in Ollama.`);
          log.dim(`Pull it with: ollama pull ${model}`);
          console.log();
          const proceed = await confirm({
            message: "Save this config anyway? (you can pull the model later)",
            default: true,
          });
          if (!proceed) return;
        }
      }
    } catch {
      // cf-memory not built yet — skip health check
      model = await input({
        message: "Ollama model name:",
        default: currentEmbedding?.model ?? "all-minilm:l6-v2",
      });
    }
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

export async function editMemoryDaemonTimeout(
  globalCfg: CodingFriendConfig | null,
  localCfg: CodingFriendConfig | null,
): Promise<void> {
  const currentDaemon = getMergedMemoryValue("daemon", globalCfg, localCfg) as
    | { idleTimeout?: number }
    | undefined;
  const currentMs = currentDaemon?.idleTimeout;
  const currentMin = currentMs !== undefined ? currentMs / 60000 : undefined;

  if (currentMin !== undefined) {
    log.dim(`Current: ${currentMin} minutes`);
  }

  const value = await input({
    message: "Daemon idle timeout (minutes, 0 = no timeout):",
    default: String(currentMin ?? 0),
    validate: (val) => {
      const n = Number(val);
      if (isNaN(n) || n < 0)
        return "Must be 0 (no timeout) or a positive number";
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

// ─── MCP setup ──────────────────────────────────────────────────────

/**
 * Write the coding-friend-memory MCP entry into `.mcp.json` (merge, don't overwrite).
 */
export function writeMemoryMcpEntry(
  serverPath: string,
  memoryDir: string,
): void {
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
  log.success("Added coding-friend-memory to .mcp.json");
}

export function getMemoryMcpStatus(): {
  configured: boolean;
  scope: "local" | "global" | null;
} {
  const localMcpPath = join(process.cwd(), ".mcp.json");
  const localMcp = readJson<Record<string, unknown>>(localMcpPath);
  const localServers = localMcp?.mcpServers as
    | Record<string, unknown>
    | undefined;
  if (localServers != null && "coding-friend-memory" in localServers) {
    return { configured: true, scope: "local" };
  }

  const globalMcpPath = join(homedir(), ".claude", ".mcp.json");
  const globalMcp = readJson<Record<string, unknown>>(globalMcpPath);
  const globalServers = globalMcp?.mcpServers as
    | Record<string, unknown>
    | undefined;
  if (globalServers != null && "coding-friend-memory" in globalServers) {
    return { configured: true, scope: "global" };
  }

  return { configured: false, scope: null };
}

export async function editMemoryMcp(): Promise<void> {
  const status = getMemoryMcpStatus();

  if (status.configured) {
    const label =
      status.scope === "local"
        ? chalk.green("configured") + chalk.dim(" (local .mcp.json)")
        : chalk.green("configured") +
          chalk.dim(" (global ~/.claude/.mcp.json)") +
          " " +
          chalk.yellow("⚠ only works for one project");
    log.info(`MCP: ${label}`);

    const reconfigure = await confirm({
      message: "Reconfigure Memory MCP in local .mcp.json?",
      default: false,
    });
    if (!reconfigure) return;
  }

  let mcpDir: string;
  try {
    mcpDir = getLibPath("cf-memory");
  } catch {
    log.warn(
      "cf-memory package not found. Install the CLI first: npm i -g coding-friend-cli",
    );
    return;
  }

  const serverPath = join(mcpDir, "dist", "index.js");
  if (!existsSync(serverPath)) {
    log.warn(
      'cf-memory not built yet. Run "cf memory mcp" after building to get the config.',
    );
    return;
  }

  const memoryDir = resolveMemoryDir();
  writeMemoryMcpEntry(serverPath, memoryDir);
}

// ─── Memory config menu (shared by cf config > memory and cf memory config) ──

export async function memoryConfigMenu(opts?: {
  exitLabel?: string;
}): Promise<void> {
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
    ) as { provider?: string; model?: string } | undefined;

    const daemonScope = getMemoryFieldScope("daemon", globalCfg, localCfg);
    const daemonVal = getMergedMemoryValue("daemon", globalCfg, localCfg) as
      | { idleTimeout?: number }
      | undefined;

    const embeddingLabel = embeddingVal?.provider
      ? embeddingVal.model
        ? `${embeddingVal.model} (${embeddingVal.provider})`
        : embeddingVal.provider
      : "";

    const mcpStatus = getMemoryMcpStatus();
    const mcpLabel = mcpStatus.configured
      ? mcpStatus.scope === "local"
        ? chalk.green("configured") + chalk.dim(" (.mcp.json)")
        : chalk.green("configured") +
          chalk.dim(" (global)") +
          " " +
          chalk.yellow("⚠")
      : chalk.dim("not configured");

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
            name: `Embedding ${formatScopeLabel(embeddingScope)}${embeddingLabel ? ` (${embeddingLabel})` : ""}`,
            value: "embedding",
          },
          {
            name: `Daemon timeout ${formatScopeLabel(daemonScope)}${daemonVal?.idleTimeout ? ` (${daemonVal.idleTimeout / 60000}min)` : ""}`,
            value: "daemon",
          },
          {
            name: `MCP setup (${mcpLabel})`,
            value: "mcp",
          },
        ],
        opts?.exitLabel ?? "Back",
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
      case "mcp":
        await editMemoryMcp();
        break;
    }
  }
}
