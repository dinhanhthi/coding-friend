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
import { buildPlist } from "../launchd.js";
import { claudeProjectDirName } from "../paths.js";
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
  home = realFs.realpathSync(realFs.mkdtempSync(join(tmpdir(), "cf-doctor-")));
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
  vi.unstubAllGlobals();
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
  it("warns (hint, no reinstall fix) when the supervisor agent's program is under ~/Downloads", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const realFs = await vi.importActual<typeof import("fs")>("fs");
    const cli = join(home, "Downloads", "cf", "index.js");
    realFs.mkdirSync(join(home, "Downloads", "cf"), { recursive: true });
    realFs.writeFileSync(cli, "");
    const agents = join(home, "Library", "LaunchAgents");
    realFs.mkdirSync(agents, { recursive: true });
    realFs.writeFileSync(
      join(agents, "com.coding-friend.supervisor.plist"),
      buildPlist({
        label: "com.coding-friend.supervisor",
        programArgs: [process.execPath, cli, "supervisor", "tick"],
        storeDir: join(home, "store"),
        path: "/usr/bin",
      }),
    );
    // `launchctl print` succeeds: the agent is loaded.
    execFileSync.mockImplementation(((bin: string, args?: readonly string[]) =>
      bin === "/bin/launchctl"
        ? ""
        : fakeExec(bin, args)) as unknown as typeof childProcess.execFileSync);

    const env = await runDoctorJson();
    const launchd = env.data.checks.find(
      (c: { id: string }) => c.id === "supervisor.launchd",
    );
    expect(launchd).toMatchObject({ group: "supervisor", status: "warn" });
    expect(launchd.detail).toContain(cli);
    expect(launchd.hint).toMatch(/Full Disk Access/);
    expect(launchd.fix).toBeUndefined();
  });
  it("reports decision env keys by name only, flags an ignored local block, and never calls fetch", async () => {
    const realFs = await vi.importActual<typeof import("fs")>("fs");
    const FAKE_TOKEN = "fake-token-for-doctor-test";
    realFs.mkdirSync(join(home, ".coding-friend"));
    realFs.writeFileSync(
      join(home, ".coding-friend", "config.json"),
      JSON.stringify({ decision: { provider: "cloudflare" } }),
    );
    const project = join(home, "proj");
    realFs.mkdirSync(join(project, ".coding-friend"), { recursive: true });
    realFs.writeFileSync(
      join(project, ".coding-friend", "config.json"),
      JSON.stringify({ decision: { allowRemote: true } }),
    );
    process.chdir(project);
    vi.stubEnv("CLOUDFLARE_API_TOKEN", FAKE_TOKEN);
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", undefined);
    vi.stubEnv("TYPESAFE_API_KEY", undefined);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const env = await runDoctorJson();
    const byId = (id: string) =>
      env.data.checks.find((c: { id: string }) => c.id === id);
    const provider = byId("decision.provider");
    expect(provider).toMatchObject({ group: "decision", status: "warn" });
    expect(provider.detail).toContain("CLOUDFLARE_API_TOKEN set");
    expect(provider.detail).toContain("CLOUDFLARE_ACCOUNT_ID missing");
    expect(stdout[0]).not.toContain(FAKE_TOKEN);
    // The local allowRemote is ignored: the global gate stays closed.
    expect(byId("decision.gate")).toMatchObject({ status: "warn" });
    expect(byId("decision.local")).toMatchObject({ status: "warn" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    { name: "absent", ageS: null, status: "ok" },
    { name: "stale", ageS: 25 * 3600, status: "warn" },
  ])(
    "reports quota.snapshot $status when the snapshot is $name",
    async ({ ageS, status }) => {
      const realFs = await vi.importActual<typeof import("fs")>("fs");
      const quotaDir = join(home, "quota");
      vi.stubEnv("CF_QUOTA_DIR", quotaDir);
      if (ageS !== null) {
        realFs.mkdirSync(quotaDir);
        realFs.writeFileSync(
          join(quotaDir, "claude.json"),
          JSON.stringify({
            schemaVersion: 1,
            provider: "claude",
            configDir: join(home, ".claude"),
            windows: { five_hour: { percentUsed: 10, resetsAt: 1 } },
            source: "statusline",
            measuredAt: Math.floor(Date.now() / 1000) - ageS,
          }),
        );
      }

      const env = await runDoctorJson();
      const snap = env.data.checks.find(
        (c: { id: string }) => c.id === "quota.snapshot",
      );
      expect(snap).toMatchObject({ group: "quota", status });
      if (ageS === null) expect(snap.detail).toMatch(/not recorded/);
      else expect(snap.hint).toMatch(/statusline|coding-friend-mods/);
    },
  );
});

describe("cf doctor session retention", () => {
  const SECRET = "sk-fake-SECRET-do-not-echo-7f3a";
  const UNSAVED_OLD = "11111111-1111-4111-8111-111111111111";
  const SAVED_OLD = "22222222-2222-4222-8222-222222222222";
  const UNSAVED_NEW = "33333333-3333-4333-8333-333333333333";
  const DAY_S = 86_400;

  type RealFs = typeof import("fs");
  const realFs = () => vi.importActual<RealFs>("fs");

  function writeFile(fsx: RealFs, path: string, content: string): void {
    fsx.mkdirSync(join(path, ".."), { recursive: true });
    fsx.writeFileSync(path, content);
  }

  /** A `<uuid>.jsonl` under `<claude>/projects/<dirName>/`, `ageDays` old. */
  function transcript(
    fsx: RealFs,
    dirName: string,
    id: string,
    ageDays: number,
  ): void {
    const path = join(home, ".claude", "projects", dirName, `${id}.jsonl`);
    writeFile(fsx, path, "{}\n");
    const at = Date.now() / 1000 - ageDays * DAY_S;
    fsx.utimesSync(path, at, at);
  }

  function check(env: { data: { checks: { id: string }[] } }, id: string) {
    return env.data.checks.find((c) => c.id === id) as
      | { status: string; detail?: string; hint?: string }
      | undefined;
  }

  beforeEach(() => {
    vi.stubEnv("CLAUDE_CONFIG_DIR", join(home, ".claude"));
  });

  it("warns on session.retention for an old transcript that was never saved", async () => {
    const fsx = await realFs();
    writeFile(
      fsx,
      join(home, ".claude", "settings.json"),
      JSON.stringify({ cleanupPeriodDays: 10 }),
    );
    transcript(fsx, "-some-project", UNSAVED_OLD, 5);
    transcript(fsx, "-some-project", SAVED_OLD, 5);
    transcript(fsx, "-some-project", UNSAVED_NEW, 0);
    writeFile(
      fsx,
      join(home, ".coding-friend", "sessions", "kept", "meta.json"),
      JSON.stringify({
        sessionId: SAVED_OLD,
        label: "kept",
        savedAt: new Date().toISOString(),
      }),
    );

    const env = await runDoctorJson();
    const retention = check(env, "session.retention");
    expect(retention?.status).toBe("warn");
    expect(retention?.detail).toBe(
      "1 unsaved session(s) within 7 days of the 10-day cleanup",
    );
    expect(retention?.hint).toMatch(/cf session save/);
    // fakeExec reports every dir as a git work tree.
    expect(check(env, "session.storage")?.status).toBe("warn");
  });

  it("prints the legacy sessions mv hint in human --project-dir output", async () => {
    const fsx = await realFs();
    const project = join(home, "proj");
    writeFile(
      fsx,
      join(project, "docs", "sessions", "old", "meta.json"),
      JSON.stringify({
        sessionId: SAVED_OLD,
        label: "old",
        savedAt: new Date().toISOString(),
      }),
    );
    vi.spyOn(console, "log").mockImplementation((...args) => {
      stdout.push(args.join(" "));
    });

    await doctorCommand("9.9.9", { projectDir: project });
    const out = stdout.join("\n");
    const sessionDir = join(home, ".coding-friend", "sessions");
    expect(out).toContain(
      `mkdir -p '${sessionDir}' && mv '${join(project, "docs", "sessions")}'/* '${sessionDir}'/`,
    );
  });

  it("gives no legacy mv hint when session.dir is the legacy folder itself", async () => {
    const fsx = await realFs();
    const project = join(home, "proj");
    const legacyDir = join(project, "docs", "sessions");
    writeFile(
      fsx,
      join(legacyDir, "old", "meta.json"),
      JSON.stringify({
        sessionId: SAVED_OLD,
        label: "old",
        savedAt: new Date().toISOString(),
      }),
    );
    writeFile(
      fsx,
      join(home, ".coding-friend", "config.json"),
      JSON.stringify({ session: { dir: legacyDir } }),
    );
    vi.spyOn(console, "log").mockImplementation((...args) => {
      stdout.push(args.join(" "));
    });

    await doctorCommand("9.9.9", { projectDir: project });
    expect(stdout.join("\n")).not.toContain(" && mv ");
  });

  it("never echoes a settings value other than cleanupPeriodDays", async () => {
    const fsx = await realFs();
    const project = join(home, "proj");
    writeFile(
      fsx,
      join(home, ".claude", "settings.json"),
      JSON.stringify({ cleanupPeriodDays: 10, env: { API_KEY: SECRET } }),
    );
    writeFile(
      fsx,
      join(project, ".claude", "settings.json"),
      JSON.stringify({ cleanupPeriodDays: SECRET }),
    );
    writeFile(
      fsx,
      join(project, ".claude", "settings.local.json"),
      `{"apiKeyHelper": "${SECRET}", `,
    );
    transcript(fsx, claudeProjectDirName(project).name, UNSAVED_OLD, 5);

    const global = await runDoctorJson();
    expect(check(global, "session.retention")?.status).toBe("warn");
    await doctorCommand("9.9.9", { json: true, projectDir: project });
    const projectEnv = JSON.parse(stdout[1]);
    expect(check(projectEnv, "project.retention")?.status).toBe("warn");
    expect(stdout.join("")).not.toContain(SECRET);
  });

  it("skips a broken settings file and falls back to the next scope", async () => {
    const fsx = await realFs();
    const project = join(home, "proj");
    writeFile(
      fsx,
      join(home, ".claude", "settings.json"),
      JSON.stringify({ cleanupPeriodDays: 10 }),
    );
    writeFile(
      fsx,
      join(project, ".claude", "settings.json"),
      JSON.stringify({ cleanupPeriodDays: 20 }),
    );
    writeFile(
      fsx,
      join(project, ".claude", "settings.local.json"),
      '{"cleanupPeriodDays": 99,',
    );

    await doctorCommand("9.9.9", { json: true, projectDir: project });
    const env = JSON.parse(stdout[0]);
    expect(check(env, "project.retention")).toMatchObject({
      status: "ok",
      detail: "0 unsaved session(s) within 7 days of the 20-day cleanup",
    });
  });
});
