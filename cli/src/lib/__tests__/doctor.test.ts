import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ExecFileSyncOptions } from "child_process";

vi.mock("child_process", async () => {
  const actual =
    await vi.importActual<typeof import("child_process")>("child_process");
  return {
    ...actual,
    execFileSync: vi.fn(),
    execSync: vi.fn(),
    spawn: vi.fn(),
    spawnSync: vi.fn(),
    exec: vi.fn(),
  };
});

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    renameSync: vi.fn(),
    rmSync: vi.fn(),
    chmodSync: vi.fn(),
  };
});

import * as childProcess from "child_process";
import * as fs from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { RUNNABLE_FIXES } from "../doctor.js";
import { doctorCommand } from "../../commands/doctor.js";

const HOSTS = new Set(["claude", "codex", "omp", "agy", "devin"]);
const execFileSync = vi.mocked(childProcess.execFileSync);

const origCwd = process.cwd();
const origPlatform = process.platform;
let home: string;
let stdout: string[];

/**
 * `which` finds claude, codex and git; codex hangs on --version; claude mcp
 * get fails; git reports any learn dir as its own work tree with no remote.
 */
function fakeExec(bin: string, args: readonly string[] = []): string {
  if (bin === "which" && ["claude", "codex", "git"].includes(args[0])) {
    return `/usr/local/bin/${args[0]}\n`;
  }
  if (bin === "git" && args.includes("--is-inside-work-tree")) {
    return `true\n${args[1]}\n`;
  }
  if (bin === "git" && args.includes("remote")) return "";
  if (bin === "codex") {
    throw Object.assign(new Error("spawnSync codex ETIMEDOUT"), {
      code: "ETIMEDOUT",
    });
  }
  throw Object.assign(new Error(`${bin} failed`), { status: 1 });
}

async function runDoctorJson() {
  await doctorCommand("9.9.9", { json: true });
  expect(stdout).toHaveLength(1);
  return JSON.parse(stdout[0]);
}

beforeEach(async () => {
  const realFs = await vi.importActual<typeof import("fs")>("fs");
  home = realFs.mkdtempSync(join(tmpdir(), "cf-doctor-"));
  // stubEnv keeps the real environment: `process.env = {...}` would leave
  // os.homedir() on the previous test's HOME.
  vi.stubEnv("HOME", home);
  vi.stubEnv("CLAUDE_CONFIG_DIR", undefined);
  vi.stubEnv("CF_PROJECTS_FILE", undefined);
  vi.stubEnv("CF_ORCHESTRATOR_DIR", undefined);

  execFileSync.mockImplementation(((bin: string, args?: readonly string[]) =>
    fakeExec(bin, args)) as unknown as typeof childProcess.execFileSync);
  stdout = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  process.chdir(origCwd);
  Object.defineProperty(process, "platform", { value: origPlatform });
  vi.unstubAllEnvs();
  process.exitCode = undefined;
  vi.restoreAllMocks();
  vi.clearAllMocks();
  const realFs = await vi.importActual<typeof import("fs")>("fs");
  realFs.rmSync(home, { recursive: true, force: true });
});

describe("cf doctor --json", () => {
  it("writes one ok envelope whose fixes come only from the runnable-fix table", async () => {
    expect(RUNNABLE_FIXES).toEqual({
      supervisorInstall: {
        argv: ["supervisor", "install", "--json"],
        label: expect.any(String),
      },
      supervisorTick: {
        argv: ["supervisor", "tick", "--json"],
        label: expect.any(String),
      },
      pluginInstall: {
        argv: ["install", "--user", "--yes", "--json"],
        label: expect.any(String),
      },
    });

    const env = await runDoctorJson();
    expect(env.contractVersion).toBe(1);
    expect(env.ok).toBe(true);
    expect(env.error).toBeNull();
    expect(env.data.cli).toEqual({
      version: "9.9.9",
      node: process.versions.node,
      path: expect.any(String),
    });

    const allowed = Object.values(RUNNABLE_FIXES).map((f) =>
      JSON.stringify(f.argv),
    );
    const ids = new Set<string>();
    for (const check of env.data.checks) {
      expect(check.id).toMatch(/^[a-z]+(\.[a-zA-Z0-9]+)+$/);
      expect(["ok", "warn", "fail"]).toContain(check.status);
      ids.add(check.id);
      if (check.fix) {
        expect(allowed).toContain(JSON.stringify(check.fix.argv));
        expect(check.fix.argv.at(-1)).toBe("--json");
      }
    }
    expect(ids.size).toBe(env.data.checks.length);
    // Empty HOME + claude on PATH → plugin missing → the install fix is offered.
    const plugin = env.data.checks.find(
      (c: { id: string }) => c.id === "plugin.installed",
    );
    expect(plugin.status).toBe("fail");
    expect(plugin.fix.argv).toEqual(RUNNABLE_FIXES.pluginInstall.argv);
    // Fresh install: learn/memory not set up yet → never fail.
    const notSetUp = [
      "learn.mcp.registered",
      "learn.mcp.built",
      "learn.docs",
      "memory.built",
    ];
    expect(
      notSetUp.map((id) => {
        const c = env.data.checks.find((x: { id: string }) => x.id === id);
        return [id, c !== undefined && c.status !== "fail"];
      }),
    ).toEqual(notSetUp.map((id) => [id, true]));
  });

  it("stays read-only and bounds every host binary call with a timeout", async () => {
    await runDoctorJson();

    for (const fn of [
      fs.mkdirSync,
      fs.writeFileSync,
      fs.appendFileSync,
      fs.unlinkSync,
      fs.renameSync,
      fs.rmSync,
    ]) {
      expect(vi.mocked(fn)).not.toHaveBeenCalled();
    }
    expect(childProcess.spawn).not.toHaveBeenCalled();
    expect(childProcess.execSync).not.toHaveBeenCalled();

    const calls = execFileSync.mock.calls.map(([bin, args, opts]) => ({
      bin: String(bin),
      args: (args ?? []) as string[],
      opts: (opts ?? {}) as ExecFileSyncOptions,
    }));
    const bins = calls.map((c) => c.bin);
    for (const banned of ["gh", "curl", "npm", "npx"]) {
      expect(bins).not.toContain(banned);
    }

    const hostCalls = calls.filter((c) => HOSTS.has(c.bin));
    // The hung `codex --version` and the `claude mcp get` probes both ran.
    expect(hostCalls.some((c) => c.bin === "codex")).toBe(true);
    expect(hostCalls.some((c) => c.bin === "claude")).toBe(true);
    for (const c of hostCalls) {
      expect(c.opts.timeout).toBeGreaterThan(0);
      expect(c.opts.timeout).toBeLessThanOrEqual(10_000);
      expect((c.opts.stdio as unknown[] | undefined)?.[0]).toBe("ignore");
    }
  });

  it("--project-dir reports only project checks from the root's .mcp.json, not cwd's", async () => {
    const realFs = await vi.importActual<typeof import("fs")>("fs");
    const project = join(home, "proj");
    const other = join(home, "other");
    realFs.mkdirSync(project);
    realFs.mkdirSync(other);
    const memoryEntry = (command: string, args?: string[]) =>
      JSON.stringify({
        mcpServers: { "coding-friend-memory": { command, args } },
      });
    realFs.writeFileSync(
      join(project, ".mcp.json"),
      memoryEntry("node", [join(project, "gone.js")]),
    );
    realFs.writeFileSync(join(other, ".mcp.json"), memoryEntry("npx"));
    process.chdir(other);

    await doctorCommand("9.9.9", { json: true, projectDir: project });
    const env = JSON.parse(stdout[0]);
    expect(env.ok).toBe(true);
    expect(env.data.project).toBe(realFs.realpathSync(project));
    expect(env.data.checks.length).toBeGreaterThan(0);
    for (const c of env.data.checks) {
      expect(c.group).toBe("project");
      expect(c.fix).toBeUndefined();
    }
    const shadow = env.data.checks.find(
      (c: { id: string }) => c.id === "project.mcpShadow",
    );
    expect(shadow.status).toBe("warn");
    expect(shadow.detail).toContain("gone.js");
    expect(shadow.hint).toBe(
      `cd '${realFs.realpathSync(project)}' && cf update`,
    );
    const registered = env.data.checks.find(
      (c: { id: string }) => c.id === "project.registered",
    );
    expect(registered.hint).toBe(
      `cf project add -- '${realFs.realpathSync(project)}'`,
    );
    expect(execFileSync.mock.calls.some(([bin]) => bin === "claude")).toBe(
      false,
    );
  });

  it("warns on learn.storage when the learn dir is a git repo inside a cloud root", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const realFs = await vi.importActual<typeof import("fs")>("fs");
    const learnDir = join(
      home,
      "Library",
      "Mobile Documents",
      "com~apple~CloudDocs",
      "learn",
    );
    realFs.mkdirSync(learnDir, { recursive: true });
    realFs.mkdirSync(join(home, ".coding-friend"));
    realFs.writeFileSync(
      join(home, ".coding-friend", "config.json"),
      JSON.stringify({ learn: { outputDir: learnDir } }),
    );

    const env = await runDoctorJson();
    const storage = env.data.checks.find(
      (c: { id: string }) => c.id === "learn.storage",
    );
    expect(storage).toMatchObject({ group: "learn", status: "warn" });
    expect(storage.hint).toMatch(/either git or a cloud folder/);
  });
});
