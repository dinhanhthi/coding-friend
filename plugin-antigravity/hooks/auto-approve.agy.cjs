#!/usr/bin/env node
/**
 * PreToolUse hook (Antigravity): auto-approve safe tool calls.
 *
 * Deterministic rules only — no LLM. Speaks AGY's hook contract:
 *   stdin  – JSON with camelCase toolCall / workspacePaths
 *   stdout – {"decision":"allow"|"deny"|"ask", "reason"?}
 *   Exit 0 always (including deny). Malformed JSON fails open with ask.
 *
 * Configuration:
 *   "autoApproveAgy": true in CF_CONFIG_FILE or
 *   {workspacePaths[0]|cwd}/.coding-friend/config.json (opt-in).
 *   Default (false or missing) → {"decision":"ask"}.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildReason,
  classifyByRules,
  extractRmPaths,
  isInProjectDir,
} = require("./auto-approve.cjs");

const READ_ONLY_TOOLS = new Set([
  "view_file",
  "grep_search",
  "find_by_name",
  "list_dir",
  "view_file_outline",
  "read_url_content",
  "search_web",
]);

const WRITE_TOOLS = new Set([
  "write_to_file",
  "replace_file_content",
  "multi_replace_file_content",
]);

function readConfigFile(filePath, label) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    process.stderr.write(
      `[auto-approve.agy] ${label} config parse error: ${err && err.message ? err.message : err}\n`,
    );
    return {};
  }
}

function stringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

function workspaceRoots(parsed) {
  const raw = parsed && parsed.workspacePaths;
  if (!Array.isArray(raw)) return [];
  return raw.filter((p) => typeof p === "string" && p.trim());
}

function resolveProjectDir(parsed) {
  const roots = workspaceRoots(parsed);
  if (roots.length > 0) return roots[0];
  return process.cwd();
}

function loadAgyAutoApproveConfig(homeDir, projectDir) {
  const globalConfig = readConfigFile(
    path.join(homeDir, ".coding-friend", "config.json"),
    "global",
  );
  const localPath = process.env.CF_CONFIG_FILE
    ? process.env.CF_CONFIG_FILE
    : path.join(projectDir, ".coding-friend", "config.json");
  const localConfig = readConfigFile(localPath, "local");
  const merged = { ...globalConfig, ...localConfig };
  const allowExtra = [
    ...new Set([
      ...stringList(localConfig.autoApproveAllowExtra),
      ...stringList(globalConfig.autoApproveAllowExtra),
    ]),
  ];

  return {
    enabled: merged.autoApproveAgy === true,
    allowExtra,
  };
}

function collectTargetFiles(args) {
  const out = [];
  function walk(value) {
    if (value == null) return;
    if (typeof value === "string") return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value !== "object") return;
    const target = value.TargetFile;
    if (typeof target === "string" && target) {
      out.push(target);
    } else if (Array.isArray(target)) {
      for (const item of target) {
        if (typeof item === "string" && item) out.push(item);
      }
    }
    for (const nested of Object.values(value)) {
      if (nested && typeof nested === "object") walk(nested);
    }
  }
  walk(args);
  return out;
}

function isInsideAnyWorkspace(filePath, roots) {
  if (!roots.length) return false;
  return roots.some((root) => isInProjectDir(filePath, root));
}

function expandTilde(p) {
  if (typeof p !== "string" || !p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function runCommandCwd(args) {
  const raw = args && typeof args.Cwd === "string" ? args.Cwd.trim() : "";
  return raw ? expandTilde(raw) : "";
}

function resolveRmPath(filePath, cwd, fallbackRoot) {
  const expanded = expandTilde(filePath);
  if (!expanded) return expanded;
  if (path.isAbsolute(expanded)) return expanded;
  if (cwd) {
    const absBase = path.isAbsolute(cwd)
      ? cwd
      : path.resolve(fallbackRoot || process.cwd(), cwd);
    return path.resolve(absBase, expanded);
  }
  return expanded;
}

function emit(decision, reason) {
  const payload = { decision };
  if (reason) payload.reason = reason;
  process.stdout.write(JSON.stringify(payload) + "\n");
  process.exit(0);
}

function emitAsk() {
  emit("ask");
}

function reasonContextForBash(toolInput, decision) {
  if (decision === "allow") {
    const rmPaths = extractRmPaths((toolInput && toolInput.command) || "");
    if (rmPaths) return { source: "rm-project-dir" };
  }
  return undefined;
}

function classifyWrite(args, roots) {
  const files = collectTargetFiles(args);
  if (files.length === 0 || !roots.length) return "ask";
  return files.every((filePath) => isInsideAnyWorkspace(filePath, roots))
    ? "allow"
    : "ask";
}

function classifyRunCommand(args, roots, allowExtra) {
  const cmd = (args && args.CommandLine) || "";
  const cwd = runCommandCwd(args);
  const projectDir = roots[0];
  const toolInput = { command: cmd };
  const decision = classifyByRules("Bash", toolInput, projectDir, allowExtra);
  if (decision === "deny") return "deny";
  if (decision !== "allow") return "ask";

  // Cwd outside the workspace: never allow (relative rm "." would otherwise
  // resolve against projectDir and look in-project).
  if (cwd && (!roots.length || !isInsideAnyWorkspace(cwd, roots))) {
    return "ask";
  }

  // classifyByRules may allow project-scoped `rm` relative to projectDir.
  // Resolve relative rm paths against Cwd (when set), else workspace.
  const rmPaths = extractRmPaths(cmd.trim());
  if (rmPaths && rmPaths.length > 0) {
    const resolved = rmPaths.map((p) => resolveRmPath(p, cwd, projectDir));
    if (
      !roots.length ||
      !resolved.every((p) => isInsideAnyWorkspace(p, roots))
    ) {
      return "ask";
    }
  }

  return "allow";
}

function main() {
  try {
    let input = "";
    try {
      input = fs.readFileSync(0, "utf8");
    } catch (err) {
      process.stderr.write(
        `[auto-approve.agy] stdin read error: ${err && err.message ? err.message : err}\n`,
      );
      emitAsk();
    }

    if (!input.trim()) {
      emitAsk();
    }

    let parsed;
    try {
      parsed = JSON.parse(input);
    } catch (err) {
      process.stderr.write(
        `[auto-approve.agy] JSON parse error: ${err && err.message ? err.message : err}\n`,
      );
      emitAsk();
    }

    const roots = workspaceRoots(parsed);
    const projectDir = resolveProjectDir(parsed);
    const { enabled, allowExtra } = loadAgyAutoApproveConfig(
      os.homedir(),
      projectDir,
    );
    if (!enabled) {
      emitAsk();
    }

    const toolCall = parsed && parsed.toolCall;
    const toolName = toolCall && toolCall.name;
    const args = toolCall && toolCall.args;
    if (!toolName || typeof toolName !== "string") {
      emitAsk();
    }
    const toolArgs = args && typeof args === "object" ? args : {};

    if (READ_ONLY_TOOLS.has(toolName)) {
      emit("allow", buildReason(toolName, toolArgs, "allow"));
    }

    if (WRITE_TOOLS.has(toolName)) {
      const decision = classifyWrite(toolArgs, roots);
      if (decision === "allow") {
        emit(
          "allow",
          buildReason(toolName, toolArgs, "allow", { source: "working-dir" }),
        );
      }
      emitAsk();
    }

    if (toolName === "run_command") {
      const cmd = toolArgs.CommandLine || "";
      const toolInput = { command: cmd };
      const decision = classifyRunCommand(toolArgs, roots, allowExtra);
      if (decision === "allow" || decision === "deny") {
        emit(
          decision,
          buildReason(
            "run_command",
            toolInput,
            decision,
            reasonContextForBash(toolInput, decision),
          ),
        );
      }
      emitAsk();
    }

    emitAsk();
  } catch (err) {
    process.stderr.write(
      `[auto-approve.agy] unexpected error: ${err && err.message ? err.message : err}\n`,
    );
    emitAsk();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  collectTargetFiles,
  loadAgyAutoApproveConfig,
  workspaceRoots,
};
