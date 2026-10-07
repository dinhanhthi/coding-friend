"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const INIT = path.resolve(__dirname, "../session-init.agy.sh");
const REMINDER = path.resolve(__dirname, "../rules-reminder.agy.sh");
const LOG = path.resolve(__dirname, "../session-log.agy.sh");
const PLUGIN_ROOT = path.resolve(__dirname, "../..");
const SESSION_ID = `agy-lifecycle-${process.pid}`;

function runHook(script, payload, { cwd, env: extraEnv } = {}) {
  const env = { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT, ...extraEnv };
  delete env.CF_HOST;
  delete env.CODEX_SESSION_ID;
  delete env.OMP_SESSION_ID;
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  const stdout = execFileSync("bash", [script], {
    cwd: cwd || PLUGIN_ROOT,
    input,
    encoding: "utf8",
    timeout: 10000,
    env,
  });
  return stdout;
}

function cleanupLog() {
  for (const p of [
    `/tmp/cf-session-${SESSION_ID}.jsonl`,
    `/tmp/cf-session-turn-${SESSION_ID}`,
  ]) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
}

describe("session-init.agy.sh", () => {
  it("PreInvocation invocationNum:0 injects HOST: agy", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "cf-agy-init-"));
    try {
      fs.writeFileSync(
        path.join(workspace, "package.json"),
        JSON.stringify({ name: "tmp" }),
      );
      const stdout = runHook(INIT, {
        invocationNum: 0,
        workspacePaths: [workspace],
      });
      const parsed = JSON.parse(stdout);
      expect(parsed.injectSteps[0].ephemeralMessage).toContain("HOST: agy");
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("PreInvocation invocationNum:1 injects HOST: agy and MAIN_REPO_ROOT", () => {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "cf-agy-init-"));
    try {
      fs.writeFileSync(
        path.join(workspace, "package.json"),
        JSON.stringify({ name: "tmp" }),
      );
      const stdout = runHook(INIT, {
        invocationNum: 1,
        workspacePaths: [workspace],
      });
      const parsed = JSON.parse(stdout);
      const msg = parsed.injectSteps[0].ephemeralMessage;
      expect(msg).toContain("HOST: agy");
      expect(msg).toContain("MAIN_REPO_ROOT");
      expect(msg).toContain(workspace);
      expect(msg).toContain("PROJECT_TYPE: single-repo");
      expect(msg).not.toContain("You have the coding-friend toolkit loaded");
      expect(msg.length).toBeLessThan(12000);
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it("PreInvocation invocationNum:2 emits {}", () => {
    const stdout = runHook(INIT, {
      invocationNum: 2,
      workspacePaths: ["/tmp"],
    });
    expect(JSON.parse(stdout)).toEqual({});
  });
});

describe("session-init.agy.sh project registry", () => {
  function runInit(projectRegistry) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cf-agy-reg-"));
    const workspace = path.join(tmp, "project");
    fs.mkdirSync(path.join(workspace, ".coding-friend"), { recursive: true });
    fs.writeFileSync(
      path.join(workspace, ".coding-friend", "config.json"),
      JSON.stringify({ projectRegistry }),
    );
    const projectsFile = path.join(tmp, "projects.json");
    const stdout = runHook(
      INIT,
      { invocationNum: 0, workspacePaths: [workspace] },
      { env: { CF_PROJECTS_FILE: projectsFile } },
    );
    return { tmp, workspace, projectsFile, stdout };
  }

  it("records the workspace with host agy and keeps the inject output", () => {
    const { tmp, workspace, projectsFile, stdout } = runInit(true);
    try {
      const parsed = JSON.parse(stdout);
      expect(parsed.injectSteps[0].ephemeralMessage).toContain("HOST: agy");
      const registry = JSON.parse(fs.readFileSync(projectsFile, "utf8"));
      const entry = registry.projects.find(
        (p) => p.path === fs.realpathSync(workspace),
      );
      expect(entry).toBeDefined();
      expect(entry.hosts).toContain("agy");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("does not create the registry when projectRegistry is false", () => {
    const { tmp, projectsFile, stdout } = runInit(false);
    try {
      expect(JSON.parse(stdout).injectSteps[0].ephemeralMessage).toContain(
        "HOST: agy",
      );
      expect(fs.existsSync(projectsFile)).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("rules-reminder.agy.sh", () => {
  it("injects reminder on invocationNum 4", () => {
    const stdout = runHook(REMINDER, { invocationNum: 4 });
    const parsed = JSON.parse(stdout);
    const msg = parsed.injectSteps[0].ephemeralMessage;
    expect(msg).toContain("<system-reminder>");
    expect(msg).toContain("RULES:");
    expect(msg).toContain("SECURITY");
    expect(msg).toContain("INVOKE GUARD");
    expect(msg).toContain("CRITICAL");
    expect(msg).toContain("cf-tdd");
  });

  it("emits {} on invocationNum 1", () => {
    const stdout = runHook(REMINDER, { invocationNum: 1 });
    expect(JSON.parse(stdout)).toEqual({});
  });
});

describe("session-log.agy.sh", () => {
  beforeEach(cleanupLog);
  afterEach(cleanupLog);

  it('Stop emits {"decision":""}', () => {
    const stdout = runHook(LOG, {
      conversationId: SESSION_ID,
      terminationReason: "completed",
    });
    expect(JSON.parse(stdout)).toEqual({ decision: "" });

    const logFile = `/tmp/cf-session-${SESSION_ID}.jsonl`;
    expect(fs.existsSync(logFile)).toBe(true);
    const line = JSON.parse(fs.readFileSync(logFile, "utf8").trim());
    expect(line.conversationId).toBe(SESSION_ID);
    expect(line.terminationReason).toBe("completed");
    expect(line.stop_reason).toBe("completed");
    expect(line.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});
