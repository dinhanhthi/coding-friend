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

let home: string;
let savedEnv: NodeJS.ProcessEnv;
let stdout: string[];

/** `which` finds claude and codex; codex hangs on --version; claude mcp get fails. */
function fakeExec(bin: string, args: readonly string[] = []): string {
  if (bin === "which" && (args[0] === "claude" || args[0] === "codex")) {
    return `/usr/local/bin/${args[0]}\n`;
  }
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
  savedEnv = { ...process.env };
  process.env.HOME = home;
  delete process.env.CLAUDE_CONFIG_DIR;
  delete process.env.CF_PROJECTS_FILE;
  delete process.env.CF_ORCHESTRATOR_DIR;

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
  process.env = savedEnv;
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
});
