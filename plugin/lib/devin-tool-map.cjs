"use strict";

/**
 * Devin CLI tool-name map.
 *
 * Devin hook payloads carry lowercase tool names (e.g. `exec`, `read`,
 * `run_subagent`) while the shared classifiers in hooks/auto-approve.cjs
 * are keyed on Claude's PascalCase names (e.g. `Bash`, `Read`, `Agent`).
 * Map Devin names → Claude names; pass `mcp__*` and unknown names through
 * unchanged so MCP allow-lists and the unknown-tool path keep working.
 */

const DEVIN_TO_CLAUDE = {
  read: "Read",
  write: "Write",
  edit: "Edit",
  apply_patch: "Edit",
  grep: "Grep",
  glob: "Glob",
  find_file_by_name: "Glob",
  exec: "Bash",
  webfetch: "WebFetch",
  todo_write: "TodoWrite",
  run_subagent: "Agent",
  read_subagent: "Agent",
  skill: "Skill",
  ask_user_question: "AskUserQuestion",
  notebook_read: "NotebookRead",
  notebook_edit: "NotebookEdit",
};

/**
 * @param {string} name — Devin tool_name from the hook payload
 * @returns {string} the Claude-equivalent tool name, or the input unchanged
 */
function toClaudeToolName(name) {
  if (typeof name !== "string" || !name) return name;
  if (name.startsWith("mcp__")) return name;
  return DEVIN_TO_CLAUDE[name] || name;
}

module.exports = { toClaudeToolName, DEVIN_TO_CLAUDE };
