"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.resolve(__dirname, "../auto-approve.devin.cjs");

function makeProject(config = { autoApprove: true }) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cf-devin-approve-"));
  if (config) {
    fs.mkdirSync(path.join(cwd, ".coding-friend"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".coding-friend", "config.json"),
      JSON.stringify(config),
    );
  }
  // Canonicalize (/var → /private/var on macOS) so file paths built by tests
  // compare equal to the realpath'd projectDir inside isInProjectDir.
  return fs.realpathSync(cwd);
}

function runHook(cwd, payload, { projectEnv = true, configFile } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "cf-devin-approve-home-"));
  const env = {
    ...process.env,
    HOME: home,
    CLAUDE_PROJECT_DIR: cwd,
    DEVIN_PROJECT_DIR: cwd,
  };
  delete env.CF_CONFIG_FILE;
  if (!projectEnv) {
    delete env.CLAUDE_PROJECT_DIR;
    delete env.DEVIN_PROJECT_DIR;
  }
  if (configFile) env.CF_CONFIG_FILE = configFile;
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
    let json = null;
    try {
      json = JSON.parse(stdout.trim());
    } catch {
      // empty stdout → silence = defer to native prompt
    }
    return { status: 0, stdout, json };
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

function permissionRequest(cwd, toolName, toolInput) {
  return {
    hook_event_name: "PermissionRequest",
    session_id: "devin-slug",
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: "tu_1",
    prompt_id: "p_1",
  };
}

describe("auto-approve.devin.cjs", () => {
  it("prints nothing when autoApprove is disabled", () => {
    const cwd = makeProject({ autoApprove: false });
    try {
      const result = runHook(
        cwd,
        permissionRequest(cwd, "read", {
          file_path: path.join(cwd, "README.md"),
        }),
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("prints nothing when config is missing", () => {
    const cwd = makeProject(null);
    try {
      const result = runHook(
        cwd,
        permissionRequest(cwd, "read", {
          file_path: path.join(cwd, "README.md"),
        }),
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("approves read inside the project", () => {
    const cwd = makeProject();
    try {
      const result = runHook(
        cwd,
        permissionRequest(cwd, "read", {
          file_path: path.join(cwd, "README.md"),
        }),
      );
      expect(result.status).toBe(0);
      expect(result.json).toEqual({ decision: "approve" });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("approves edit inside the project", () => {
    const cwd = makeProject();
    try {
      const result = runHook(
        cwd,
        permissionRequest(cwd, "edit", {
          file_path: path.join(cwd, "src", "a.ts"),
          old_string: "a",
          new_string: "b",
        }),
      );
      expect(result.status).toBe(0);
      expect(result.json).toEqual({ decision: "approve" });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("blocks exec rm -rf /", () => {
    const cwd = makeProject();
    try {
      const result = runHook(
        cwd,
        permissionRequest(cwd, "exec", { command: "rm -rf /" }),
      );
      expect(result.status).toBe(0);
      expect(result.json.decision).toBe("block");
      expect(result.json.reason).toBeTruthy();
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("approves exec safe command (ls)", () => {
    const cwd = makeProject();
    try {
      const result = runHook(
        cwd,
        permissionRequest(cwd, "exec", { command: "ls" }),
      );
      expect(result.status).toBe(0);
      expect(result.json).toEqual({ decision: "approve" });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("asks exec rm -rf . with workdir outside the project (silence)", () => {
    const cwd = makeProject();
    try {
      const result = runHook(
        cwd,
        permissionRequest(cwd, "exec", {
          command: "rm -rf .",
          workdir: os.homedir(),
        }),
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("approves exec rm -rf . with workdir inside the project", () => {
    const cwd = makeProject();
    try {
      const result = runHook(
        cwd,
        permissionRequest(cwd, "exec", {
          command: "rm -rf .",
          workdir: cwd,
        }),
      );
      expect(result.status).toBe(0);
      expect(result.json).toEqual({ decision: "approve" });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("does not use model-controlled workdir as project dir when env vars are unset", () => {
    const cwd = makeProject();
    try {
      const result = runHook(
        cwd,
        permissionRequest(cwd, "exec", { command: "rm -rf .", workdir: "/" }),
        {
          projectEnv: false,
          configFile: path.join(cwd, ".coding-friend", "config.json"),
        },
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("prints nothing on an unknown tool", () => {
    const cwd = makeProject();
    try {
      const result = runHook(
        cwd,
        permissionRequest(cwd, "browser_preview", { url: "http://localhost" }),
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("approves mcp__coding-friend-memory__memory_search unchanged", () => {
    const cwd = makeProject();
    try {
      const result = runHook(
        cwd,
        permissionRequest(
          cwd,
          "mcp__coding-friend-memory__memory_search",
          { query: "hooks" },
        ),
      );
      expect(result.status).toBe(0);
      expect(result.json).toEqual({ decision: "approve" });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("prints nothing for edit outside the project dir (ask)", () => {
    const cwd = makeProject();
    try {
      const result = runHook(
        cwd,
        permissionRequest(cwd, "edit", {
          file_path: "/etc/hosts",
          old_string: "a",
          new_string: "b",
        }),
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("defers exec commands matching autoApproveIgnore (silence)", () => {
    const cwd = makeProject({
      autoApprove: true,
      autoApproveIgnore: ["npm test"],
    });
    try {
      const result = runHook(
        cwd,
        permissionRequest(cwd, "exec", { command: "npm test" }),
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("still blocks destructive commands matching autoApproveIgnore", () => {
    const cwd = makeProject({
      autoApprove: true,
      autoApproveIgnore: ["rm"],
    });
    try {
      const result = runHook(
        cwd,
        permissionRequest(cwd, "exec", { command: "rm -rf /" }),
      );
      expect(result.status).toBe(0);
      expect(result.json.decision).toBe("block");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("prints nothing on malformed JSON (fail-open, exit 0)", () => {
    const cwd = makeProject();
    try {
      const result = runHook(cwd, "not-json");
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
