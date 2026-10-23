import {
  describe,
  it,
  expect,
  vi,
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
} from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { notifyUser, type NotifyExecFile } from "../../notify.js";
import { CHEF_OUTPUT_SCHEMA } from "../chef-actions.js";
import { makeChefHooksDir } from "../chef-git.js";
import {
  buildChefSpawn,
  CHEF_PROVIDERS,
  chefEnv,
  chefProviderNames,
  claudeVersionError,
  finishChefRun,
  parseChefLine,
  type ChefSpawnInput,
  type ChefSpawnSpec,
  type ChefStreamAcc,
} from "../providers/chef.js";
import {
  PROVIDERS,
  type SpawnContext,
  type StreamAcc,
} from "../providers/index.js";
import {
  newId,
  PROVIDER_NAMES,
  type Provider,
  type TaskRecord,
} from "../store.js";

const PROMPT = "SECRET-PROMPT refactor the parser";

const ctx: SpawnContext = {
  orchDir: "/orch",
  taskDir: "/orch/tasks/abcd1234",
  // No last-message.txt here: codex falls back to the parsed stream.
  privateDir: join(tmpdir(), "cf-providers-test-missing"),
  checkout: "/repo",
  cfInvocation: ["/usr/bin/node", "/cli/index.js"],
  sessionUuid: "00000000-0000-4000-8000-000000000000",
};

function task(provider: Provider, readOnly: boolean): TaskRecord {
  return {
    schemaVersion: 1,
    id: "abcd1234",
    provider,
    prompt: PROMPT,
    readOnly,
    checkout: ctx.checkout,
    createdAt: new Date().toISOString(),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

const TRUSTED = [
  "/orch/runs",
  "/orch/leases",
  "/orch/runner",
  "/orch/supervisor",
  "/orch/chefs",
];

function claudeSettings(args: string[]): any {
  return JSON.parse(args[args.indexOf("--settings") + 1]);
}

function after(args: string[], flag: string, n = 1): string[] {
  const i = args.indexOf(flag);
  return i === -1 ? [] : args.slice(i + 1, i + 1 + n);
}

function parse(provider: Provider, lines: string[]) {
  const adapter = PROVIDERS[provider];
  const acc: StreamAcc = {};
  for (const line of lines) adapter.parseLine(line, acc);
  return adapter.finish(acc, 0, ctx);
}

describe("buildSpawn", () => {
  it("claude writer runs in a mandatory sandbox that can write only its task dir", () => {
    const { args } = PROVIDERS.claude.buildSpawn(task("claude", false), ctx);
    expect(claudeSettings(args).sandbox).toMatchObject({
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      filesystem: { allowWrite: [ctx.taskDir] },
    });
  });

  it.each([false, true])(
    "claude (readOnly=%s) denies writes to the store's trusted dirs",
    (readOnly) => {
      const { args } = PROVIDERS.claude.buildSpawn(
        task("claude", readOnly),
        ctx,
      );
      const { denyWrite } = claudeSettings(args).sandbox.filesystem;
      // The sandbox can write the per-user temp dir, where a store may live.
      expect(denyWrite).toEqual(expect.arrayContaining(TRUSTED));
      expect(denyWrite).not.toContain(ctx.orchDir);
    },
  );

  it("claude read-only blocks edit tools and denies writes to the checkout", () => {
    const { args } = PROVIDERS.claude.buildSpawn(task("claude", true), ctx);
    expect(after(args, "--disallowedTools", 3)).toEqual([
      "Edit",
      "Write",
      "NotebookEdit",
    ]);
    expect(after(args, "--permission-mode")).toEqual(["dontAsk"]);
    // dontAsk denies unlisted Bash: the worker's own cf ask/done must be allowed.
    expect(after(args, "--allowedTools", 2)).toEqual([
      "Bash(/usr/bin/node /cli/index.js ask *)",
      "Bash(/usr/bin/node /cli/index.js done *)",
    ]);
    expect(claudeSettings(args).sandbox.filesystem).toEqual({
      allowWrite: [ctx.taskDir],
      denyWrite: [ctx.checkout, ...TRUSTED],
    });
    expect(after(args, "--add-dir")).toEqual([ctx.taskDir]);
  });

  it.each([
    [false, ":workspace"],
    [true, ":read-only"],
  ])(
    "codex (readOnly=%s) uses a permission profile: store read-only, task dir writable",
    (readOnly, base) => {
      const { args } = PROVIDERS.codex.buildSpawn(task("codex", readOnly), ctx);
      const config = args.filter((_, i) => args[i - 1] === "-c");
      expect(config).toEqual([
        'default_permissions="cf_task"',
        `permissions.cf_task.extends="${base}"`,
        'permissions.cf_task.filesystem={"/orch"="read","/orch/tasks/abcd1234"="write"}',
      ]);
      // --sandbox would override the profile.
      expect(args).not.toContain("--sandbox");
      expect(args).not.toContain("--add-dir");
    },
  );

  it("codex escapes store paths as TOML basic strings", () => {
    const odd = { ...ctx, orchDir: '/o "x"\\y', taskDir: '/o "x"\\y/tasks/t' };
    const { args } = PROVIDERS.codex.buildSpawn(task("codex", false), odd);
    expect(args).toContain(
      'permissions.cf_task.filesystem={"/o \\"x\\"\\\\y"="read","/o \\"x\\"\\\\y/tasks/t"="write"}',
    );
  });

  it.each([false, true])(
    "codex (readOnly=%s) writes -o into the runner private dir, not the task dir",
    (readOnly) => {
      const { args } = PROVIDERS.codex.buildSpawn(task("codex", readOnly), ctx);
      expect(after(args, "-o")).toEqual([
        join(ctx.privateDir, "last-message.txt"),
      ]);
      expect(args.some((a) => a.startsWith(ctx.taskDir + "/"))).toBe(false);
    },
  );

  it.each([
    ["claude", false],
    ["claude", true],
    ["codex", false],
    ["codex", true],
  ] as const)(
    "%s (readOnly=%s) passes the prompt only via stdin and sets CF_TASK_ID",
    (provider, readOnly) => {
      const spec = PROVIDERS[provider].buildSpawn(
        task(provider, readOnly),
        ctx,
      );
      expect(spec.args.some((a) => a.includes("SECRET-PROMPT"))).toBe(false);
      expect(spec.stdin).toContain(PROMPT);
      expect(spec.env.CF_TASK_ID).toBe("abcd1234");
    },
  );

  it.each(["claude", "codex"] as const)(
    "%s preamble says to run cf ask/done standalone (dontAsk denies chains)",
    (provider) => {
      const spec = PROVIDERS[provider].buildSpawn(task(provider, true), ctx);
      const preamble =
        provider === "claude"
          ? after(spec.args, "--append-system-prompt")[0]
          : spec.stdin;
      expect(preamble).toContain(
        "as a single standalone command, exactly as shown: never chain it with ;, &&, || or |",
      );
    },
  );
});

describe("stream parsing", () => {
  it("claude success result → succeeded with session id and last message", () => {
    const fin = parse("claude", [
      '{"type":"system","subtype":"init","session_id":"sess-1","tools":[]}',
      '{"type":"result","subtype":"success","is_error":false,"result":"All done","session_id":"sess-1"}',
    ]);
    expect(fin).toMatchObject({
      outcome: "succeeded",
      sessionId: "sess-1",
      lastMessage: "All done",
    });
    expect(fin.error).toBeUndefined();
  });

  it("claude error result → failed with its errors", () => {
    const fin = parse("claude", [
      '{"type":"system","subtype":"init","session_id":"sess-2"}',
      '{"type":"result","subtype":"error_max_turns","is_error":true,"session_id":"sess-2","errors":["Reached max turns"]}',
    ]);
    expect(fin).toMatchObject({
      outcome: "failed",
      sessionId: "sess-2",
      error: "Reached max turns",
    });
  });

  it("codex thread.started + turn.completed → succeeded with thread id", () => {
    const fin = parse("codex", [
      '{"type":"thread.started","thread_id":"thread-1"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Fixed it"}}',
      '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}',
    ]);
    expect(fin).toMatchObject({
      outcome: "succeeded",
      sessionId: "thread-1",
      lastMessage: "Fixed it",
    });
  });

  it("codex error then turn.failed → failed", () => {
    const fin = parse("codex", [
      '{"type":"thread.started","thread_id":"thread-2"}',
      '{"type":"error","message":"stream disconnected"}',
      '{"type":"turn.failed","error":{"message":"stream disconnected"}}',
    ]);
    expect(fin).toMatchObject({
      outcome: "failed",
      sessionId: "thread-2",
      error: "stream disconnected",
    });
  });

  describe("codex last-message.txt", () => {
    const lines = [
      '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"From stream"}}',
      '{"type":"turn.completed"}',
    ];
    function finishIn(privateDir: string) {
      const acc: StreamAcc = {};
      for (const line of lines) PROVIDERS.codex.parseLine(line, acc);
      return PROVIDERS.codex.finish(acc, 0, { ...ctx, privateDir });
    }

    it("prefers a regular file written by codex", () => {
      const dir = mkdtempSync(join(tmpdir(), "cf-providers-private-"));
      try {
        writeFileSync(join(dir, "last-message.txt"), "From file");
        expect(finishIn(dir).lastMessage).toBe("From file");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("does not read through a symlink", () => {
      const dir = mkdtempSync(join(tmpdir(), "cf-providers-private-"));
      try {
        writeFileSync(join(dir, "secret"), "SECRET");
        symlinkSync(join(dir, "secret"), join(dir, "last-message.txt"));
        expect(finishIn(dir).lastMessage).toBe("From stream");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });
});

describe("quota detection", () => {
  it("claude rejected rate_limit_event → quota with ms resetsAt normalized to seconds", () => {
    const fin = parse("claude", [
      '{"type":"system","subtype":"init","session_id":"sess-q"}',
      '{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1800000000000}}',
      '{"type":"result","subtype":"error_during_execution","is_error":true,"api_error_status":429,"result":"limit hit","session_id":"sess-q"}',
    ]);
    expect(fin).toMatchObject({
      outcome: "failed",
      sessionId: "sess-q",
      quota: { resetsAt: 1800000000, source: "claude.rate_limit_event" },
    });
  });

  it("claude allowed_warning is not a quota stop", () => {
    const acc: StreamAcc = {};
    PROVIDERS.claude.parseLine(
      '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning","resetsAt":1800000000}}',
      acc,
    );
    expect(acc.quota).toBeUndefined();
  });

  it("codex usage limit (curly apostrophe) → quota at the parsed local time", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 10, 0));
    const fin = parse("codex", [
      '{"type":"thread.started","thread_id":"thread-q"}',
      '{"type":"turn.failed","error":{"message":"You\u2019ve hit your usage limit. Try again at 3:45 PM."}}',
    ]);
    expect(fin).toMatchObject({
      outcome: "failed",
      sessionId: "thread-q",
      quota: {
        resetsAt: new Date(2026, 9, 20, 15, 45).getTime() / 1000,
        source: "codex.usage_limit",
      },
    });
  });

  it('codex turn.failed "Try again later." keeps the reset parsed from the error event', () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 20, 10, 0));
    const fin = parse("codex", [
      '{"type":"error","message":"You\u2019ve hit your usage limit. Try again at 3:45 PM."}',
      '{"type":"turn.failed","error":{"message":"You\'ve hit your usage limit. Try again later."}}',
    ]);
    expect(fin.quota?.resetsAt).toBe(
      new Date(2026, 9, 20, 15, 45).getTime() / 1000,
    );
  });
});

describe("resume keeps the sandbox", () => {
  const SID = "0199a213-81c0-7800-8aa1-bbab2a035a53";
  const resumeCtx: SpawnContext = { ...ctx, resume: { sessionId: SID } };

  it("claude resumes with --resume <sid>, no --session-id, same sandbox flags", () => {
    const { args } = PROVIDERS.claude.buildSpawn(
      task("claude", true),
      resumeCtx,
    );
    expect(after(args, "--resume")).toEqual([SID]);
    expect(args).not.toContain("--session-id");
    expect(after(args, "--permission-mode")).toEqual(["dontAsk"]);
    expect(after(args, "--allowedTools", 2)).toEqual([
      "Bash(/usr/bin/node /cli/index.js ask *)",
      "Bash(/usr/bin/node /cli/index.js done *)",
    ]);
    expect(claudeSettings(args).sandbox).toMatchObject({
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      filesystem: {
        allowWrite: [ctx.taskDir],
        denyWrite: [ctx.checkout, ...TRUSTED],
      },
    });
  });

  it("codex keeps the permission profile and -C before `resume <thread> -`", () => {
    const { args } = PROVIDERS.codex.buildSpawn(task("codex", true), resumeCtx);
    expect(args.filter((_, i) => args[i - 1] === "-c")).toEqual([
      'default_permissions="cf_task"',
      'permissions.cf_task.extends=":read-only"',
      'permissions.cf_task.filesystem={"/orch"="read","/orch/tasks/abcd1234"="write"}',
    ]);
    const resume = args.indexOf("resume");
    expect(args.indexOf("-C")).toBeGreaterThan(-1);
    expect(args.indexOf("-C")).toBeLessThan(resume);
    expect(args.slice(resume)).toEqual(["resume", SID, "-"]);
  });

  it("both refuse to resume a session id that could be read as a flag", () => {
    const bad: SpawnContext = { ...ctx, resume: { sessionId: "--yolo-12345" } };
    for (const p of ["claude", "codex"] as const) {
      expect(() => PROVIDERS[p].buildSpawn(task(p, true), bad)).toThrow(
        /invalid session id/,
      );
    }
  });

  it("claude worker env drops CLAUDE_CODE_RETRY_WATCHDOG* (CF decides wait or switch)", () => {
    vi.stubEnv("CLAUDE_CODE_RETRY_WATCHDOG", "1");
    vi.stubEnv("CLAUDE_CODE_RETRY_WATCHDOG_MAX_MS", "600000");
    const { env } = PROVIDERS.claude.buildSpawn(task("claude", false), ctx);
    expect(
      Object.keys(env).filter((k) =>
        k.startsWith("CLAUDE_CODE_RETRY_WATCHDOG"),
      ),
    ).toEqual([]);
  });
});

describe("model and caps (C3a)", () => {
  it.each([
    ["claude", "--model"],
    ["codex", "-m"],
  ] as const)("%s adds %s <m> only when the attempt has a model", (p, flag) => {
    const plain = PROVIDERS[p].buildSpawn(task(p, false), ctx).args;
    expect(plain).not.toContain(flag);
    const withModel = PROVIDERS[p].buildSpawn(task(p, false), {
      ...ctx,
      model: "gpt-5",
    }).args;
    expect(after(withModel, flag)).toEqual(["gpt-5"]);
    // Same args otherwise (regression: no model → args unchanged).
    const i = withModel.indexOf(flag);
    expect([...withModel.slice(0, i), ...withModel.slice(i + 2)]).toEqual(
      plain,
    );
  });

  it.each(["claude", "codex"] as const)(
    "%s buildSpawn refuses a model that looks like a flag",
    (p) => {
      expect(() =>
        PROVIDERS[p].buildSpawn(task(p, false), { ...ctx, model: "-x" }),
      ).toThrow(/invalid model name/);
    },
  );

  it("claude and codex caps", () => {
    expect(PROVIDERS.claude.caps).toEqual({
      writer: true,
      readOnly: true,
      nonGitReadOnly: true,
      needsModel: false,
      chef: true,
      cfShell: true,
    });
    expect(PROVIDERS.codex.caps).toEqual({
      writer: true,
      readOnly: true,
      nonGitReadOnly: false,
      needsModel: false,
      chef: true,
      cfShell: true,
    });
  });
});

// ─── chef (C2b) ─────────────────────────────────────────────────────────

describe("chef spawn", () => {
  const SID = "0199a213-81c0-7800-8aa1-bbab2a035a53";
  let chefRoot: string;
  let orch: string;
  let chef: ChefSpawnInput["chef"];

  beforeAll(() => {
    chefRoot = realpathSync(mkdtempSync(join(tmpdir(), "cf-chef-spawn-")));
    orch = join(chefRoot, "orch");
    const id = newId();
    const dir = join(orch, "chefs", id);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(join(dir, "chef.json"), "{}");
    chef = {
      id,
      provider: "claude",
      checkout: join(chefRoot, "repo"),
      binaries: {
        git: "/usr/bin/git",
        claude: "/abs/bin/claude",
        codex: "/abs/bin/codex",
      },
      sessionUuid: "123e4567-e89b-12d3-a456-426614174000",
    };
  });

  beforeEach(() => {
    vi.stubEnv("CF_ORCHESTRATOR_DIR", orch);
  });

  afterAll(() => {
    rmSync(chefRoot, { recursive: true, force: true });
  });

  const privateCwd = () => join(orch, "chefs", chef.id, "private", "cwd");

  it("claude chef: restricted read-only flags, cwd = private/cwd, checkout only via --add-dir", () => {
    const first = buildChefSpawn({ chef, wake: 1, digest: "DIGEST-TEXT" });
    expect(first.cmd).toBe("/abs/bin/claude");
    expect(first.cwd).toBe(privateCwd());
    expect(first.cwd).not.toBe(chef.checkout);
    const { args } = first;
    expect(args).toEqual(
      expect.arrayContaining(["--restricted", "--safe-mode"]),
    );
    expect(after(args, "--add-dir")).toEqual([chef.checkout]);
    expect(after(args, "--tools", 3)).toEqual(["Read", "Grep", "Glob"]);
    expect(after(args, "--permission-mode")).toEqual(["dontAsk"]);
    expect(args).toContain("--strict-mcp-config");
    expect(JSON.parse(after(args, "--json-schema")[0])).toEqual(
      CHEF_OUTPUT_SCHEMA,
    );
    expect(after(args, "--session-id")).toEqual([chef.sessionUuid]);
    expect(args).not.toContain("--bare");
    // The digest goes through stdin only.
    expect(first.stdin).toBe("DIGEST-TEXT");
    expect(args.some((a) => a.includes("DIGEST-TEXT"))).toBe(false);

    const next = buildChefSpawn({
      chef,
      wake: 2,
      digest: "D",
      resume: { sessionId: SID },
    });
    expect(after(next.args, "--resume")).toEqual([SID]);
    expect(next.args).not.toContain("--session-id");
    expect(next.args).toEqual(
      expect.arrayContaining(["--restricted", "--safe-mode", "--add-dir"]),
    );
  });

  it("codex chef: -C private/cwd, ignored user config, :read-only profile, exec flags before resume, no --sandbox", () => {
    const codexChef = { ...chef, provider: "codex" as const };
    const first = buildChefSpawn({ chef: codexChef, wake: 3, digest: "D" });
    expect(first.cmd).toBe("/abs/bin/codex");
    expect(first.cwd).toBe(privateCwd());
    const { args } = first;
    expect(after(args, "-C")).toEqual([privateCwd()]);
    expect(args).not.toContain(chef.checkout);
    expect(args).toContain("--ignore-user-config");
    expect(args.filter((_, i) => args[i - 1] === "-c")).toEqual([
      'default_permissions="cf_chef"',
      'permissions.cf_chef.extends=":read-only"',
    ]);
    expect(args).toContain("--skip-git-repo-check");
    expect(args).not.toContain("--sandbox");
    const schemaFile = after(args, "--output-schema")[0];
    expect(JSON.parse(readFileSync(schemaFile, "utf-8"))).toEqual(
      CHEF_OUTPUT_SCHEMA,
    );
    expect(after(args, "-o")).toEqual([first.outputFile]);
    expect(args.at(-1)).toBe("-");

    const next = buildChefSpawn({
      chef: codexChef,
      wake: 4,
      digest: "D",
      resume: { sessionId: SID },
    });
    const resume = next.args.indexOf("resume");
    expect(next.args.slice(resume)).toEqual(["resume", SID, "-"]);
    for (const flag of [
      "--skip-git-repo-check",
      "--ignore-user-config",
      "-C",
      "--output-schema",
      "-o",
    ]) {
      expect(next.args.indexOf(flag)).toBeGreaterThan(-1);
      expect(next.args.indexOf(flag)).toBeLessThan(resume);
    }
  });

  it("refuses a binary that is not absolute (never resolved through PATH)", () => {
    expect(() =>
      buildChefSpawn({
        chef: { ...chef, binaries: { git: "/usr/bin/git", claude: "claude" } },
        wake: 5,
        digest: "D",
      }),
    ).toThrow(/no absolute claude binary/);
  });

  describe("chef registry (C3a)", () => {
    const resultLine = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      result: "done",
      structured_output: { summary: "s", actions: [] },
    });
    const wakeDir = (wake: number) =>
      join(orch, "chefs", chef.id, "private", String(wake));

    it("has an entry exactly for the providers with caps.chef (claude, codex)", () => {
      expect(Object.keys(CHEF_PROVIDERS).sort()).toEqual(
        PROVIDER_NAMES.filter((p) => PROVIDERS[p].caps.chef).sort(),
      );
      expect(chefProviderNames()).toEqual(["claude", "codex"]);
    });

    it.each(["grok", "cursor", "constructor", "toString", "", "CLAUDE"])(
      "build, parse and finish throw USAGE for %j, never falling into the codex builder",
      (name) => {
        const bad = { ...chef, provider: name as Provider };
        expect(() =>
          buildChefSpawn({ chef: bad, wake: 41, digest: "D" }),
        ).toThrow(
          expect.objectContaining({
            code: "USAGE",
            message: expect.stringMatching(/cannot be a chef.*claude, codex/),
          }),
        );
        // The codex builder creates private/<wake>/ (schema, -o file).
        expect(existsSync(wakeDir(41))).toBe(false);
        expect(() => parseChefLine(name as Provider, resultLine, {})).toThrow(
          /cannot be a chef/,
        );
        const spec: ChefSpawnSpec = {
          provider: name as Provider,
          cmd: "/abs/bin/x",
          args: [],
          cwd: chefRoot,
          stdin: "",
          env: {},
        };
        expect(() => finishChefRun(spec, {}, 0)).toThrow(/cannot be a chef/);
      },
    );

    it("a provider whose caps.chef is false is refused even with a registry entry", () => {
      const caps = PROVIDERS.codex.caps;
      PROVIDERS.codex.caps = { ...caps, chef: false };
      try {
        const codexChef = { ...chef, provider: "codex" as const };
        expect(() =>
          buildChefSpawn({ chef: codexChef, wake: 42, digest: "D" }),
        ).toThrow(expect.objectContaining({ code: "USAGE" }));
        expect(existsSync(wakeDir(42))).toBe(false);
        expect(() => parseChefLine("codex", resultLine, {})).toThrow(
          /"codex" cannot be a chef/,
        );
        expect(chefProviderNames()).toEqual(["claude"]);
      } finally {
        PROVIDERS.codex.caps = caps;
      }
    });

    it("a missing binary for the chef's provider is a clear error", () => {
      expect(() =>
        buildChefSpawn({
          chef: {
            ...chef,
            provider: "codex",
            binaries: { git: "/usr/bin/git" },
          },
          wake: 43,
          digest: "D",
        }),
      ).toThrow(/no absolute codex binary in chef\.json/);
    });
  });

  it("chef env drops inherited GIT_* and session-linking CLAUDE_CODE_*, and sets the hardened git config", () => {
    const env = chefEnv("/orch/chefs/x/hooks", {
      PATH: "/bin",
      GIT_DIR: "/evil",
      GIT_EXTERNAL_DIFF: "/evil/diff",
      GIT_SSH_COMMAND: "/evil/ssh",
      GIT_CONFIG_PARAMETERS: "'core.fsmonitor'='/evil'",
      CLAUDECODE: "1",
      CLAUDE_CODE_RETRY_WATCHDOG: "1",
      CLAUDE_CODE_SESSION_ID: "parent",
      CLAUDE_CODE_MESSAGING_SOCKET: "/tmp/sock",
      CLAUDE_CODE_USE_BEDROCK: "1",
    });
    expect(env).toEqual({
      PATH: "/bin",
      CLAUDE_CODE_USE_BEDROCK: "1",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_COUNT: "2",
      GIT_CONFIG_KEY_0: "core.hooksPath",
      GIT_CONFIG_VALUE_0: "/orch/chefs/x/hooks",
      GIT_CONFIG_KEY_1: "core.fsmonitor",
      GIT_CONFIG_VALUE_1: "false",
    });
  });

  it.each(["claude", "codex"] as const)(
    "%s chef process gets that env with CF's empty hooks dir under chefs/<id>/",
    (provider) => {
      vi.stubEnv("GIT_DIR", "/evil");
      vi.stubEnv("GIT_SSH_COMMAND", "/evil/ssh");
      const { env } = buildChefSpawn({
        chef: { ...chef, provider },
        wake: 6,
        digest: "D",
      });
      expect(env.GIT_DIR).toBeUndefined();
      expect(env.GIT_SSH_COMMAND).toBeUndefined();
      expect(env.GIT_CONFIG_KEY_0).toBe("core.hooksPath");
      expect(env.GIT_CONFIG_VALUE_0).toBe(makeChefHooksDir(chef.id));
      expect(
        env.GIT_CONFIG_VALUE_0?.startsWith(join(orch, "chefs", chef.id) + "/"),
      ).toBe(true);
    },
  );

  it("claude result: structured_output → ok; schema retries exhausted or missing output → failed; usage limit → quota", () => {
    const spec = buildChefSpawn({ chef, wake: 7, digest: "D" });
    const run = (lines: object[], code: number) => {
      const acc: ChefStreamAcc = {};
      for (const l of lines) parseChefLine("claude", JSON.stringify(l), acc);
      return finishChefRun(spec, acc, code);
    };
    const out = { summary: "s", actions: [] };
    expect(
      run(
        [
          { type: "system", subtype: "init", session_id: SID },
          {
            type: "result",
            subtype: "success",
            is_error: false,
            session_id: SID,
            structured_output: out,
          },
        ],
        0,
      ),
    ).toEqual({ outcome: "ok", output: out, sessionId: SID });
    expect(
      run(
        [
          {
            type: "result",
            subtype: "error_max_structured_output_retries",
            is_error: true,
          },
        ],
        1,
      ),
    ).toMatchObject({ outcome: "failed" });
    expect(
      run(
        [{ type: "result", subtype: "success", is_error: false, result: "x" }],
        0,
      ),
    ).toMatchObject({
      outcome: "failed",
      error: expect.stringMatching(/structured_output/),
    });
    expect(
      run(
        [
          {
            type: "rate_limit_event",
            rate_limit_info: { status: "rejected", resetsAt: 1800000000 },
          },
          {
            type: "result",
            subtype: "success",
            is_error: true,
            result: "limit",
          },
        ],
        1,
      ),
    ).toMatchObject({ outcome: "quota", resetsAt: 1800000000 });
  });

  it.skipIf(process.platform === "win32")(
    `claudeVersionError runs the binary and refuses one older than 2.1.248`,
    () => {
      const fake = (name: string, version: string) => {
        const file = join(chefRoot, name);
        writeFileSync(file, `#!/bin/sh\necho "${version} (Claude Code)"\n`, {
          mode: 0o755,
        });
        return file;
      };
      const cwd = join(orch, "chefs", chef.id, "private");
      expect(claudeVersionError(fake("old", "2.1.247"), cwd)).toMatch(
        /2\.1\.248 or newer.*found 2\.1\.247/,
      );
      expect(claudeVersionError(fake("ok", "2.1.248"), cwd)).toBeUndefined();
      expect(claudeVersionError(join(chefRoot, "missing"), cwd)).toMatch(
        /found unknown/,
      );
      expect(existsSync(cwd)).toBe(true);
    },
  );
});

describe("notifyUser", () => {
  function recorder(err: Error | null = null) {
    const calls: { file: string; args: string[] }[] = [];
    const execFile: NotifyExecFile = (file, args, _opts, cb) => {
      calls.push({ file, args });
      cb(err);
    };
    return { calls, execFile };
  }

  it("passes message and title as argv after --, never inside the script", async () => {
    const { calls, execFile } = recorder();
    const message = '-e do shell script "touch /tmp/x"\u0007\nline2';
    const r = await notifyUser({
      title: "Chef\tpaused",
      message,
      enabled: true,
      execFile,
      platform: "darwin",
    });
    expect(r).toEqual({ sent: true });
    expect(calls).toHaveLength(1);
    const [{ file, args }] = calls;
    expect(file).toBe("/usr/bin/osascript");
    expect(args[0]).toBe("-e");
    expect(args[2]).toBe("--");
    expect(args.slice(3)).toEqual([
      '-e do shell script "touch /tmp/x" line2',
      "Chef paused",
    ]);
    expect(args[1]).not.toContain("touch");
    expect(args[1]).toContain("item 1 of argv");
  });

  it("does nothing when disabled or off darwin, and returns (never throws) an exec error", async () => {
    const { calls, execFile } = recorder(new Error("boom"));
    const base = { title: "t", message: "m", execFile };
    expect(
      await notifyUser({ ...base, enabled: false, platform: "darwin" }),
    ).toEqual({ sent: false });
    expect(
      await notifyUser({ ...base, enabled: true, platform: "linux" }),
    ).toEqual({ sent: false });
    expect(calls).toHaveLength(0);
    expect(
      await notifyUser({ ...base, enabled: true, platform: "darwin" }),
    ).toEqual({ sent: false, error: "boom" });
  });
});
