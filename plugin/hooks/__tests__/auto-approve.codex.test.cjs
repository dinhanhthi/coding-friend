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

  it("allows apply_patch when every target stays inside the project", () => {
    const cwd = makeProject();
    try {
      const patch = [
        "*** Begin Patch",
        "*** Update File: src/index.ts",
        "@@",
        "-old",
        "+new",
        "*** Add File: docs/notes.md",
        "+hello",
        "*** End Patch",
      ].join("\n");
      const result = runHook(cwd, {
        hookEventName: "PermissionRequest",
        tool_name: "apply_patch",
        tool_input: { command: patch },
      });
      expect(result.hookSpecificOutput.decision.behavior).toBe("allow");
      expect(result.hookSpecificOutput.decision.message).toContain(
        "working directory",
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("emits no decision for apply_patch targeting paths outside the project", () => {
    const cwd = makeProject();
    try {
      const patch = [
        "*** Begin Patch",
        "*** Update File: /etc/hosts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ].join("\n");
      expect(
        runHook(cwd, {
          hookEventName: "PermissionRequest",
          tool_name: "apply_patch",
          tool_input: { command: patch },
        }),
      ).toEqual({});
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("emits no decision for apply_patch with an unparseable envelope", () => {
    const cwd = makeProject();
    try {
      expect(
        runHook(cwd, {
          hookEventName: "PermissionRequest",
          tool_name: "apply_patch",
          tool_input: { command: "not a patch" },
        }),
      ).toEqual({});
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("defers when an operation header has no extractable path", () => {
    // Fail safe: a header line we cannot parse a path from must not let the
    // in-project paths blanket-allow the whole patch.
    const cwd = makeProject();
    try {
      const patch = [
        "*** Begin Patch",
        "*** Update File: src/app.ts",
        "@@",
        "-old",
        "+new",
        "*** Add File:", // malformed — no path
        "+x",
        "*** End Patch",
      ].join("\n");
      expect(
        runHook(cwd, {
          hookEventName: "PermissionRequest",
          tool_name: "apply_patch",
          tool_input: { command: patch },
        }),
      ).toEqual({});
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("checks rename destinations from Move to headers", () => {
    const cwd = makeProject();
    try {
      const patch = [
        "*** Begin Patch",
        "*** Update File: src/a.ts",
        "*** Move to: /tmp/outside.ts",
        "@@",
        "-old",
        "+new",
        "*** End Patch",
      ].join("\n");
      expect(
        runHook(cwd, {
          hookEventName: "PermissionRequest",
          tool_name: "apply_patch",
          tool_input: { command: patch },
        }),
      ).toEqual({});
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("honors autoApproveAllowExtra prefixes for Bash", () => {
    const cwd = makeProject({
      autoApproveCodex: true,
      autoApproveAllowExtra: ["npm test"],
    });
    try {
      const result = runHook(cwd, {
        hookEventName: "PermissionRequest",
        tool_name: "Bash",
        tool_input: { command: "npm test" },
      });
      expect(result.hookSpecificOutput.decision.behavior).toBe("allow");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("never lets allowExtra override deny patterns", () => {
    const cwd = makeProject({
      autoApproveCodex: true,
      autoApproveAllowExtra: ["git reset"],
    });
    try {
      const result = runHook(cwd, {
        hookEventName: "PermissionRequest",
        tool_name: "Bash",
        tool_input: { command: "git reset --hard HEAD" },
      });
      expect(result.hookSpecificOutput.decision.behavior).toBe("deny");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("supports the CF_AUTO_APPROVE_CODEX_ENABLED override", () => {
    const cwd = makeProject({ autoApproveCodex: false });
    try {
      const stdout = execFileSync("node", [SCRIPT], {
        cwd,
        input: JSON.stringify({
          cwd,
          hookEventName: "PermissionRequest",
          tool_name: "Read",
          tool_input: { file_path: "README.md" },
        }),
        encoding: "utf8",
        timeout: 5000,
        env: { ...process.env, CF_AUTO_APPROVE_CODEX_ENABLED: "1" },
      });
      const result = JSON.parse(stdout || "{}");
      expect(result.hookSpecificOutput.decision.behavior).toBe("allow");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
