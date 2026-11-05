import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join, sep } from "path";

import { claudeProjectDirName } from "../../lib/paths.js";
import {
  sessionExportCommand,
  sessionListCommand,
  sessionLoadCommand,
  sessionSaveCommand,
  sessionShowCommand,
} from "../session.js";

const UUID = "11111111-2222-4333-8444-555555555555";
const BIG = "22222222-3333-4444-8555-666666666666";
const THREAD = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const ESCAPES = "33333333-4444-4555-8666-777777777777";
const LEGACY_ID = "44444444-5555-4666-8777-888888888888";

// Fake tokens, built by concatenation so no real-looking secret sits in the
// source.
const GH = "ghp_" + "Q".repeat(36);
const ANT = "sk-ant-api03-" + "y".repeat(24);
const PW = "pw" + "Z".repeat(20);
const AWS = "AKIA" + "B".repeat(16);
const SLACK = "xoxb-" + "C".repeat(12);
const OUTPUT_MARK = "TOOL-OUTPUT-BODY";

// Distinctive pieces of each token: a leaked head or tail matches one.
const LEAKS = ["ghp_Q", "QQQQQQ", "sk-ant", "yyyyyy", "pwZZ", "ZZZZZZ"];
const LEAKS_CUT = ["AKIA", "BBBBBB", "xoxb-", "CCCCCC"];

function jsonl(records: unknown[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

describe("session list|show|export --json", () => {
  let tmp: string;
  let home: string;
  let root: string;
  let origCwd: string;

  async function json(fn: () => Promise<void>) {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    try {
      await fn();
    } finally {
      vi.mocked(process.stdout.write).mockRestore();
    }
    expect(writes).toHaveLength(1);
    return { env: JSON.parse(writes[0]), raw: writes[0] };
  }

  function expectNoLeak(raw: string): void {
    for (const piece of [...LEAKS, ...LEAKS_CUT]) {
      expect(raw).not.toContain(piece);
    }
  }

  function claudeDir(): string {
    const dir = join(
      tmp,
      "claude",
      "projects",
      claudeProjectDirName(root).name,
    );
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  beforeEach(() => {
    process.exitCode = undefined;
    vi.spyOn(console, "error").mockImplementation(() => {});
    origCwd = process.cwd();
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "cf-sessionjson-")));
    home = join(tmp, "home");
    mkdirSync(home);
    vi.stubEnv("HOME", home);
    vi.stubEnv("CLAUDE_CONFIG_DIR", join(tmp, "claude"));
    vi.stubEnv("CODEX_HOME", join(tmp, "codex"));
    root = join(home, "proj");
    mkdirSync(root);

    const base = { cwd: root, version: "2.1.0", sessionId: UUID };
    // Token starts before the 120-char cut of the args summary and ends after.
    const command = "echo " + "a".repeat(92) + " " + AWS;
    writeFileSync(
      join(claudeDir(), `${UUID}.jsonl`),
      jsonl([
        {
          ...base,
          type: "user",
          timestamp: "2026-11-01T10:00:01.000Z",
          message: { role: "user", content: `deploy with ${GH} please` },
        },
        {
          ...base,
          type: "assistant",
          timestamp: "2026-11-01T10:00:02.000Z",
          message: {
            role: "assistant",
            content: [
              { type: "text", text: `Using ${ANT} now.` },
              {
                type: "tool_use",
                id: "t1",
                name: "Login",
                input: { user: "me", password: PW },
              },
              { type: "tool_use", id: "t2", name: "Bash", input: { command } },
            ],
          },
        },
        {
          ...base,
          type: "user",
          timestamp: "2026-11-01T10:00:03.000Z",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "t2",
                content: `${OUTPUT_MARK} token=${SLACK}`,
              },
            ],
          },
        },
      ]),
    );

    const day = join(tmp, "codex", "sessions", "2026", "11", "02");
    mkdirSync(day, { recursive: true });
    writeFileSync(
      join(day, `rollout-2026-11-02T10-00-00-${THREAD}.jsonl`),
      jsonl([
        {
          timestamp: "2026-11-02T10:00:00.000Z",
          type: "session_meta",
          payload: {
            id: THREAD,
            timestamp: "2026-11-02T10:00:00.000Z",
            cwd: root,
            cli_version: "0.50.0",
          },
        },
      ]),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.exitCode = undefined;
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("list merges Claude and Codex rows with redacted titles", async () => {
    const { env, raw } = await json(() => sessionListCommand({ json: true }));
    expect(env).toMatchObject({ ok: true, error: null });
    expect(env.data.project).toBeNull();
    expect(env.data.truncated).toBe(false);
    const refs = env.data.sessions.map((s: { ref: string }) => s.ref);
    expect(refs).toEqual(expect.arrayContaining([`claude:${UUID}`]));
    expect(refs).toEqual(expect.arrayContaining([`codex:${THREAD}`]));
    const claude = env.data.sessions.find(
      (s: { ref: string }) => s.ref === `claude:${UUID}`,
    );
    expect(claude.title).toContain("[REDACTED:github]");
    expectNoLeak(raw);
  });

  it("show redacts text and tool args, with and without tool output", async () => {
    const plain = await json(() =>
      sessionShowCommand(`claude:${UUID}`, { json: true }),
    );
    expect(plain.env).toMatchObject({ ok: true, error: null });
    expect(plain.env.data).toMatchObject({
      ref: `claude:${UUID}`,
      provider: "claude",
      offset: 0,
      nextOffset: null,
      truncated: false,
    });
    expect(plain.env.data.redactions.total).toBeGreaterThan(0);
    expect(plain.raw).not.toContain(OUTPUT_MARK);
    expectNoLeak(plain.raw);

    const withOutput = await json(() =>
      sessionShowCommand(`claude:${UUID}`, {
        json: true,
        includeToolOutput: true,
      }),
    );
    expect(withOutput.raw).toContain(OUTPUT_MARK);
    expectNoLeak(withOutput.raw);
  });

  it("export returns redacted Markdown, tool output only on request", async () => {
    const plain = await json(() =>
      sessionExportCommand(`claude:${UUID}`, { json: true }),
    );
    expect(plain.env).toMatchObject({ ok: true, error: null });
    const data = plain.env.data;
    expect(data).toMatchObject({
      ref: `claude:${UUID}`,
      truncated: false,
      filter: { name: null, status: "none" },
    });
    expect(data.bytes).toBe(Buffer.byteLength(data.markdown));
    expect(data.redactions.total).toBeGreaterThan(0);
    expect(data.markdown).toContain("- tool: Login");
    expect(data.markdown).not.toContain(OUTPUT_MARK);
    expectNoLeak(plain.raw);

    const withOutput = await json(() =>
      sessionExportCommand(`claude:${UUID}`, {
        json: true,
        includeToolOutput: true,
      }),
    );
    expect(withOutput.env.data.markdown).toContain(OUTPUT_MARK);
    expectNoLeak(withOutput.raw);
  });

  it("an invalid ref is INVALID_ARGS", async () => {
    // legacy: is never inferred from cwd, so it needs --project-dir.
    for (const ref of ["bogus", "claude:../x", "legacy:old-session"]) {
      const { env } = await json(() => sessionShowCommand(ref, { json: true }));
      expect(env).toMatchObject({
        ok: false,
        data: null,
        error: { code: "INVALID_ARGS" },
      });
      expect(process.exitCode).toBe(1);
    }
  });

  it("show pages a very large turn and stays under 8 MiB", async () => {
    const huge = "lorem ipsum ".repeat(180_000); // ~2 MiB
    writeFileSync(
      join(claudeDir(), `${BIG}.jsonl`),
      jsonl([
        {
          cwd: root,
          sessionId: BIG,
          type: "user",
          timestamp: "2026-11-01T11:00:00.000Z",
          message: { role: "user", content: huge },
        },
        {
          cwd: root,
          sessionId: BIG,
          type: "assistant",
          timestamp: "2026-11-01T11:00:01.000Z",
          message: { role: "assistant", content: "ok" },
        },
      ]),
    );
    const { env, raw } = await json(() =>
      sessionShowCommand(`claude:${BIG}`, { json: true, limit: "1" }),
    );
    expect(env.ok).toBe(true);
    expect(env.data).toMatchObject({
      truncated: true,
      nextOffset: 1,
      total: 2,
      limit: 1,
    });
    expect(Buffer.byteLength(raw)).toBeLessThan(8 * 1024 * 1024);
  });

  it("save writes under session.dir, never under docsDir", async () => {
    const { env } = await json(() =>
      sessionSaveCommand(undefined, {
        json: true,
        sessionId: UUID,
        projectDir: root,
        label: "my label",
      }),
    );
    expect(env).toMatchObject({ ok: true, error: null });
    const store = join(home, ".coding-friend", "sessions");
    expect(env.data).toMatchObject({
      ref: `saved:${env.data.folder}`,
      sessionId: UUID,
      label: "my label",
      verbatim: true,
    });
    expect(env.data.dir.startsWith(store + sep)).toBe(true);
    expect(env.data.dir.startsWith(join(root, "docs"))).toBe(false);
    expect(existsSync(join(root, "docs", "sessions"))).toBe(false);
    expect(existsSync(join(env.data.dir, "session.jsonl"))).toBe(true);
  });

  it("save ignores a project's local session.dir", async () => {
    const evil = join(tmp, "evil");
    mkdirSync(join(root, ".coding-friend"));
    writeFileSync(
      join(root, ".coding-friend", "config.json"),
      JSON.stringify({ session: { dir: evil } }),
    );
    const { env } = await json(() =>
      sessionSaveCommand(undefined, {
        json: true,
        sessionId: UUID,
        projectDir: root,
      }),
    );
    expect(env.ok).toBe(true);
    const store = join(home, ".coding-friend", "sessions");
    expect(env.data.dir.startsWith(store + sep)).toBe(true);
    expect(existsSync(evil)).toBe(false);
  });

  it("list --project-dir keeps only saved sessions of that project", async () => {
    const store = join(home, ".coding-friend", "sessions");
    const saved = (folder: string, projectPath: string) => {
      const dir = join(store, folder);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "session.jsonl"), "{}\n");
      writeFileSync(
        join(dir, "meta.json"),
        JSON.stringify({
          sessionId: LEGACY_ID,
          label: folder,
          projectPath,
          savedAt: "2026-10-01T10:05:00.000Z",
          machine: "box",
        }),
      );
    };
    saved("mine", join(root, "sub"));
    saved("theirs", join(home, "proj-other"));

    const refs = async (projectDir?: string) => {
      const { env } = await json(() =>
        sessionListCommand({ json: true, provider: "saved", projectDir }),
      );
      expect(env.ok).toBe(true);
      return env.data.sessions.map((s: { ref: string }) => s.ref);
    };
    expect(await refs(root)).toEqual(["saved:mine"]);
    expect((await refs()).sort()).toEqual(["saved:mine", "saved:theirs"]);
  });

  it("save --session-id from another cwd records the transcript's cwd", async () => {
    const other = join(tmp, "other");
    mkdirSync(other);
    process.chdir(other);
    const { env } = await json(() =>
      sessionSaveCommand(undefined, { json: true, sessionId: UUID }),
    );
    expect(env.ok).toBe(true);
    const meta = JSON.parse(
      readFileSync(join(env.data.dir, "meta.json"), "utf-8"),
    );
    expect(meta.projectPath).toBe(root);
  });

  it("save rejects a non-UUID --session-id before any write", async () => {
    const { env } = await json(() =>
      sessionSaveCommand(undefined, {
        json: true,
        sessionId: "../../x",
        label: "x",
      }),
    );
    expect(env).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
    expect(existsSync(join(home, ".coding-friend"))).toBe(false);
  });

  it("show reads a legacy: session of --project-dir, redacted", async () => {
    const folder = "old-session";
    const dir = join(root, "docs", "sessions", folder);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "session.jsonl"),
      jsonl([
        {
          cwd: root,
          sessionId: LEGACY_ID,
          type: "user",
          timestamp: "2026-10-01T10:00:00.000Z",
          message: { role: "user", content: `old run with ${GH}` },
        },
      ]),
    );
    writeFileSync(
      join(dir, "meta.json"),
      JSON.stringify({
        sessionId: LEGACY_ID,
        folderName: "../../elsewhere",
        label: `label ${ANT}`,
        projectPath: root,
        savedAt: "2026-10-01T10:05:00.000Z",
        machine: "box",
      }),
    );
    const { env, raw } = await json(() =>
      sessionShowCommand(`legacy:${folder}`, { json: true, projectDir: root }),
    );
    expect(env).toMatchObject({ ok: true, error: null });
    expect(env.data.ref).toBe(`legacy:${folder}`);
    expect(env.data.summary.source).toBe("legacy");
    expect(env.data.turns[0]).toMatchObject({ kind: "user" });
    expect(env.data.turns[0].text).toContain("[REDACTED:github]");
    expectNoLeak(raw);
  });

  it("export --out writes the full Markdown with mode 0600", async () => {
    const file = join(tmp, "export.md");
    process.chdir(tmp);
    const { env, raw } = await json(() =>
      sessionExportCommand(`claude:${UUID}`, {
        json: true,
        out: "export.md",
        projectDir: root,
      }),
    );
    expect(env).toMatchObject({ ok: true, error: null });
    expect(env.data).toMatchObject({ ref: `claude:${UUID}`, out: file });
    expect(env.data).not.toHaveProperty("markdown");
    expect(env.data.redactions.total).toBeGreaterThan(0);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(file).size).toBe(env.data.bytes);
    const text = readFileSync(file, "utf-8");
    expect(text).toContain("- tool: Login");
    expectNoLeak(text);
    expectNoLeak(raw);
  });

  it("export --out onto an existing file is CONFLICT, file unchanged", async () => {
    const file = join(tmp, "export.md");
    writeFileSync(file, "keep me\n");
    const before = readFileSync(file);
    const { env } = await json(() =>
      sessionExportCommand(`claude:${UUID}`, { json: true, out: file }),
    );
    expect(env).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  describe("load --json", () => {
    const FOLDER = "old-session";
    let dest: string;

    function projectsDirOf(p: string): string {
      return join(tmp, "claude", "projects", claudeProjectDirName(p).name);
    }

    beforeEach(() => {
      const dir = join(root, "docs", "sessions", FOLDER);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "session.jsonl"),
        jsonl([
          {
            cwd: root,
            sessionId: LEGACY_ID,
            type: "user",
            timestamp: "2026-10-01T10:00:00.000Z",
            message: { role: "user", content: "old run" },
          },
        ]),
      );
      writeFileSync(
        join(dir, "meta.json"),
        JSON.stringify({
          sessionId: LEGACY_ID,
          label: "old",
          projectPath: root,
          savedAt: "2026-10-01T10:05:00.000Z",
        }),
      );
      dest = join(tmp, "dest");
      mkdirSync(dest);
    });

    const load = (opts: Record<string, unknown>) =>
      json(() =>
        sessionLoadCommand(`legacy:${FOLDER}`, {
          json: true,
          projectDir: root,
          ...opts,
        }),
      );

    it("needs --yes and --target", async () => {
      const noYes = await load({ target: dest });
      expect(noYes.env).toMatchObject({
        ok: false,
        error: { code: "INTERACTIVE_REQUIRED" },
      });
      const noTarget = await load({ yes: true });
      expect(noTarget.env).toMatchObject({
        ok: false,
        error: { code: "INVALID_ARGS" },
      });
      expect(existsSync(projectsDirOf(dest))).toBe(false);
    });

    it("loads a legacy: session into the target's Claude dir, then CONFLICT", async () => {
      const path = join(projectsDirOf(dest), `${LEGACY_ID}.jsonl`);
      expect(existsSync(path)).toBe(false);
      // A relative --target resolves against the cwd before --project-dir.
      process.chdir(tmp);
      const first = await load({ yes: true, target: "dest" });
      expect(first.env).toMatchObject({ ok: true, error: null });
      expect(first.env.data).toMatchObject({
        ref: `legacy:${FOLDER}`,
        sessionId: LEGACY_ID,
        target: dest,
        path,
        resumeCommand: `cd '${dest}' && claude --resume ${LEGACY_ID}`,
      });
      expect(existsSync(path)).toBe(true);

      const second = await load({ yes: true, target: dest });
      expect(second.env).toMatchObject({
        ok: false,
        error: { code: "CONFLICT" },
      });
    });

    it("a symlinked --target loads under the realpath's dir", async () => {
      const link = join(tmp, "link");
      symlinkSync(dest, link);
      const { env } = await load({ yes: true, target: link });
      expect(env.ok).toBe(true);
      expect(env.data.path).toBe(
        join(projectsDirOf(dest), `${LEGACY_ID}.jsonl`),
      );
      expect(existsSync(env.data.path)).toBe(true);
      expect(existsSync(projectsDirOf(link))).toBe(false);
    });

    it("a missing --target is NOT_FOUND", async () => {
      const { env } = await load({ yes: true, target: join(tmp, "nope") });
      expect(env).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    });
  });

  it("human show strips terminal escapes on a TTY, keeps newlines", async () => {
    const evil =
      "first line\x1b]52;c;" + "Zm9v" + "\x07\nsecond\x1b[2J line\x9b";
    writeFileSync(
      join(claudeDir(), `${ESCAPES}.jsonl`),
      jsonl([
        {
          cwd: root,
          sessionId: ESCAPES,
          type: "user",
          timestamp: "2026-11-01T12:00:00.000Z",
          message: { role: "user", content: evil },
        },
      ]),
    );
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    });
    const isTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdout, "isTTY", {
      value: true,
      configurable: true,
    });
    try {
      await sessionShowCommand(`claude:${ESCAPES}`, {});
    } finally {
      if (isTTY) Object.defineProperty(process.stdout, "isTTY", isTTY);
      else delete (process.stdout as { isTTY?: boolean }).isTTY;
    }
    const out = lines.join("\n");
    expect(out).not.toContain("\x1b]52");
    expect(out).not.toContain("\x1b[2J");
    expect(out).not.toContain("\x9b");
    expect(out).toContain("first line\nsecond line");
  });
});
