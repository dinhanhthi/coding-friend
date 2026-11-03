import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "vitest";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Readable } from "stream";

const state = vi.hoisted(() => ({
  memoryDir: "",
  fakeExists: {} as Record<string, boolean>,
}));

const mockIsDaemonRunning = vi.fn();
const mockGetDaemonInfo = vi.fn();
const mockAreSqliteDepsAvailable = vi.fn();
const mockLoadConfig = vi.fn();
const mockExecFile = vi.fn();

vi.mock("child_process", async () => {
  const actual =
    await vi.importActual<typeof import("child_process")>("child_process");
  return { ...actual, execFile: (...a: unknown[]) => mockExecFile(...a) };
});

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: (p: string) =>
      p.startsWith("/fake/cf-memory")
        ? (state.fakeExists[p] ?? true)
        : actual.existsSync(p),
  };
});

vi.mock("../../lib/config.js", async () => {
  const actual = await vi.importActual<typeof import("../../lib/config.js")>(
    "../../lib/config.js",
  );
  return {
    // Real resolveMemoryDir calls loadConfig once before returning the dir.
    // An empty state.memoryDir falls through to the real, cwd-based lookup.
    resolveMemoryDir: vi.fn((p?: string) => {
      if (!state.memoryDir) return actual.resolveMemoryDir(p);
      mockLoadConfig();
      return state.memoryDir;
    }),
    loadConfig: (...args: unknown[]) => mockLoadConfig(...args),
  };
});

vi.mock("../../lib/lib-path.js", () => ({
  getLibPath: vi.fn(() => "/fake/cf-memory"),
}));

vi.mock("../../lib/exec.js", () => ({
  run: vi.fn(() => null),
  runWithStderr: vi.fn(() => ({ exitCode: 0, stdout: "", stderr: "" })),
}));

vi.mock("../../lib/memory-prompts.js", () => ({
  memoryConfigMenu: vi.fn(),
  getMemoryMcpStatus: vi.fn(() => ({
    configured: true,
    scope: "user",
    userScope: true,
  })),
}));

vi.mock("/fake/cf-memory/dist/daemon/process.js", () => ({
  isDaemonRunning: (...a: unknown[]) => mockIsDaemonRunning(...a),
  getDaemonInfo: (...a: unknown[]) => mockGetDaemonInfo(...a),
}));

vi.mock("/fake/cf-memory/dist/lib/lazy-install.js", () => ({
  areSqliteDepsAvailable: (...a: unknown[]) => mockAreSqliteDepsAvailable(...a),
}));

import chalk from "chalk";
import { log } from "../../lib/log.js";
import { run, runWithStderr } from "../../lib/exec.js";
import {
  memoryStatusCommand,
  memorySearchCommand,
  memoryListCommand,
  memoryShowCommand,
  memoryEditCommand,
  memoryDeleteCommand,
} from "../memory.js";

const NOW = 1_800_000_000_000;

function captureOutput(): string[] {
  const calls: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    calls.push(args.map(String).join(" "));
  });
  return calls;
}

let savedLevel: typeof chalk.level;

beforeAll(() => {
  state.memoryDir = mkdtempSync(join(tmpdir(), "cf-memjson-"));
  mkdirSync(join(state.memoryDir, "features"));
  mkdirSync(join(state.memoryDir, "bugs"));
  mkdirSync(join(state.memoryDir, "empty"));
  writeFileSync(join(state.memoryDir, "features", "a.md"), "# a");
  writeFileSync(join(state.memoryDir, "features", "b.md"), "# b");
  writeFileSync(join(state.memoryDir, "bugs", "c.md"), "# c");
  writeFileSync(join(state.memoryDir, "README.md"), "# readme");
});

afterAll(() => {
  rmSync(state.memoryDir, { recursive: true, force: true });
});

beforeEach(() => {
  savedLevel = chalk.level;
  chalk.level = 0;
  state.fakeExists = {};
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  mockAreSqliteDepsAvailable.mockReturnValue(false);
  mockIsDaemonRunning.mockResolvedValue(true);
  mockGetDaemonInfo.mockReturnValue({ pid: 4242, startedAt: NOW - 90_000 });
  mockLoadConfig.mockImplementation(() => {
    log.warn("Unknown config key 'bogusKey'.");
    return {
      memory: { autoCapture: true, embedding: { provider: "ollama" } },
    };
  });
});

afterEach(() => {
  chalk.level = savedLevel;
  vi.restoreAllMocks();
});

// ─── Characterization (locks pre-refactor human output; never edit) ──

describe("memoryStatusCommand — human output characterization", () => {
  it("prints every line with config warnings in place", async () => {
    const output = captureOutput();

    await memoryStatusCommand();

    expect(output.join("\n").replaceAll(state.memoryDir, "<MEMDIR>"))
      .toMatchInlineSnapshot(`
        "⚠ Unknown config key 'bogusKey'.
        ┌─────────────────────────────┐
        │   🧠 Coding Friend Memory   │
        └─────────────────────────────┘

        ℹ Tier: Tier 2 (MiniSearch + Daemon)
        ℹ Memory dir: <MEMDIR>
        ℹ Memories in this dir: 3
        ℹ Daemon: running (PID 4242, uptime 2m) Turn it off by "cf memory stop-daemon"
        ℹ SQLite deps: not installed (run "cf memory init" to enable Tier 1)
        ⚠ Unknown config key 'bogusKey'.
        ℹ Embedding: all-minilm:l6-v2 (ollama)
        ℹ MCP: registered (user scope)
        ℹ Auto-capture: on
        ℹ Categories: bugs (1), features (2)

        Docs: https://cf.dinhanhthi.com/#memory
        "
      `);
  });
});

// ─── --json envelopes ──────────────────────────────────────────────────────

function captureStdout(): string[] {
  const writes: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
  vi.spyOn(console, "error").mockImplementation(() => {});
  return writes;
}

function singleEnvelope(writes: string[]) {
  expect(writes).toHaveLength(1);
  return JSON.parse(writes[0]);
}

describe("--json", () => {
  beforeEach(() => {
    process.exitCode = undefined;
    vi.mocked(run).mockReset().mockReturnValue(null);
    vi.mocked(runWithStderr)
      .mockReset()
      .mockReturnValue({ exitCode: 0, stdout: "", stderr: "" });
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it("memory status --json writes one status envelope and nothing else to stdout", async () => {
    const logged = captureOutput();
    const writes = captureStdout();

    await memoryStatusCommand({ json: true });

    expect(logged).toEqual([]);
    expect(singleEnvelope(writes)).toEqual({
      contractVersion: 1,
      ok: true,
      error: null,
      data: {
        dir: state.memoryDir,
        documents: 3,
        tier: 2,
        sqliteDeps: false,
        daemon: { running: true, pid: 4242, startedAt: NOW - 90_000 },
        embedding: { provider: "ollama", model: "all-minilm:l6-v2" },
        mcp: { configured: true, scope: "user", userScope: true },
        autoCapture: true,
        categories: [
          { name: "bugs", count: 1 },
          { name: "features", count: 2 },
        ],
      },
    });
    expect(process.exitCode).toBeUndefined();
  });

  it("memory status --json returns MEMORY_BUILD_FAILED when the build fails", async () => {
    state.fakeExists["/fake/cf-memory/dist"] = false;
    vi.mocked(runWithStderr).mockReturnValue({
      exitCode: 1,
      stdout: "",
      stderr: "tsc exploded",
    });
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    const writes = captureStdout();

    await memoryStatusCommand({ json: true });

    expect(exitSpy).not.toHaveBeenCalled();
    const env = singleEnvelope(writes);
    expect(env.ok).toBe(false);
    expect(env.error.code).toBe("MEMORY_BUILD_FAILED");
    expect(process.exitCode).toBe(1);
  });

  it("memory search --json returns the parsed hits", async () => {
    const hits = [
      {
        id: "features/a",
        category: "features",
        title: "A",
        description: "desc",
        type: "fact",
        tags: [],
        score: 3,
        matchedOn: ["title"],
      },
    ];
    vi.mocked(run).mockReturnValue(JSON.stringify(hits));
    const writes = captureStdout();

    await memorySearchCommand("auth", { json: true });

    expect(singleEnvelope(writes)).toEqual({
      contractVersion: 1,
      ok: true,
      error: null,
      data: { query: "auth", results: hits },
    });
    const childEnv = vi.mocked(run).mock.calls[0][2]?.["env"];
    expect(childEnv?.CF_SEARCH_QUERY).toBe("auth");
  });

  it("memory search --json returns NOT_FOUND when the memory dir is missing", async () => {
    const saved = state.memoryDir;
    state.memoryDir = join(saved, "does-not-exist");
    const writes = captureStdout();
    try {
      await memorySearchCommand("auth", { json: true });
    } finally {
      state.memoryDir = saved;
    }

    const env = singleEnvelope(writes);
    expect(env.error.code).toBe("NOT_FOUND");
    expect(run).not.toHaveBeenCalled();
  });

  it("memory search --json returns COMMAND_FAILED when the child fails", async () => {
    vi.mocked(run).mockReturnValue(null);
    const writes = captureStdout();

    await memorySearchCommand("auth", { json: true });

    expect(singleEnvelope(writes).error.code).toBe("COMMAND_FAILED");
  });

  it("memory list --json returns the parsed memories", async () => {
    const items = [
      {
        id: "bugs/c",
        category: "bugs",
        title: "C",
        description: "d",
        type: "bug",
        tags: ["x"],
        updated: "2026-10-01",
      },
    ];
    vi.mocked(run).mockReturnValue(JSON.stringify(items));
    const writes = captureStdout();

    await memoryListCommand({ json: true });

    expect(singleEnvelope(writes)).toMatchObject({ ok: true, data: items });
  });

  it("memory list --json returns an empty list when the memory dir is missing", async () => {
    const saved = state.memoryDir;
    state.memoryDir = join(saved, "does-not-exist");
    const writes = captureStdout();
    try {
      await memoryListCommand({ json: true });
    } finally {
      state.memoryDir = saved;
    }

    expect(singleEnvelope(writes)).toEqual({
      contractVersion: 1,
      ok: true,
      data: [],
      error: null,
    });
  });

  it("memory list --projects --json returns [] when no project DBs exist", async () => {
    const home = mkdtempSync(join(tmpdir(), "cf-memjson-home-"));
    vi.stubEnv("HOME", home);
    const writes = captureStdout();
    try {
      await memoryListCommand({ projects: true, json: true });
    } finally {
      vi.unstubAllEnvs();
      rmSync(home, { recursive: true, force: true });
    }

    expect(singleEnvelope(writes)).toMatchObject({ ok: true, data: [] });
  });
});

// ─── show / edit / delete with --project-dir ───────────────────────────────

describe("memory show|edit|delete --json --project-dir", () => {
  const origCwd = process.cwd();
  let tmp: string;
  let other: string;
  let target: string;
  let savedMemoryDir: string;

  const note = (root: string) =>
    join(root, "docs", "memory", "conventions", "x.md");

  function project(name: string, title: string): string {
    const root = join(tmp, name);
    mkdirSync(join(root, "docs", "memory", "conventions"), { recursive: true });
    writeFileSync(
      note(root),
      `---\ntitle: ${title}\ntype: preference\n---\n${title} body\n`,
    );
    return root;
  }

  function pipeStdin(body: string): void {
    vi.spyOn(process, "stdin", "get").mockReturnValue(
      Readable.from([Buffer.from(body)]) as unknown as typeof process.stdin,
    );
  }

  /** The shared daemon (pid file → this live pid) watches `dir`. */
  function daemonWatching(dir: string): void {
    const base = join(tmp, "home", ".coding-friend", "memory");
    mkdirSync(base, { recursive: true });
    writeFileSync(join(base, "daemon.pid"), `${process.pid}\n${NOW}\n`);
    mockExecFile.mockImplementation(
      (_cmd: string, _args: string[], _opts: unknown, cb: Function) =>
        cb(
          null,
          `node /x/dist/daemon/entry.js ${dir} --embedding-provider=t\n`,
        ),
    );
  }

  async function json(fn: () => Promise<void>) {
    const writes = captureStdout();
    await fn();
    vi.mocked(process.stdout.write).mockRestore();
    return singleEnvelope(writes);
  }

  beforeEach(() => {
    process.exitCode = undefined;
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "cf-memjson-proj-")));
    mkdirSync(join(tmp, "home"));
    vi.stubEnv("HOME", join(tmp, "home"));
    other = project("cwd-project", "cwd");
    target = project("target", "target");
    savedMemoryDir = state.memoryDir;
    state.memoryDir = "";
    mockExecFile.mockReset();
    process.chdir(other);
  });

  afterEach(() => {
    process.chdir(origCwd);
    state.memoryDir = savedMemoryDir;
    vi.unstubAllEnvs();
    process.exitCode = undefined;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("show and edit target the --project-dir memory dir, not cwd's", async () => {
    const shown = await json(() =>
      memoryShowCommand("conventions/x", { json: true, projectDir: target }),
    );
    expect(shown.data).toMatchObject({
      id: "conventions/x",
      category: "conventions",
      path: note(target),
      frontmatter: { title: "target" },
      content: "target body\n",
    });

    pipeStdin("new body\n");
    const edited = await json(() =>
      memoryEditCommand("conventions/x", {
        json: true,
        stdin: true,
        ifMatch: shown.data.sha256,
        projectDir: target,
      }),
    );
    expect(edited.data).toMatchObject({
      id: "conventions/x",
      path: note(target),
    });
    expect(readFileSync(note(target), "utf8")).toContain("new body\n");
    expect(readFileSync(note(other), "utf8")).toContain("cwd body\n");
  });

  it.each([
    ["this memory dir", "", "watched"],
    ["a sibling memory dir", "-old", "stale"],
  ])(
    "edit reports index when the daemon watches %s",
    async (_, suffix, index) => {
      const memDir = join(target, "docs", "memory");
      mkdirSync(memDir + suffix, { recursive: true });
      daemonWatching(memDir + suffix);
      const sha = (
        await json(() =>
          memoryShowCommand("conventions/x", {
            json: true,
            projectDir: target,
          }),
        )
      ).data.sha256;

      pipeStdin("edited\n");
      const env = await json(() =>
        memoryEditCommand("conventions/x", {
          json: true,
          stdin: true,
          ifMatch: sha,
          projectDir: target,
        }),
      );
      expect(env.data.index).toBe(index);
    },
  );

  it("delete needs --yes in JSON mode, then drops the CLAUDE.md entry", async () => {
    const claude = join(target, "CLAUDE.md");
    writeFileSync(
      claude,
      "# P\n\n## CF Memory: Project Rules\n\n" +
        "- Tabs <!-- cf:conventions/x -->\n- Keep <!-- cf:conventions/y -->\n" +
        "\n## Other\n\ntext\n",
    );

    const refused = await json(() =>
      memoryDeleteCommand("conventions/x", { json: true, projectDir: target }),
    );
    expect(refused.error.code).toBe("INTERACTIVE_REQUIRED");
    expect(existsSync(note(target))).toBe(true);

    const env = await json(() =>
      memoryDeleteCommand("conventions/x", {
        json: true,
        yes: true,
        projectDir: target,
      }),
    );
    expect(env.data).toMatchObject({
      id: "conventions/x",
      deleted: true,
      instructionFiles: [claude],
      warnings: [],
    });
    expect(existsSync(note(target))).toBe(false);
    const md = readFileSync(claude, "utf8");
    expect(md).not.toContain("cf:conventions/x");
    expect(md).toContain("- Keep <!-- cf:conventions/y -->");
    expect(md).toContain("## Other\n\ntext\n");
  });
});
