"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.resolve(__dirname, "../session-init.sh");
const PLUGIN_ROOT = path.resolve(__dirname, "../..");

describe("session-init.sh", () => {
  it("emits Codex host context when CF_HOST=codex", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cf-session-init-"));
    try {
      const stdout = execFileSync("bash", [SCRIPT], {
        cwd,
        input: JSON.stringify({ hookEventName: "SessionStart" }),
        encoding: "utf8",
        env: {
          ...process.env,
          PLUGIN_ROOT,
          CF_HOST: "codex",
        },
      });

      const parsed = JSON.parse(stdout);
      expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
      expect(parsed.hookSpecificOutput.additionalContext).toContain(
        "HOST: codex",
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("stays on claude when only CODEX_HOME is exported", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cf-session-init-"));
    try {
      const env = { ...process.env, PLUGIN_ROOT, CODEX_HOME: "/home/u/.codex" };
      delete env.CF_HOST;
      delete env.CODEX_SESSION_ID;
      const stdout = execFileSync("bash", [SCRIPT], {
        cwd,
        input: JSON.stringify({ hookEventName: "SessionStart" }),
        encoding: "utf8",
        env,
      });

      const parsed = JSON.parse(stdout);
      expect(parsed.hookSpecificOutput.additionalContext).toContain(
        "HOST: claude",
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("detects codex from the session-scoped CODEX_SESSION_ID", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cf-session-init-"));
    try {
      const env = { ...process.env, PLUGIN_ROOT, CODEX_SESSION_ID: "abc123" };
      delete env.CF_HOST;
      const stdout = execFileSync("bash", [SCRIPT], {
        cwd,
        input: JSON.stringify({ hookEventName: "SessionStart" }),
        encoding: "utf8",
        env,
      });

      const parsed = JSON.parse(stdout);
      expect(parsed.hookSpecificOutput.additionalContext).toContain(
        "HOST: codex",
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
