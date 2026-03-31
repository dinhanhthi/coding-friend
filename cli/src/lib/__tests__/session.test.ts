import { describe, it, expect, vi, beforeEach } from "vitest";
import { homedir } from "os";
import { join } from "path";

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    copyFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

vi.mock("../json.js", () => ({
  readJson: vi.fn(),
  writeJson: vi.fn(),
}));

import {
  readdirSync,
  statSync,
  copyFileSync,
  mkdirSync,
  existsSync,
  readFileSync,
} from "fs";
import { readJson, writeJson } from "../json.js";
import {
  findLatestSession,
  listSyncedSessions,
  saveSession,
  loadSession,
  buildPreviewText,
  remapProjectPath,
  slugifyLabel,
} from "../session.js";

const mockReaddirSync = vi.mocked(readdirSync);
const mockStatSync = vi.mocked(statSync);
const mockCopyFileSync = vi.mocked(copyFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReadJson = vi.mocked(readJson);
const mockWriteJson = vi.mocked(writeJson);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findLatestSession", () => {
  it("returns the path of the most recently modified JSONL file", () => {
    mockReaddirSync.mockReturnValue(["aaa.jsonl", "bbb.jsonl"] as never);
    mockStatSync.mockImplementation((p) => {
      const path = p as string;
      return {
        mtimeMs: path.includes("aaa") ? 1000 : 2000,
        isFile: () => true,
      } as never;
    });
    mockExistsSync.mockReturnValue(true);

    const result = findLatestSession("/Users/alice/git/foo");
    expect(result).toContain("bbb.jsonl");
  });

  it("returns null if project session dir does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const result = findLatestSession("/Users/alice/git/foo");
    expect(result).toBeNull();
  });

  it("returns null if no JSONL files found", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([] as never);
    const result = findLatestSession("/Users/alice/git/foo");
    expect(result).toBeNull();
  });

  it("skips agent-*.jsonl files", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      "agent-abc.jsonl",
      "real-session.jsonl",
    ] as never);
    mockStatSync.mockReturnValue({
      mtimeMs: 1000,
      isFile: () => true,
    } as never);

    const result = findLatestSession("/Users/alice/git/foo");
    expect(result).toContain("real-session.jsonl");
  });
});

describe("buildPreviewText", () => {
  it("extracts first human message text from JSONL", () => {
    const line1 = JSON.stringify({
      type: "user",
      message: { role: "user", content: "Hello world" },
    });
    const line2 = JSON.stringify({
      type: "assistant",
      message: { role: "assistant", content: "Hi there" },
    });
    mockReadFileSync.mockReturnValue(`${line1}\n${line2}\n` as never);

    const result = buildPreviewText("/tmp/fake.jsonl");
    expect(result).toContain("Hello world");
  });

  it("returns fallback string if file is unreadable", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const result = buildPreviewText("/tmp/nonexistent.jsonl");
    expect(result).toBe("(preview unavailable)");
  });

  it("returns fallback if no parseable user message found", () => {
    mockReadFileSync.mockReturnValue(
      '{"type":"progress","data":{}}\n{"type":"file-history-snapshot"}\n' as never,
    );
    const result = buildPreviewText("/tmp/fake.jsonl");
    expect(result).toBe("(preview unavailable)");
  });
});

describe("listSyncedSessions", () => {
  it("returns sessions sorted by savedAt descending with folderName", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["session-a", "session-b"] as never);
    mockStatSync.mockReturnValue({ isDirectory: () => true } as never);
    mockReadJson.mockImplementation((p) => {
      const path = p as string;
      if (path.includes("session-a")) {
        return {
          sessionId: "uuid-a",
          folderName: "session-a",
          label: "Session A",
          projectPath: "/Users/alice/git/foo",
          savedAt: "2026-01-01T00:00:00Z",
          machine: "machineA",
          previewText: "hello",
        };
      }
      if (path.includes("session-b")) {
        return {
          sessionId: "uuid-b",
          folderName: "session-b",
          label: "Session B",
          projectPath: "/Users/alice/git/bar",
          savedAt: "2026-03-01T00:00:00Z",
          machine: "machineA",
          previewText: "world",
        };
      }
      return null;
    });

    const result = listSyncedSessions("/tmp/sync");
    expect(result[0].sessionId).toBe("uuid-b");
    expect(result[0].folderName).toBe("session-b");
    expect(result[1].sessionId).toBe("uuid-a");
    expect(result[1].folderName).toBe("session-a");
  });

  it("populates folderName from directory name when missing in meta", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["old-uuid-folder"] as never);
    mockStatSync.mockReturnValue({ isDirectory: () => true } as never);
    mockReadJson.mockReturnValue({
      sessionId: "old-uuid-folder",
      label: "Old Session",
      projectPath: "/Users/alice/git/foo",
      savedAt: "2026-01-01T00:00:00Z",
      machine: "machineA",
      previewText: "hello",
    });

    const result = listSyncedSessions("/tmp/sync");
    expect(result[0].folderName).toBe("old-uuid-folder");
  });

  it("returns empty array if sync dir does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const result = listSyncedSessions("/tmp/nonexistent");
    expect(result).toEqual([]);
  });

  it("skips entries with missing meta.json", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["sess-broken"] as never);
    mockStatSync.mockReturnValue({ isDirectory: () => true } as never);
    mockReadJson.mockReturnValue(null);

    const result = listSyncedSessions("/tmp/sync");
    expect(result).toEqual([]);
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
  it("uses slugified label as folder name", () => {
    mockExistsSync.mockReturnValue(false);

    const folderName = saveSession({
      jsonlPath: "/Users/alice/.claude/projects/-Users-alice-git-foo/abc.jsonl",
      sessionId: "abc",
      label: "My label",
      projectPath: "/Users/alice/git/foo",
      syncDir: "/tmp/sync",
      previewText: "hello world",
    });

    expect(folderName).toBe("my-label");
    expect(mockMkdirSync).toHaveBeenCalledWith(
      join("/tmp/sync", "sessions", "my-label"),
      { recursive: true },
    );
    expect(mockCopyFileSync).toHaveBeenCalledWith(
      "/Users/alice/.claude/projects/-Users-alice-git-foo/abc.jsonl",
      join("/tmp/sync", "sessions", "my-label", "session.jsonl"),
    );
    expect(mockWriteJson).toHaveBeenCalledWith(
      join("/tmp/sync", "sessions", "my-label", "meta.json"),
      expect.objectContaining({
        sessionId: "abc",
        label: "My label",
        folderName: "my-label",
        projectPath: "/Users/alice/git/foo",
        previewText: "hello world",
      }),
    );
  });

  it("appends numeric suffix when folder already exists", () => {
    mockExistsSync.mockImplementation((p) => {
      const path = p as string;
      // First slug "my-label" exists, "my-label-2" does not
      if (path.endsWith("my-label") && !path.endsWith("my-label-2"))
        return true;
      return false;
    });

    const folderName = saveSession({
      jsonlPath: "/Users/alice/.claude/projects/-Users-alice-git-foo/abc.jsonl",
      sessionId: "abc",
      label: "My label",
      projectPath: "/Users/alice/git/foo",
      syncDir: "/tmp/sync",
      previewText: "hello world",
    });

    expect(folderName).toBe("my-label-2");
  });
});

describe("loadSession", () => {
  it("uses folderName to locate session in sync folder", () => {
    mockExistsSync.mockReturnValue(true);

    const meta = {
      sessionId: "abc",
      folderName: "my-test-session",
      label: "test",
      projectPath: "/Users/alice/git/foo",
      savedAt: "2026-01-01T00:00:00Z",
      machine: "machineA",
      previewText: "hello",
    };

    loadSession(meta, "/Users/bob/git/foo", "/tmp/sync");

    const expectedEncodedPath = "-Users-bob-git-foo";
    const expectedDest = join(
      homedir(),
      ".claude",
      "projects",
      expectedEncodedPath,
      "abc.jsonl",
    );

    expect(mockCopyFileSync).toHaveBeenCalledWith(
      join("/tmp/sync", "sessions", "my-test-session", "session.jsonl"),
      expectedDest,
    );
  });

  it("falls back to sessionId when folderName is missing (backward compat)", () => {
    mockExistsSync.mockReturnValue(true);

    const meta = {
      sessionId: "abc",
      label: "test",
      projectPath: "/Users/alice/git/foo",
      savedAt: "2026-01-01T00:00:00Z",
      machine: "machineA",
      previewText: "hello",
    };

    loadSession(meta, "/Users/bob/git/foo", "/tmp/sync");

    expect(mockCopyFileSync).toHaveBeenCalledWith(
      join("/tmp/sync", "sessions", "abc", "session.jsonl"),
      expect.any(String),
    );
  });
});
