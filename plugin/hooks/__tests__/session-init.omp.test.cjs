"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.resolve(__dirname, "../session-init.sh");
const PLUGIN_ROOT = path.resolve(__dirname, "../..");

function runSessionInit({ extraEnv = {}, ompDir = false } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cf-session-init-omp-"));
  try {
    if (ompDir) {
      fs.mkdirSync(path.join(cwd, ".omp"));
    }
    const env = { ...process.env, PLUGIN_ROOT, TMPDIR: cwd, ...extraEnv };
    for (const key of ["CF_HOST", "CODEX_SESSION_ID", "OMP_SESSION_ID"]) {
      if (!Object.prototype.hasOwnProperty.call(extraEnv, key)) {
        delete env[key];
      }
    }
    const stdout = execFileSync("bash", [SCRIPT], {
      cwd,
      input: JSON.stringify({ hookEventName: "SessionStart" }),
      encoding: "utf8",
      env,
    });
    const logPath = path.join(cwd, "coding-friend-session-init.log");
    const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
    const parsed = JSON.parse(stdout);
    return {
      parsed,
      log,
      context: parsed.hookSpecificOutput.additionalContext,
    };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

describe("session-init.sh omp host detection", () => {
  it("emits HOST: omp when CF_HOST=omp is set explicitly", () => {
    const { context, log } = runSessionInit({ extraEnv: { CF_HOST: "omp" } });
    expect(context).toContain("HOST: omp");
    expect(log).toMatch(/CF_HOST=omp/);
  });

  it("detects omp from OMP_SESSION_ID when CF_HOST is unset", () => {
    const { context, log } = runSessionInit({
      extraEnv: { OMP_SESSION_ID: "sess-1" },
    });
    expect(context).toContain("HOST: omp");
    expect(log).toMatch(/CF_HOST=omp/);
  });

  it("detects omp from a .omp directory in cwd", () => {
    const { context, log } = runSessionInit({ ompDir: true });
    expect(context).toContain("HOST: omp");
    expect(log).toMatch(/CF_HOST=omp/);
  });

  it("defaults to claude when no host clues are present", () => {
    const { context } = runSessionInit();
    expect(context).toContain("HOST: claude");
    expect(context).toContain("## Security: Content Isolation");
  });

  it("lets explicit CF_HOST=claude win over OMP_SESSION_ID and .omp", () => {
    const { context } = runSessionInit({
      extraEnv: { CF_HOST: "claude", OMP_SESSION_ID: "sess-1" },
      ompDir: true,
    });
    expect(context).toContain("HOST: claude");
  });

  it("lets CODEX_SESSION_ID win over a .omp directory", () => {
    const { context } = runSessionInit({
      extraEnv: { CODEX_SESSION_ID: "abc123" },
      ompDir: true,
    });
    expect(context).toContain("HOST: codex");
  });
});
