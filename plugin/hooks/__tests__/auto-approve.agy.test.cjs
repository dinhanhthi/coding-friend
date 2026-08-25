"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.resolve(__dirname, "../auto-approve.agy.cjs");

function makeProject(config = { autoApproveAgy: true }) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cf-agy-approve-"));
  if (config) {
    fs.mkdirSync(path.join(cwd, ".coding-friend"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".coding-friend", "config.json"),
      JSON.stringify(config),
    );
  }
  return cwd;
}

function runHook(cwd, payload) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cf-agy-approve-home-"));
  const env = { ...process.env, HOME: home };
  delete env.CF_CONFIG_FILE;
  try {
    const input =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    const stdout = execFileSync("node", [SCRIPT], {
      cwd,
      input,
      encoding: "utf8",
      timeout: 5000,
      env,
    });
    return { status: 0, stdout, json: JSON.parse(stdout.trim()) };
  } catch (err) {
    let json = null;
    try {
      json = JSON.parse((err.stdout || "").trim());
    } catch {
      // leave json null
    }
    return { status: err.status, stdout: err.stdout || "", json };
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

describe("auto-approve.agy.cjs", () => {
  it("asks when autoApproveAgy is disabled", () => {
    const cwd = makeProject({ autoApproveAgy: false });
    try {
      const result = runHook(cwd, {
        workspacePaths: [cwd],
        toolCall: {
          name: "view_file",
          args: { AbsolutePath: path.join(cwd, "README.md") },
        },
      });
      expect(result.status).toBe(0);
      expect(result.json).toEqual({ decision: "ask" });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("asks when config is missing", () => {
    const cwd = makeProject(null);
    try {
      const result = runHook(cwd, {
        workspacePaths: [cwd],
        toolCall: {
          name: "view_file",
          args: { AbsolutePath: path.join(cwd, "README.md") },
        },
      });
      expect(result.status).toBe(0);
      expect(result.json).toEqual({ decision: "ask" });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("allows read-only view_file", () => {
    const cwd = makeProject();
    try {
      const result = runHook(cwd, {
        workspacePaths: [cwd],
        toolCall: {
          name: "view_file",
          args: { AbsolutePath: path.join(cwd, "README.md") },
        },
      });
      expect(result.status).toBe(0);
      expect(result.json.decision).toBe("allow");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("allows write_to_file inside workspacePaths", () => {
    const cwd = makeProject();
    try {
      const result = runHook(cwd, {
        workspacePaths: [cwd],
        toolCall: {
          name: "write_to_file",
          args: { TargetFile: "src/a.ts" },
        },
      });
      expect(result.status).toBe(0);
      expect(result.json.decision).toBe("allow");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("asks write_to_file outside workspace", () => {
    const cwd = makeProject();
    try {
      const result = runHook(cwd, {
        workspacePaths: [cwd],
        toolCall: {
          name: "write_to_file",
          args: { TargetFile: "/etc/hosts" },
        },
      });
      expect(result.status).toBe(0);
      expect(result.json.decision).toBe("ask");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("allows run_command safe (ls)", () => {
    const cwd = makeProject();
    try {
      const result = runHook(cwd, {
        workspacePaths: [cwd],
        toolCall: {
          name: "run_command",
          args: { CommandLine: "ls" },
        },
      });
      expect(result.status).toBe(0);
      expect(result.json.decision).toBe("allow");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("denies run_command destructive (rm -rf /)", () => {
    const cwd = makeProject();
    try {
      const result = runHook(cwd, {
        workspacePaths: [cwd],
        toolCall: {
          name: "run_command",
          args: { CommandLine: "rm -rf /" },
        },
      });
      expect(result.status).toBe(0);
      expect(result.json.decision).toBe("deny");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("asks run_command rm -rf . when Cwd is outside workspace", () => {
    const cwd = makeProject();
    try {
      const result = runHook(cwd, {
        workspacePaths: [cwd],
        toolCall: {
          name: "run_command",
          args: { CommandLine: "rm -rf .", Cwd: os.homedir() },
        },
      });
      expect(result.status).toBe(0);
      expect(["ask", "deny"]).toContain(result.json.decision);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("allows run_command rm -rf . when Cwd is the workspace", () => {
    const cwd = makeProject();
    try {
      const result = runHook(cwd, {
        workspacePaths: [cwd],
        toolCall: {
          name: "run_command",
          args: { CommandLine: "rm -rf .", Cwd: cwd },
        },
      });
      expect(result.status).toBe(0);
      expect(result.json.decision).toBe("allow");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("asks on unknown tool", () => {
    const cwd = makeProject();
    try {
      const result = runHook(cwd, {
        workspacePaths: [cwd],
        toolCall: {
          name: "invoke_subagent",
          args: { AgentName: "cf-explorer" },
        },
      });
      expect(result.status).toBe(0);
      expect(result.json.decision).toBe("ask");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("asks on malformed JSON (fail-open, exit 0)", () => {
    const cwd = makeProject();
    try {
      const result = runHook(cwd, "not-json");
      expect(result.status).toBe(0);
      expect(result.json).toEqual({ decision: "ask" });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
