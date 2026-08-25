#!/usr/bin/env node
/**
 * PreToolUse hook (Antigravity): block directories matching ignore patterns.
 *
 * Same rule set as scout-block.cjs (defaults + .coding-friend/ignore merge).
 * Speaks AGY's hook contract:
 *   stdin  – JSON with camelCase toolCall.args
 *   stdout – {"decision":"allow"} or {"decision":"deny","reason":"..."}
 *   Exit 0 always (including deny). Malformed JSON fails open.
 *
 * Configuration:
 *   "scoutBlock": false in .coding-friend/config.json disables the hook.
 *   Config and ignore are resolved from workspacePaths[0] (AGY hook cwd
 *   is the plugin dir).
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  parseIgnoreFile,
  buildEffectivePatterns,
  isBlocked,
} = require("./scout-block.cjs");

// Documented AGY path keys — keep in sync with agy_path_args in
// plugin/lib/agy-hook-io.sh. Nested objects/arrays are walked so
// ReplacementChunks[].TargetFile is collected; CodeContent, Query, and
// other non-path strings are skipped.
const AGY_PATH_KEYS = {
  AbsolutePath: 1,
  TargetFile: 1,
  SearchPath: 1,
  SearchDirectory: 1,
  DirectoryPath: 1,
  Pattern: 1,
  Cwd: 1,
  CommandLine: 1,
};

function collectAgyPathKeys(v, out, key) {
  if (typeof v === "string") {
    if (v && key && AGY_PATH_KEYS[key]) out.push(v);
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) collectAgyPathKeys(x, out, key);
    return;
  }
  if (v && typeof v === "object") {
    for (const k of Object.keys(v)) collectAgyPathKeys(v[k], out, k);
  }
}

/**
 * Documented path-key strings under toolCall.args, plus run_command
 * CommandLine even when it is not path-like (mirrors agy_path_args).
 */
function extractAgyPaths(payload) {
  const toolCall = payload && payload.toolCall;
  const args = toolCall && toolCall.args;
  const out = [];
  collectAgyPathKeys(args, out);
  if (
    toolCall &&
    toolCall.name === "run_command" &&
    args &&
    typeof args.CommandLine === "string" &&
    args.CommandLine &&
    out.indexOf(args.CommandLine) === -1
  ) {
    out.push(args.CommandLine);
  }
  return out;
}

function pathCheckVariants(p) {
  const out = [p];
  if (typeof p === "string" && /[*?]/.test(p)) {
    const stripped = p.replace(/[*?]/g, "");
    if (stripped) out.push(stripped);
  }
  return out;
}

function emitAllow() {
  process.stdout.write('{"decision":"allow"}\n');
  process.exit(0);
}

function emitDeny(reason) {
  process.stdout.write(JSON.stringify({ decision: "deny", reason }) + "\n");
  process.exit(0);
}

function expandTilde(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveWorkspaceRoot(parsed) {
  const raw = parsed && parsed.workspacePaths;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== "string" || !item.trim()) continue;
      const candidate = expandTilde(item.trim());
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          return candidate;
        }
      } catch {
        // skip unreadable / invalid entries
      }
    }
  }
  return process.cwd();
}

function loadEffectivePatterns(workspaceRoot) {
  let userContent = "";
  const pluginRoot =
    process.env.PLUGIN_ROOT || path.resolve(__dirname, "..");
  const localIgnore = path.join(workspaceRoot, ".coding-friend", "ignore");
  const pluginIgnore = path.join(pluginRoot, ".coding-friend", "ignore");

  if (fs.existsSync(localIgnore)) {
    userContent = fs.readFileSync(localIgnore, "utf8");
  } else if (fs.existsSync(pluginIgnore)) {
    userContent = fs.readFileSync(pluginIgnore, "utf8");
  }

  const { blocks, negations } = parseIgnoreFile(userContent);
  return buildEffectivePatterns(blocks, negations);
}

function main() {
  try {
    let input = "";
    try {
      input = fs.readFileSync(0, "utf8");
    } catch {
      emitAllow();
    }

    if (!input.trim()) {
      emitAllow();
    }

    let parsed;
    try {
      parsed = JSON.parse(input);
    } catch {
      emitAllow();
    }

    const workspaceRoot = resolveWorkspaceRoot(parsed);
    const configPath = path.join(workspaceRoot, ".coding-friend", "config.json");
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (config.scoutBlock === false) {
          emitAllow();
        }
      } catch {
        // Malformed config — ignore, continue with defaults
      }
    }

    const patterns = loadEffectivePatterns(workspaceRoot);

    const paths = extractAgyPaths(parsed);
    for (const p of paths) {
      for (const candidate of pathCheckVariants(p)) {
        const matchedPattern = isBlocked(candidate, patterns);
        if (matchedPattern) {
          emitDeny(
            `Access to '${p}' blocked by ignore pattern: ${matchedPattern}`,
          );
        }
      }
    }

    emitAllow();
  } catch {
    emitAllow();
  }
}

if (require.main === module) {
  main();
}
