import { readFileSync, existsSync } from "fs";
import { join, basename } from "path";
import type { ParsedHook, PlatformId, GeneratedFile } from "../types.js";

// ---------------------------------------------------------------------------
// Hook parser
// ---------------------------------------------------------------------------

interface ClaudeHookEntry {
  matcher: string;
  hooks: Array<{
    type: string;
    command: string;
    async?: boolean;
  }>;
}

interface ClaudeHooksJson {
  hooks: Record<string, ClaudeHookEntry[]>;
}

/**
 * Parse all hooks from the plugin's hooks.json and their script files.
 */
export function parseAllHooks(pluginRoot: string): ParsedHook[] {
  const hooksJsonPath = join(pluginRoot, "hooks", "hooks.json");
  if (!existsSync(hooksJsonPath)) return [];

  const hooksJson: ClaudeHooksJson = JSON.parse(readFileSync(hooksJsonPath, "utf-8"));
  const parsed: ParsedHook[] = [];

  for (const [event, entries] of Object.entries(hooksJson.hooks)) {
    for (const entry of entries) {
      for (const hook of entry.hooks) {
        const scriptPath = hook.command.replace("${CLAUDE_PLUGIN_ROOT}/", "");
        const fullPath = join(pluginRoot, scriptPath);
        const scriptContent = existsSync(fullPath) ? readFileSync(fullPath, "utf-8") : "";

        parsed.push({
          event,
          matcher: entry.matcher,
          scriptPath,
          scriptName: basename(scriptPath),
          async: hook.async ?? false,
          scriptContent,
        });
      }
    }
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Platform hook config generators
// ---------------------------------------------------------------------------

/** Event name mapping: Claude Code → target platform */
const EVENT_MAP: Record<string, Record<string, string>> = {
  cursor: {
    SessionStart: "sessionStart",
    UserPromptSubmit: "beforeSubmitPrompt",
    PreToolUse: "preToolUse",
    PostToolUse: "postToolUse",
    PreCompact: "preCompact",
  },
  windsurf: {
    UserPromptSubmit: "pre_user_prompt",
    PreToolUse: "pre_read_code",
    PostToolUse: "post_read_code",
  },
  copilot: {
    SessionStart: "sessionStart",
    UserPromptSubmit: "userPromptSubmitted",
    PreToolUse: "preToolUse",
    PostToolUse: "postToolUse",
    PreCompact: "preCompact",
  },
};

/**
 * Which hooks are worth porting to other platforms.
 * Skip statusline (IDE-specific) and context-tracker (Claude-specific optimization).
 */
const PORTABLE_HOOKS = new Set([
  "session-init.sh",
  "dev-rules-reminder.sh",
  "privacy-block.sh",
  "scout-block.sh",
]);

/**
 * Hooks that provide security enforcement (should be embedded in rules
 * for platforms that don't support native hooks).
 */
const SECURITY_HOOKS = new Set(["privacy-block.sh", "scout-block.sh"]);

/**
 * Generate hooks config + scripts for a platform with native hook support.
 */
export function compileHooksForPlatform(
  hooks: ParsedHook[],
  platformId: PlatformId,
  scriptsDir: string,
): { config: string; scripts: GeneratedFile[] } {
  const eventMap = EVENT_MAP[platformId];
  if (!eventMap) {
    return { config: "", scripts: [] };
  }

  const portableHooks = hooks.filter((h) => PORTABLE_HOOKS.has(h.scriptName));
  const scripts: GeneratedFile[] = [];

  if (platformId === "cursor") {
    return compileCursorHooks(portableHooks, eventMap, scriptsDir);
  }
  if (platformId === "windsurf") {
    return compileWindsurfHooks(portableHooks, eventMap, scriptsDir);
  }
  if (platformId === "copilot") {
    return compileCopilotHooks(portableHooks, eventMap, scriptsDir);
  }

  return { config: "", scripts };
}

/**
 * Extract security rule text from hooks for embedding in rules files
 * (used by platforms without native hook support).
 */
export function extractSecurityRulesText(hooks: ParsedHook[]): string {
  const securityHooks = hooks.filter((h) => SECURITY_HOOKS.has(h.scriptName));
  if (securityHooks.length === 0) return "";

  const lines = [
    "## Security Rules (from coding-friend hooks)",
    "",
    "These rules are normally enforced by hooks but this platform does not support them natively.",
    "Please follow these rules manually:",
    "",
  ];

  for (const hook of securityHooks) {
    if (hook.scriptName === "privacy-block.sh") {
      lines.push(
        "### Privacy Protection",
        "",
        "**Do NOT read or write these sensitive files:**",
        "- `.env`, `.env.*` (except `.env.example`, `.env.sample`, `.env.template`)",
        "- `credentials*`, `*secret*`",
        "- `*.pem`, `*.key`, `id_rsa`, `id_ed25519`",
        "- `.ssh/`, `.aws/`, `.gnupg/`",
        "",
      );
    }
    if (hook.scriptName === "scout-block.sh") {
      lines.push(
        "### Scope Protection",
        "",
        "**Respect `.coding-friend/ignore` patterns.** Do not read files or directories listed there.",
        "Common patterns: `node_modules`, `dist`, `build`, `.next`, `__pycache__`, `.venv`, `vendor`, `target`, `.git`, `coverage`.",
        "",
      );
    }
  }

  return lines.join("\n");
}

/**
 * Extract dev rules reminder text for embedding in rules.
 */
export function extractDevRulesText(hooks: ParsedHook[]): string {
  const reminder = hooks.find((h) => h.scriptName === "dev-rules-reminder.sh");
  if (!reminder) return "";

  return [
    "## Development Rules (from coding-friend)",
    "",
    "1. **Check skills first** — Before any task, check if a relevant skill exists.",
    "2. **Test before code** — No production code without a failing test. RED → GREEN → REFACTOR.",
    "3. **Verify before claiming** — Never claim done without running tests and showing output.",
    "4. **Respect boundaries** — Do not read files in .coding-friend/ignore or .env/credentials.",
    "5. **Commit with purpose** — Conventional commits. Focus on \"why\", not \"what\".",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Cursor hooks format
// ---------------------------------------------------------------------------

function compileCursorHooks(
  hooks: ParsedHook[],
  eventMap: Record<string, string>,
  scriptsDir: string,
): { config: string; scripts: GeneratedFile[] } {
  const hooksByEvent: Record<string, Array<{ command: string }>> = {};
  const scripts: GeneratedFile[] = [];

  for (const hook of hooks) {
    const event = eventMap[hook.event];
    if (!event) continue;

    const scriptFile = `cf-${hook.scriptName}`;
    const scriptDest = join(scriptsDir, scriptFile);

    if (!hooksByEvent[event]) hooksByEvent[event] = [];
    hooksByEvent[event].push({ command: `.cursor/hooks/${scriptFile}` });

    scripts.push({
      path: scriptDest,
      content: wrapForCursor(hook),
    });
  }

  const config = JSON.stringify({ version: 1, hooks: hooksByEvent }, null, 2);
  return { config, scripts };
}

function wrapForCursor(hook: ParsedHook): string {
  // Cursor hooks use exit code 2 to block (same as Claude Code)
  // but output format uses permissionDecision instead of hookSpecificOutput
  return [
    "#!/usr/bin/env bash",
    `# coding-friend: ${hook.scriptName} (adapted for Cursor)`,
    `# Original event: ${hook.event}, matcher: ${hook.matcher}`,
    "",
    'INPUT=$(cat)',
    "",
    "# --- Original script logic ---",
    hook.scriptContent,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Windsurf hooks format
// ---------------------------------------------------------------------------

function compileWindsurfHooks(
  hooks: ParsedHook[],
  eventMap: Record<string, string>,
  scriptsDir: string,
): { config: string; scripts: GeneratedFile[] } {
  const hooksByEvent: Record<string, Array<{ command: string; show_output?: boolean }>> = {};
  const scripts: GeneratedFile[] = [];

  for (const hook of hooks) {
    const event = eventMap[hook.event];
    if (!event) continue;

    // Windsurf maps PreToolUse to separate pre_read_code / pre_write_code
    const events = hook.event === "PreToolUse" ? ["pre_read_code", "pre_write_code"] : [event];

    const scriptFile = `cf-${hook.scriptName}`;
    const scriptDest = join(scriptsDir, scriptFile);

    for (const ev of events) {
      if (!hooksByEvent[ev]) hooksByEvent[ev] = [];
      hooksByEvent[ev].push({ command: `.windsurf/hooks/${scriptFile}` });
    }

    scripts.push({
      path: scriptDest,
      content: wrapForWindsurf(hook),
    });
  }

  const config = JSON.stringify({ hooks: hooksByEvent }, null, 2);
  return { config, scripts };
}

function wrapForWindsurf(hook: ParsedHook): string {
  return [
    "#!/usr/bin/env bash",
    `# coding-friend: ${hook.scriptName} (adapted for Windsurf)`,
    `# Original event: ${hook.event}, matcher: ${hook.matcher}`,
    "",
    'INPUT=$(cat)',
    "",
    "# --- Original script logic ---",
    hook.scriptContent,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Copilot hooks format
// ---------------------------------------------------------------------------

function compileCopilotHooks(
  hooks: ParsedHook[],
  eventMap: Record<string, string>,
  scriptsDir: string,
): { config: string; scripts: GeneratedFile[] } {
  const hooksByEvent: Record<
    string,
    Array<{ type: string; bash: string; timeoutSec?: number }>
  > = {};
  const scripts: GeneratedFile[] = [];

  for (const hook of hooks) {
    const event = eventMap[hook.event];
    if (!event) continue;

    const scriptFile = `cf-${hook.scriptName}`;
    const scriptDest = join(scriptsDir, scriptFile);

    if (!hooksByEvent[event]) hooksByEvent[event] = [];
    hooksByEvent[event].push({
      type: "command",
      bash: `.github/hooks/${scriptFile}`,
      timeoutSec: 30,
    });

    scripts.push({
      path: scriptDest,
      content: wrapForCopilot(hook),
    });
  }

  const config = JSON.stringify({ version: 1, hooks: hooksByEvent }, null, 2);
  return { config, scripts };
}

function wrapForCopilot(hook: ParsedHook): string {
  return [
    "#!/usr/bin/env bash",
    `# coding-friend: ${hook.scriptName} (adapted for GitHub Copilot)`,
    `# Original event: ${hook.event}, matcher: ${hook.matcher}`,
    "",
    'INPUT=$(cat)',
    "",
    "# --- Original script logic ---",
    hook.scriptContent,
  ].join("\n");
}
