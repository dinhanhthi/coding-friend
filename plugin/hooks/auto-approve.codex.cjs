#!/usr/bin/env node
/**
 * PermissionRequest hook for Codex CLI.
 *
 * This intentionally reuses the deterministic classifier from Claude's
 * auto-approve hook but does not use the LLM fallback. Unknown or ask-level
 * actions emit no decision so Codex's native approval flow remains in charge.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildReason,
  classifyByRules,
  extractRmPaths,
} = require("./auto-approve.cjs");

function readConfigFile(filePath, label) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    process.stderr.write(
      `[auto-approve.codex] ${label} config parse error: ${err && err.message ? err.message : err}\n`,
    );
    return {};
  }
}

function stringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : [];
}

function loadCodexAutoApproveConfig(homeDir, cwd) {
  const globalConfig = readConfigFile(
    path.join(homeDir, ".coding-friend", "config.json"),
    "global",
  );
  const localConfig = readConfigFile(
    path.join(cwd, ".coding-friend", "config.json"),
    "local",
  );
  const merged = { ...globalConfig, ...localConfig };
  const allowExtra = [
    ...new Set([
      ...stringList(localConfig.autoApproveAllowExtra),
      ...stringList(globalConfig.autoApproveAllowExtra),
    ]),
  ];

  return {
    enabled: merged.autoApproveCodex === true,
    allowExtra,
  };
}

function writeNoDecision() {
  process.stdout.write("{}");
}

function codexDecision(behavior, message) {
  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: {
        behavior,
        ...(message ? { message } : {}),
      },
    },
  };
}

function reasonContext(toolName, toolInput, decision) {
  if (decision === "allow" && (toolName === "Write" || toolName === "Edit")) {
    return { source: "working-dir" };
  }
  if (decision === "allow" && toolName === "Bash") {
    const rmPaths = extractRmPaths((toolInput && toolInput.command) || "");
    if (rmPaths) return { source: "rm-project-dir" };
  }
  return undefined;
}

function main() {
  try {
    const input = fs.readFileSync(0, "utf8");
    if (!input.trim()) {
      writeNoDecision();
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(input);
    } catch (err) {
      process.stderr.write(
        `[auto-approve.codex] JSON parse error: ${err && err.message ? err.message : err}\n`,
      );
      writeNoDecision();
      return;
    }

    const projectDir =
      process.env.CODEX_PROJECT_DIR || parsed.cwd || process.cwd();
    const { enabled, allowExtra } = loadCodexAutoApproveConfig(
      os.homedir(),
      projectDir,
    );
    const forceEnabled = process.env.CF_AUTO_APPROVE_CODEX_ENABLED === "1";
    if (!forceEnabled && !enabled) {
      writeNoDecision();
      return;
    }

    const toolName = parsed.tool_name;
    const toolInput = parsed.tool_input;
    if (!toolName || !toolInput || typeof toolInput !== "object") {
      writeNoDecision();
      return;
    }

    const decision = classifyByRules(
      toolName,
      toolInput,
      projectDir,
      allowExtra,
    );
    if (decision !== "allow" && decision !== "deny") {
      writeNoDecision();
      return;
    }

    const message = buildReason(
      toolName,
      toolInput,
      decision,
      reasonContext(toolName, toolInput, decision),
    );
    process.stdout.write(
      JSON.stringify(
        codexDecision(decision === "allow" ? "allow" : "deny", message),
      ),
    );
  } catch (err) {
    process.stderr.write(
      `[auto-approve.codex] unexpected error: ${err && err.message ? err.message : err}\n`,
    );
    writeNoDecision();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  loadCodexAutoApproveConfig,
};
