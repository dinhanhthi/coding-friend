import chalk from "chalk";
import { detectMemoryMcpState } from "./mcp-state.js";
import { isMemoryMcpRegistered } from "./memory-mcp-register.js";

/**
 * A single health check result.
 *
 * - ok=true           → green ✓
 * - ok=false, warn    → yellow ⚠ (soft issue, doesn't fail overall result.ok)
 * - ok=false, !warn   → red ✗   (hard fail, drives "Run cf mcp to fix" hint)
 */
export interface HealthCheck {
  label: string;
  ok: boolean;
  warn?: boolean;
  detail?: string;
  fix?: string;
}

export interface McpHealthResult {
  checks: HealthCheck[];
  ok: boolean;
}

// ─── Injectable dependencies ─────────────────────────────────────────────────

export interface MemoryMcpHealthDeps {
  /** Returns the parsed local .mcp.json, or null if not present/invalid. */
  readMcpJson: () => Record<string, unknown> | null;
  /** Check whether a path exists on disk. */
  pathExists: (p: string) => boolean;
  /** Check whether the memory daemon is running. */
  isDaemonRunning: () => Promise<boolean>;
  /** Absolute path to cf-memory dist/index.js (for package-built check). */
  memoryDistPath: string;
  /**
   * Returns true if coding-friend-memory is registered at user scope
   * (via `claude mcp add --scope user`). Defaults to the real
   * isMemoryMcpRegistered() from memory-mcp-register when omitted.
   */
  isRegistered?: () => boolean;
}

export interface LearnMcpHealthDeps {
  /** Returns true if coding-friend-learn MCP is registered (any scope). */
  checkRegistered: () => boolean;
  /** Check whether a path exists on disk. */
  pathExists: (p: string) => boolean;
  /** List .md files in the given directory (recursive). Returns filenames. */
  listMdFiles: (dir: string) => string[];
  /** Resolved learn directory path. */
  docsDir: string;
  /** Absolute path to learn-mcp dist/index.js (for package-built check). */
  learnMcpDistPath: string;
}

// ─── printHealthSection ───────────────────────────────────────────────────────

export function printHealthSection(result: McpHealthResult): void {
  console.log(chalk.dim("─── Health Check ───"));
  for (const check of result.checks) {
    if (check.ok) {
      const detail = check.detail ? `: ${check.detail}` : "";
      console.log(chalk.green(`  ✓ ${check.label}${detail}`));
    } else if (check.warn) {
      const detail = check.detail ? `: ${check.detail}` : "";
      console.log(chalk.yellow(`  ⚠ ${check.label}${detail}`));
    } else {
      const detail = check.detail ? `: ${check.detail}` : "";
      console.log(chalk.red(`  ✗ ${check.label}${detail}`));
      if (check.fix) {
        console.log(chalk.dim(`    → ${check.fix}`));
      }
    }
  }
  console.log();
}

// ─── checkMemoryMcpHealth ─────────────────────────────────────────────────────

/**
 * Run health checks for the memory MCP server (coding-friend-memory).
 *
 * All filesystem and daemon interactions are injected via `deps` so this
 * function is fully testable without touching the real filesystem.
 */
export async function checkMemoryMcpHealth(
  deps: MemoryMcpHealthDeps,
): Promise<McpHealthResult> {
  const checks: HealthCheck[] = [];
  const checkRegistered = deps.isRegistered ?? isMemoryMcpRegistered;

  // ── (1) User-scope registration check ───────────────────────────────────────
  const registered = checkRegistered();

  checks.push({
    label: "Registered (user scope)",
    ok: registered,
    ...(registered
      ? {}
      : {
          detail: "coding-friend-memory not registered",
          fix: 'Run "cf mcp" to register',
        }),
  });

  // ── (1b) Shadow warning — project .mcp.json entry shadows user-scope server ─
  const mcpJson = deps.readMcpJson();
  const state = detectMemoryMcpState(mcpJson, deps.pathExists);

  if (state.kind === "stale") {
    checks.push({
      label: "Project .mcp.json",
      ok: false,
      warn: true,
      detail: `Stale entry shadows user-scope server (path missing: ${state.path})`,
      fix: 'Run "cf update" to remove it automatically',
    });
  } else if (state.kind === "legacy-valid") {
    checks.push({
      label: "Project .mcp.json",
      ok: false,
      warn: true,
      detail: `Legacy absolute-path entry shadows user-scope server`,
      fix: 'Run "cf update" to migrate to the user-scope registration',
    });
  } else if (state.kind === "npx") {
    checks.push({
      label: "Project .mcp.json",
      ok: false,
      warn: true,
      detail: "Project-scope npx entry shadows user-scope server",
      fix: 'Run "cf update" to remove it automatically',
    });
  }
  // state.kind === "none" → no project entry, no shadow warning needed

  // ── (2) Package built ────────────────────────────────────────────────────────
  const distExists = deps.pathExists(deps.memoryDistPath);
  checks.push({
    label: "Package built",
    ok: distExists,
    ...(distExists
      ? {}
      : {
          detail: "cf-memory not built",
          fix: 'Run "cf memory init" to build',
        }),
  });

  // ── (3) Daemon status (warn only — daemon starts lazy on MCP connect) ────────
  let daemonRunning = false;
  let daemonCheckError: string | undefined;
  try {
    daemonRunning = await deps.isDaemonRunning();
  } catch (err) {
    // If we can't check, treat as stopped (warn) — capture the error detail
    daemonCheckError = err instanceof Error ? err.message : String(err);
  }

  checks.push({
    label: "Daemon",
    ok: daemonRunning,
    detail: daemonRunning
      ? "running"
      : daemonCheckError
        ? `check failed: ${daemonCheckError}`
        : "stopped (starts automatically on MCP connect)",
    ...(!daemonRunning ? { warn: true } : {}),
  });

  // result.ok = all checks pass, ignoring warns
  const ok = checks.every((c) => c.ok || c.warn === true);
  return { checks, ok };
}

// ─── checkLearnMcpHealth ──────────────────────────────────────────────────────

/**
 * Run health checks for the learn MCP server (coding-friend-learn).
 *
 * All filesystem interactions are injected via `deps` so this function is
 * fully testable without touching the real filesystem.
 */
export async function checkLearnMcpHealth(
  deps: LearnMcpHealthDeps,
): Promise<McpHealthResult> {
  const checks: HealthCheck[] = [];

  // ── (1) Registration check ──────────────────────────────────────────────────
  const isRegistered = deps.checkRegistered();

  checks.push({
    label: "Registered (claude mcp)",
    ok: isRegistered,
    ...(isRegistered
      ? {}
      : {
          detail: "coding-friend-learn not registered",
          fix: 'Run "cf mcp" to register',
        }),
  });

  // ── (2) Package built ────────────────────────────────────────────────────────
  const distExists = deps.pathExists(deps.learnMcpDistPath);
  checks.push({
    label: "Package built",
    ok: distExists,
    ...(distExists
      ? {}
      : {
          detail: "learn-mcp not built",
          fix: 'Run "cf mcp" to install and build',
        }),
  });

  // ── (3) Docs directory ───────────────────────────────────────────────────────
  const mdFiles = deps.listMdFiles(deps.docsDir);
  const hasDocs = mdFiles.length > 0;
  checks.push({
    label: "Docs directory",
    ok: hasDocs,
    ...(hasDocs
      ? {}
      : {
          detail: `No .md files found in ${deps.docsDir}`,
          fix: 'Run "/cf-learn" to generate docs',
        }),
  });

  const ok = checks.every((c) => c.ok || c.warn === true);
  return { checks, ok };
}
