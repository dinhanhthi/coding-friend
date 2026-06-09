"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.resolve(__dirname, "../auto-approve.codex.cjs");

function makeProject(config = { autoApproveCodex: true }) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cf-codex-approve-"));
  fs.mkdirSync(path.join(cwd, ".coding-friend"), { recursive: true });
  fs.writeFileSync(
    path.join(cwd, ".coding-friend", "config.json"),
    JSON.stringify(config),
  );
  return cwd;
}

function runHook(cwd, payload) {
  const stdout = execFileSync("node", [SCRIPT], {
    cwd,
    input: JSON.stringify({ cwd, ...payload }),
    encoding: "utf8",
    timeout: 5000,
  });
  return JSON.parse(stdout || "{}");
}

describe("auto-approve.codex.cjs", () => {
  it("does nothing when autoApproveCodex is disabled", () => {
    const cwd = makeProject({ autoApproveCodex: false });
    try {
      expect(
        runHook(cwd, {
          hookEventName: "PermissionRequest",
          tool_name: "Read",
          tool_input: { file_path: "README.md" },
        }),
      ).toEqual({});
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("allows deterministic safe tools with Codex decision schema", () => {
    const cwd = makeProject();
    try {
      const result = runHook(cwd, {
        hookEventName: "PermissionRequest",
        tool_name: "Read",
        tool_input: { file_path: "README.md" },
      });
      expect(result.hookSpecificOutput.hookEventName).toBe("PermissionRequest");
      expect(result.hookSpecificOutput.decision.behavior).toBe("allow");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("denies deterministic destructive commands", () => {
    const cwd = makeProject();
    try {
      const result = runHook(cwd, {
        hookEventName: "PermissionRequest",
        tool_name: "Bash",
        tool_input: { command: "git reset --hard HEAD" },
      });
      expect(result.hookSpecificOutput.decision.behavior).toBe("deny");
      expect(result.hookSpecificOutput.decision.message).toContain("Blocked");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("emits no decision for unknown or ask-level commands", () => {
    const cwd = makeProject();
    try {
      expect(
        runHook(cwd, {
          hookEventName: "PermissionRequest",
          tool_name: "Bash",
          tool_input: { command: "npm test" },
        }),
      ).toEqual({});
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
