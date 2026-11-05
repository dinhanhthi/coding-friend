import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "fs";
import { homedir, tmpdir } from "os";
import { join } from "path";
import { claudeProjectDirName, encodeProjectPath } from "../paths.js";
import {
  listProjectTranscripts,
  listSavedSessions,
  saveSession,
  loadSession,
  buildPreviewText,
  remapProjectPath,
  slugifyLabel,
} from "../session.js";

const UUID = "0b5c2f9e-3a4d-4e6f-8a1b-2c3d4e5f6a7b";

let tmp: string;
let claude: string;
let store: string;
let project: string;
const savedEnv = process.env.CLAUDE_CONFIG_DIR;

beforeEach(() => {
  // Realpath'd: Claude names project dirs after the canonical cwd.
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "cf-session-")));
  claude = join(tmp, "claude");
  store = join(tmp, "store");
  project = join(tmp, "project");
  mkdirSync(join(claude, "projects"), { recursive: true });
  mkdirSync(project);
  process.env.CLAUDE_CONFIG_DIR = claude;
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = savedEnv;
  rmSync(tmp, { recursive: true, force: true });
});

function write(path: string, content: string): string {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return path;
}

function claudeDir(path: string): string {
  return join(claude, "projects", claudeProjectDirName(path).name);
}

function transcript(cwd: string): string {
  return (
    JSON.stringify({
      type: "user",
      cwd,
      timestamp: "2026-01-01T00:00:00Z",
      message: { role: "user", content: "Hello world" },
    }) + "\n"
  );
}

/** A saved session folder `<store>/<folder>/` with meta.json and session.jsonl. */
function savedFolder(
  folder: string,
  meta: Record<string, unknown>,
  root = store,
): string {
  const dir = join(root, folder);
  write(join(dir, "meta.json"), JSON.stringify(meta));
  write(join(dir, "session.jsonl"), transcript("/Users/alice/git/foo"));
  return dir;
}

describe("listProjectTranscripts", () => {
  it("lists a project's transcripts newest first, skipping agent-* and non-UUID files", () => {
    // A dotted path: the current naming rule turns "." into "-" too.
    const cwd = join(tmp, "my.app");
    const dir = claudeDir(cwd);
    const older = write(
      join(dir, "aaaaaaaa-1111-4111-8111-111111111111.jsonl"),
      "{}\n",
    );
    const newer = write(
      join(dir, "bbbbbbbb-2222-4222-8222-222222222222.jsonl"),
      "{}\n",
    );
    write(join(dir, "agent-ccc.jsonl"), "{}\n");
    write(join(dir, "notes.jsonl"), "{}\n");
    utimesSync(older, 1000, 1000);
    utimesSync(newer, 2000, 2000);

    const result = listProjectTranscripts(cwd);
    expect(result.map((t) => t.path)).toEqual([newer, older]);
    expect(result[0].mtime).toBeGreaterThan(result[1].mtime);
  });

  it("returns an empty list when the project has no Claude dir", () => {
    expect(listProjectTranscripts(join(tmp, "nothing"))).toEqual([]);
  });
});

describe("buildPreviewText", () => {
  it("extracts first human message text from JSONL", () => {
    const p = write(
      join(tmp, "a.jsonl"),
      transcript(project) +
        JSON.stringify({
          type: "assistant",
          message: { role: "assistant", content: "Hi there" },
        }) +
        "\n",
    );
    expect(buildPreviewText(p)).toContain("Hello world");
  });

  it("returns fallback string if file is unreadable", () => {
    expect(buildPreviewText(join(tmp, "missing.jsonl"))).toBe(
      "(preview unavailable)",
    );
  });

  it("returns fallback if no parseable user message found", () => {
    const p = write(
      join(tmp, "b.jsonl"),
      '{"type":"progress","data":{}}\n{"type":"file-history-snapshot"}\n',
    );
    expect(buildPreviewText(p)).toBe("(preview unavailable)");
  });
});

describe("listSavedSessions", () => {
  it("returns sessions sorted by savedAt descending", () => {
    savedFolder("session-a", {
      sessionId: UUID,
      label: "Session A",
      savedAt: "2026-01-01T00:00:00Z",
    });
    savedFolder("session-b", {
      sessionId: UUID,
      label: "Session B",
      savedAt: "2026-03-01T00:00:00Z",
    });

    const result = listSavedSessions(store, "saved");
    expect(result.map((s) => s.folder)).toEqual(["session-b", "session-a"]);
    expect(result[0].meta?.label).toBe("Session B");
    expect(result[0].source).toBe("saved");
  });

  it("uses the folder name on disk, never meta.folderName", () => {
    savedFolder("real-folder", {
      sessionId: UUID,
      folderName: "../../elsewhere",
      label: "Old Session",
      savedAt: "2026-01-01T00:00:00Z",
    });

    const result = listSavedSessions(store, "legacy");
    expect(result[0].folder).toBe("real-folder");
  });

  it("returns empty array if the store does not exist", () => {
    expect(listSavedSessions(join(tmp, "nonexistent"), "saved")).toEqual([]);
  });

  it("skips entries with missing meta.json", () => {
    write(join(store, "sess-broken", "session.jsonl"), "{}\n");
    expect(listSavedSessions(store, "saved")).toEqual([]);
  });
});

describe("remapProjectPath", () => {
  it("replaces home prefix with current home when different", () => {
    const currentHome = homedir();
    const result = remapProjectPath("/Users/alice/git/foo", currentHome);
    if ("/Users/alice" !== currentHome) {
      expect(result).toBe(join(currentHome, "git", "foo"));
    } else {
      expect(result).toBe("/Users/alice/git/foo");
    }
  });

  it("returns path unchanged when home is the same", () => {
    const result = remapProjectPath(join(homedir(), "git", "foo"), homedir());
    expect(result).toBe(join(homedir(), "git", "foo"));
  });
});

describe("slugifyLabel", () => {
  it("converts spaces to dashes and lowercases", () => {
    expect(slugifyLabel("My Session Label")).toBe("my-session-label");
  });

  it("removes special characters", () => {
    expect(slugifyLabel("fix: bug #123!")).toBe("fix-bug-123");
  });

  it("collapses multiple dashes", () => {
    expect(slugifyLabel("foo---bar")).toBe("foo-bar");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugifyLabel("--hello--")).toBe("hello");
  });

  it("falls back to 'session' for empty result", () => {
    expect(slugifyLabel("!!!")).toBe("session");
    expect(slugifyLabel("")).toBe("session");
  });

  it("preserves already-slugified labels", () => {
    expect(slugifyLabel("fix-mistral-429")).toBe("fix-mistral-429");
  });

  it("truncates very long labels to 100 chars", () => {
    const long = "a".repeat(300);
    const result = slugifyLabel(long);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result).toBe("a".repeat(100));
  });

  it("trims trailing dash after truncation", () => {
    // 99 a's + space + long tail → slug is "a...a-b..." truncated at 100
    const label = "a".repeat(99) + " " + "b".repeat(50);
    const result = slugifyLabel(label);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result).not.toMatch(/-$/);
  });

  it("returns fallback for all-unicode input", () => {
    expect(slugifyLabel("会议笔记")).toBe("session");
  });
});

describe("saveSession", () => {
  function liveTranscript(): string {
    return write(
      join(claudeDir(project), `${UUID}.jsonl`),
      transcript(project),
    );
  }

  it("writes session.jsonl and meta.json into <storeRoot>/<label-slug>/", () => {
    const jsonlPath = liveTranscript();

    const r = saveSession({
      jsonlPath,
      sessionId: UUID,
      label: "My label",
      storeRoot: store,
      projectDir: join(tmp, "fallback"),
      previewText: "hello world",
    });

    const dir = join(store, "my-label");
    expect(r.folder).toBe("my-label");
    expect(r.dir).toBe(dir);
    expect(r.warning).toMatch(/not redacted/);
    expect(readFileSync(join(dir, "session.jsonl"), "utf-8")).toBe(
      readFileSync(jsonlPath, "utf-8"),
    );
    const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf-8"));
    expect(meta).toMatchObject({
      sessionId: UUID,
      provider: "claude",
      label: "My label",
      // From the transcript head, not the projectDir fallback.
      projectPath: project,
      bytes: r.bytes,
      previewText: "hello world",
    });
    expect(r.bytes).toBeGreaterThan(0);
  });

  it("appends numeric suffix when folder already exists", () => {
    mkdirSync(join(store, "my-label"), { recursive: true });

    const r = saveSession({
      jsonlPath: liveTranscript(),
      sessionId: UUID,
      label: "My label",
      storeRoot: store,
      previewText: "hello world",
    });

    expect(r.folder).toBe("my-label-2");
  });

  it("copies only subagents, tool-results and mcp-tasks of the sibling folder", () => {
    const jsonlPath = liveTranscript();
    const sibling = join(claudeDir(project), UUID);
    write(join(sibling, "subagents", "agent-1.jsonl"), "{}\n");
    write(join(sibling, "tool-results", "r.txt"), "out");
    write(join(sibling, "other", "secret.txt"), "no");
    write(join(tmp, "outside.txt"), "no");
    symlinkSync(join(tmp, "outside.txt"), join(sibling, "subagents", "link"));

    const r = saveSession({
      jsonlPath,
      sessionId: UUID,
      label: "x",
      storeRoot: store,
      previewText: "",
    });

    const dest = join(r.dir, "session");
    expect(existsSync(join(dest, "subagents", "agent-1.jsonl"))).toBe(true);
    expect(existsSync(join(dest, "tool-results", "r.txt"))).toBe(true);
    expect(existsSync(join(dest, "other"))).toBe(false);
    expect(existsSync(join(dest, "subagents", "link"))).toBe(false);
  });

  it("skips the session folder copy when it does not exist", () => {
    const r = saveSession({
      jsonlPath: liveTranscript(),
      sessionId: UUID,
      label: "x",
      storeRoot: store,
      previewText: "",
    });

    expect(existsSync(join(r.dir, "session"))).toBe(false);
  });
});

describe("loadSession", () => {
  const meta = { sessionId: UUID, label: "test", savedAt: "2026-01-01" };

  function destJsonl(): string {
    return join(claudeDir(project), `${UUID}.jsonl`);
  }

  it("copies <folder>/session.jsonl into the target's Claude dir", () => {
    // meta.folderName is ignored: the caller's folder is the identity.
    const src = savedFolder("my-test-session", {
      ...meta,
      folderName: "elsewhere",
    });

    const r = loadSession({
      storeRoot: store,
      folder: "my-test-session",
      target: project,
    });

    expect(r.sessionId).toBe(UUID);
    expect(r.path).toBe(destJsonl());
    expect(readFileSync(destJsonl(), "utf-8")).toBe(
      readFileSync(join(src, "session.jsonl"), "utf-8"),
    );
  });

  it("restores the saved session folder next to the JSONL, skipping symlinks", () => {
    const src = savedFolder("s", meta);
    write(join(src, "session", "subagents", "a.jsonl"), "{}\n");
    write(join(tmp, "outside.txt"), "no");
    symlinkSync(
      join(tmp, "outside.txt"),
      join(src, "session", "subagents", "l"),
    );

    loadSession({ storeRoot: store, folder: "s", target: project });

    const restored = join(claudeDir(project), UUID, "subagents");
    expect(existsSync(join(restored, "a.jsonl"))).toBe(true);
    expect(existsSync(join(restored, "l"))).toBe(false);
  });

  it("skips the session folder restore for saves without it", () => {
    savedFolder("s", meta);

    loadSession({ storeRoot: store, folder: "s", target: project });

    expect(existsSync(destJsonl())).toBe(true);
    expect(existsSync(join(claudeDir(project), UUID))).toBe(false);
  });

  it("refuses to overwrite an existing transcript unless force", () => {
    savedFolder("s", meta);
    write(destJsonl(), "local\n");

    expect(() =>
      loadSession({ storeRoot: store, folder: "s", target: project }),
    ).toThrow(expect.objectContaining({ code: "CONFLICT" }));
    expect(readFileSync(destJsonl(), "utf-8")).toBe("local\n");

    loadSession({
      storeRoot: store,
      folder: "s",
      target: project,
      force: true,
    });
    expect(readFileSync(destJsonl(), "utf-8")).not.toBe("local\n");
  });

  it.each(["../../..", "--dangerously-skip-permissions"])(
    "refuses a non-UUID sessionId (%s) and writes nothing",
    (sessionId) => {
      savedFolder("s", { ...meta, sessionId });

      expect(() =>
        loadSession({ storeRoot: store, folder: "s", target: project }),
      ).toThrow(expect.objectContaining({ code: "INVALID_VALUE" }));
      expect(existsSync(claudeDir(project))).toBe(false);
      expect(
        existsSync(join(claude, "projects", encodeProjectPath(project))),
      ).toBe(false);
    },
  );

  it("throws when the folder escapes the store", () => {
    expect(() =>
      loadSession({ storeRoot: store, folder: "..", target: project }),
    ).toThrow(/folder/);
    expect(() =>
      loadSession({
        storeRoot: join(store, "x"),
        folder: "../s",
        target: project,
      }),
    ).toThrow(/folder/);
    expect(existsSync(claudeDir(project))).toBe(false);
  });

  it("throws and copies nothing when session.jsonl is a symlink", () => {
    const src = join(store, "s");
    write(join(src, "meta.json"), JSON.stringify(meta));
    write(join(tmp, "secret.jsonl"), "secret\n");
    symlinkSync(join(tmp, "secret.jsonl"), join(src, "session.jsonl"));

    expect(() =>
      loadSession({ storeRoot: store, folder: "s", target: project }),
    ).toThrow(/symlink/);
    expect(existsSync(claudeDir(project))).toBe(false);
  });
});
