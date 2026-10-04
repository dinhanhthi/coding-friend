#!/usr/bin/env node
/**
 * PermissionRequest hook (Devin): auto-approve safe tool calls.
 *
 * Deterministic rules only — no LLM. Speaks Devin's hook contract:
 *   stdin  – JSON with snake_case tool_name / tool_input (Claude-shaped,
 *            lowercase tool names; exec carries command + workdir)
 *   stdout – {"decision":"approve"} or {"decision":"block","reason":"..."}
 *   Silence (no stdout) defers to Devin's native approval prompt.
 *   Exit 0 always. Malformed JSON fails open with silence.
 *
 * Configuration:
 *   "autoApprove": true in CF_CONFIG_FILE or
 *   <projectDir>/.coding-friend/config.json (opt-in).
 *   "autoApproveIgnore": ["prefix", ...] commands defer to the native prompt.
 *   Default (false or missing) → no output.
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
  SHELL_OPERATOR_PATTERN,
} = require("./auto-approve.cjs");
const { toClaudeToolName } = require("../lib/devin-tool-map.cjs");

function readConfigFile(filePath, label) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    process.stderr.write(
      `[auto-approve.devin] ${label} config parse error: ${err && err.message ? err.message : err}\n`,
    );
    return {};
  }
}

function stringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

function loadDevinAutoApproveConfig(homeDir, projectDir) {
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
  const ignore = [
    ...new Set([
      ...stringList(localConfig.autoApproveIgnore),
      ...stringList(globalConfig.autoApproveIgnore),
    ]),
  ];

  return {
    enabled: merged.autoApprove === true,
    allowExtra,
    ignore,
  };
}

function expandTilde(p) {
  if (typeof p !== "string" || !p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

// Never derive the project dir from tool_input.workdir: it is model-controlled
// and would let the exec call define the boundary it is checked against.
function resolveProjectDir() {
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  if (process.env.DEVIN_PROJECT_DIR) return process.env.DEVIN_PROJECT_DIR;
  return process.cwd();
}

function execWorkdir(toolInput) {
  const raw =
    toolInput && typeof toolInput.workdir === "string"
      ? toolInput.workdir.trim()
      : "";
  return raw ? expandTilde(raw) : "";
}

function resolveRmPath(filePath, workdir, projectDir) {
  const expanded = expandTilde(filePath);
  if (!expanded) return expanded;
  if (path.isAbsolute(expanded)) return expanded;
  const absBase =
    workdir && path.isAbsolute(workdir)
      ? workdir
      : path.resolve(projectDir || process.cwd(), workdir || ".");
  return path.resolve(absBase, expanded);
}

/** Clone of auto-approve.cjs's matchesPrefix (not exported). */
function matchesPrefix(trimmed, prefix) {
  const p = prefix.trimEnd();
  return (
    trimmed === p || trimmed.startsWith(p + " ") || trimmed.startsWith(p + "\t")
  );
}

function emit(payload) {
  process.stdout.write(JSON.stringify(payload) + "\n");
  process.exit(0);
}

function exitSilent() {
  process.exit(0);
}

function main() {
  try {
    let input = "";
    try {
      input = fs.readFileSync(0, "utf8");
    } catch (err) {
      process.stderr.write(
        `[auto-approve.devin] stdin read error: ${err && err.message ? err.message : err}\n`,
      );
      exitSilent();
    }

    if (!input.trim()) {
      exitSilent();
    }

    let parsed;
    try {
      parsed = JSON.parse(input);
    } catch (err) {
      process.stderr.write(
        `[auto-approve.devin] JSON parse error: ${err && err.message ? err.message : err}\n`,
      );
      exitSilent();
    }

    const toolInput =
      parsed && parsed.tool_input && typeof parsed.tool_input === "object"
        ? parsed.tool_input
        : {};
    const projectDir = resolveProjectDir();
    const { enabled, allowExtra, ignore } = loadDevinAutoApproveConfig(
      os.homedir(),
      projectDir,
    );
    if (!enabled) {
      exitSilent();
    }

    const toolName = parsed && parsed.tool_name;
    if (!toolName || typeof toolName !== "string") {
      exitSilent();
    }
    const claudeName = toClaudeToolName(toolName);

    let decision = classifyByRules(claudeName, toolInput, projectDir, allowExtra);

    // exec with a workdir outside the project: never auto-allow — relative
    // paths (rm ".") would otherwise resolve against projectDir and look
    // in-project while actually running elsewhere.
    if (decision === "allow" && claudeName === "Bash") {
      const cmd = ((toolInput && toolInput.command) || "").trim();
      const workdir = execWorkdir(toolInput);
      if (workdir && !isInProjectDir(workdir, projectDir)) {
        decision = "ask";
      } else {
        const rmPaths = extractRmPaths(cmd);
        if (rmPaths && rmPaths.length > 0) {
          const resolved = rmPaths.map((p) =>
            resolveRmPath(p, workdir, projectDir),
          );
          if (!resolved.every((p) => isInProjectDir(p, projectDir))) {
            decision = "ask";
          }
        }
      }
    }

    // autoApproveIgnore: defer to Devin's native prompt for these commands.
    // DENY still wins — ignored prefixes never unblock a destructive match.
    if (
      (decision === "allow" || decision === "ask" || decision === "unknown") &&
      claudeName === "Bash" &&
      ignore.length > 0
    ) {
      const cmd = ((toolInput && toolInput.command) || "").trim();
      const pipeIdx = cmd.search(SHELL_OPERATOR_PATTERN);
      const firstSegment = pipeIdx > 0 ? cmd.slice(0, pipeIdx).trim() : cmd;
      for (const prefix of ignore) {
        if (matchesPrefix(firstSegment, prefix) || matchesPrefix(cmd, prefix)) {
          exitSilent();
        }
      }
    }

    if (decision === "allow") {
      emit({ decision: "approve" });
    }
    if (decision === "deny") {
      emit({
        decision: "block",
        reason: buildReason(toolName, toolInput, "deny"),
      });
    }
    // ask / unknown → silence defers to Devin's native approval prompt
    exitSilent();
  } catch (err) {
    process.stderr.write(
      `[auto-approve.devin] unexpected error: ${err && err.message ? err.message : err}\n`,
    );
    exitSilent();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadDevinAutoApproveConfig,
  resolveProjectDir,
};
