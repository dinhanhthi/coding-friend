import { detectMemoryMcpState } from "./mcp-state.js";

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
}

export interface LearnMcpHealthDeps {
  /** Returns the parsed local .mcp.json, or null if not present/invalid. */
  readMcpJson: () => Record<string, unknown> | null;
  /** Check whether a path exists on disk. */
  pathExists: (p: string) => boolean;
  /** List .md files in the given directory (recursive). Returns filenames. */
  listMdFiles: (dir: string) => string[];
  /** Resolved docs directory path. */
  docsDir: string;
  /** Absolute path to learn-mcp dist/index.js (for package-built check). */
  learnMcpDistPath: string;
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

  // ── (1) Config check ────────────────────────────────────────────────────────
  const mcpJson = deps.readMcpJson();
  const state = detectMemoryMcpState(mcpJson, deps.pathExists);

  if (state.kind === "npx") {
    checks.push({ label: "Config (.mcp.json)", ok: true });
  } else if (state.kind === "none") {
    checks.push({
      label: "Config (.mcp.json)",
      ok: false,
      detail: "coding-friend-memory not configured",
      fix: 'Run "cf memory mcp" to add the MCP entry',
    });
  } else {
    // stale or legacy-valid — both are failures (push user to npx format)
    const detail =
      state.kind === "stale"
        ? `Stale path: ${state.path}`
        : `Absolute path (legacy): ${state.path}`;
    checks.push({
      label: "Config (.mcp.json)",
      ok: false,
      detail,
      fix: 'Run "cf memory mcp" to update to the npx format',
    });
  }

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
    daemonCheckError =
      err instanceof Error ? err.message : String(err);
  }

  checks.push({
    label: "Daemon status",
    ok: daemonRunning,
    ...(daemonRunning
      ? {}
      : {
          warn: true,
          detail: daemonCheckError
            ? `check failed: ${daemonCheckError}`
            : "stopped (starts automatically on MCP connect)",
        }),
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

  // ── (1) Config check ────────────────────────────────────────────────────────
  const mcpJson = deps.readMcpJson();
  const servers = mcpJson?.mcpServers;
  const hasEntry =
    servers != null &&
    typeof servers === "object" &&
    !Array.isArray(servers) &&
    "coding-friend-learn" in (servers as Record<string, unknown>);

  checks.push({
    label: "Config (.mcp.json)",
    ok: hasEntry,
    ...(hasEntry
      ? {}
      : {
          detail: "coding-friend-learn not configured",
          fix: 'Run "cf mcp" to print the config snippet and add it',
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
