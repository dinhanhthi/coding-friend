import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance,
} from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock paths before importing prompt-utils
vi.mock("../paths.js", () => ({
  localConfigPath: vi.fn(),
  globalConfigPath: vi.fn(),
}));

// Mock log to suppress output
vi.mock("../log.js", () => ({
  log: {
    success: vi.fn(),
    warn: vi.fn(),
    dim: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock @inquirer/prompts
vi.mock("@inquirer/prompts", () => ({
  select: vi.fn(),
  confirm: vi.fn(),
  Separator: class Separator {},
}));

import {
  applyDocsDirChange,
  ensureDocsFolders,
  resolveScope,
} from "../prompt-utils.js";
import * as paths from "../paths.js";
import { log } from "../log.js";
import { select } from "@inquirer/prompts";

let projectDir: string;
let globalConfigDir: string;
let localConfigFile: string;
let globalConfigFile: string;
let originalCwd: string;

const localConfigPathMock = paths.localConfigPath as unknown as MockInstance;
const globalConfigPathMock = paths.globalConfigPath as unknown as MockInstance;

beforeEach(() => {
  originalCwd = process.cwd();
  projectDir = mkdtempSync(join(tmpdir(), "cf-test-project-"));
  globalConfigDir = mkdtempSync(join(tmpdir(), "cf-test-global-"));
  localConfigFile = join(projectDir, ".coding-friend", "config.json");
  globalConfigFile = join(globalConfigDir, "config.json");
  mkdirSync(join(projectDir, ".coding-friend"), { recursive: true });

  localConfigPathMock.mockReturnValue(localConfigFile);
  globalConfigPathMock.mockReturnValue(globalConfigFile);

  // Switch cwd so relative paths resolve inside projectDir
  process.chdir(projectDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(projectDir, { recursive: true, force: true });
  rmSync(globalConfigDir, { recursive: true, force: true });
  vi.clearAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────

function writeLocalConfig(data: object) {
  writeFileSync(localConfigFile, JSON.stringify(data), "utf-8");
}

function writeGlobalConfig(data: object) {
  writeFileSync(globalConfigFile, JSON.stringify(data), "utf-8");
}

function makeFolder(name: string): string {
  const p = join(projectDir, name);
  mkdirSync(p, { recursive: true });
  return p;
}

// ─── LOCAL scope ──────────────────────────────────────────────────────

describe("applyDocsDirChange — local scope", () => {
  it("renames old folder when old folder exists", () => {
    const oldDir = makeFolder("oldDocs");
    const newPath = join(projectDir, "newDocs");

    applyDocsDirChange("newDocs", "oldDocs", "local");

    expect(existsSync(oldDir)).toBe(false);
    expect(existsSync(newPath)).toBe(true);
  });

  it("warns and skips rename when new folder already exists", () => {
    makeFolder("oldDocs");
    makeFolder("newDocs");

    applyDocsDirChange("newDocs", "oldDocs", "local");

    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
    expect(existsSync(join(projectDir, "oldDocs"))).toBe(true);
    expect(existsSync(join(projectDir, "newDocs"))).toBe(true);
  });

  it("creates new folder when old folder does not exist", () => {
    const newPath = join(projectDir, "newDocs");

    applyDocsDirChange("newDocs", "oldDocs", "local");

    expect(existsSync(newPath)).toBe(true);
  });

  it("creates new folder when oldValue is undefined and folder doesn't exist", () => {
    const newPath = join(projectDir, "docs");

    applyDocsDirChange("docs", undefined, "local");

    expect(existsSync(newPath)).toBe(true);
  });

  it("does nothing when newValue equals oldValue", () => {
    makeFolder("docs");

    applyDocsDirChange("docs", "docs", "local");

    expect(existsSync(join(projectDir, "docs"))).toBe(true);
  });

  it("does not create folder when new folder already exists and oldValue is undefined", () => {
    makeFolder("docs");

    applyDocsDirChange("docs", undefined, "local");

    // folder already exists — no rename, no warn, still exists
    expect(existsSync(join(projectDir, "docs"))).toBe(true);
    expect(log.warn).not.toHaveBeenCalled();
  });
});

// ─── GLOBAL scope — local docsDir IS set ─────────────────────────────

describe("applyDocsDirChange — global scope, local docsDir is set", () => {
  it("skips filesystem changes when local config has docsDir", () => {
    writeLocalConfig({ docsDir: "myDocs" });
    makeFolder("myDocs");
    const newPath = join(projectDir, "newDocs");

    applyDocsDirChange("newDocs", "oldGlobalDocs", "global");

    expect(existsSync(newPath)).toBe(false);
    expect(existsSync(join(projectDir, "myDocs"))).toBe(true);
  });

  it("does not rename old global folder when local docsDir is set", () => {
    writeLocalConfig({ docsDir: "myDocs" });
    const oldGlobalDir = makeFolder("oldGlobalDocs");

    applyDocsDirChange("newDocs", "oldGlobalDocs", "global");

    expect(existsSync(oldGlobalDir)).toBe(true);
  });
});

// ─── GLOBAL scope — no local docsDir ─────────────────────────────────

describe("applyDocsDirChange — global scope, no local docsDir", () => {
  it("renames existing global folder when no local override", () => {
    writeGlobalConfig({ docsDir: "oldDocs" });
    const oldDir = makeFolder("oldDocs");
    const newPath = join(projectDir, "newDocs");

    applyDocsDirChange("newDocs", "oldDocs", "global");

    expect(existsSync(oldDir)).toBe(false);
    expect(existsSync(newPath)).toBe(true);
  });

  it("creates new folder when no local override and old global folder doesn't exist", () => {
    writeGlobalConfig({ docsDir: "oldDocs" });
    // oldDocs not created on disk
    const newPath = join(projectDir, "newDocs");

    applyDocsDirChange("newDocs", "oldDocs", "global");

    expect(existsSync(newPath)).toBe(true);
  });

  it("creates new folder when no local config at all", () => {
    // no local config file, no global config
    const newPath = join(projectDir, "docs");

    applyDocsDirChange("docs", undefined, "global");

    expect(existsSync(newPath)).toBe(true);
  });

  it("warns and skips when new folder already exists (no local override)", () => {
    writeGlobalConfig({ docsDir: "oldDocs" });
    makeFolder("oldDocs");
    makeFolder("newDocs");

    applyDocsDirChange("newDocs", "oldDocs", "global");

    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
    );
    expect(existsSync(join(projectDir, "oldDocs"))).toBe(true);
  });

  it("does nothing when newValue equals oldValue", () => {
    writeGlobalConfig({ docsDir: "docs" });
    makeFolder("docs");

    applyDocsDirChange("docs", "docs", "global");

    expect(existsSync(join(projectDir, "docs"))).toBe(true);
  });

  it("local config exists but has no docsDir field — treats as no local override", () => {
    writeLocalConfig({ language: "en" }); // has local config but no docsDir
    writeGlobalConfig({ docsDir: "oldDocs" });
    const oldDir = makeFolder("oldDocs");
    const newPath = join(projectDir, "newDocs");

    applyDocsDirChange("newDocs", "oldDocs", "global");

    expect(existsSync(oldDir)).toBe(false);
    expect(existsSync(newPath)).toBe(true);
  });
});

// ─── ensureDocsFolders ───────────────────────────────────────────────

describe("ensureDocsFolders", () => {
  const SUBFOLDERS = ["plans", "memory", "research", "learn", "sessions"];

  it("creates docs folder and all subfolders when nothing exists", () => {
    ensureDocsFolders("docs", SUBFOLDERS);

    expect(existsSync(join(projectDir, "docs"))).toBe(true);
    for (const sub of SUBFOLDERS) {
      expect(existsSync(join(projectDir, "docs", sub))).toBe(true);
    }
  });

  it("creates only missing subfolders when docs folder already exists", () => {
    makeFolder("docs");
    mkdirSync(join(projectDir, "docs", "memory"), { recursive: true });

    ensureDocsFolders("docs", SUBFOLDERS);

    for (const sub of SUBFOLDERS) {
      expect(existsSync(join(projectDir, "docs", sub))).toBe(true);
    }
  });

  it("does not fail when docs folder and all subfolders already exist", () => {
    makeFolder("docs");
    for (const sub of SUBFOLDERS) {
      mkdirSync(join(projectDir, "docs", sub), { recursive: true });
    }

    ensureDocsFolders("docs", SUBFOLDERS);

    for (const sub of SUBFOLDERS) {
      expect(existsSync(join(projectDir, "docs", sub))).toBe(true);
    }
  });
});

// ─── resolveScope ────────────────────────────────────────────────────

const mockSelect = vi.mocked(select);

describe("resolveScope", () => {
  let mockExit: MockInstance;

  beforeEach(() => {
    mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    mockExit.mockRestore();
  });

  it("returns 'user' when --user flag is set", async () => {
    const result = await resolveScope({ user: true });
    expect(result).toBe("user");
  });

  it("returns 'user' when --global flag is set", async () => {
    const result = await resolveScope({ global: true });
    expect(result).toBe("user");
  });

  it("returns 'project' when --project flag is set", async () => {
    const result = await resolveScope({ project: true });
    expect(result).toBe("project");
  });

  it("returns 'local' when --local flag is set", async () => {
    const result = await resolveScope({ local: true });
    expect(result).toBe("local");
  });

  it("exits with error when multiple scope flags are set", async () => {
    await resolveScope({ user: true, project: true });
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining("Only one scope flag"),
    );
  });

  it("allows --user and --global together (both map to user scope)", async () => {
    const result = await resolveScope({ user: true, global: true });
    expect(result).toBe("user");
    expect(mockExit).not.toHaveBeenCalled();
  });

  it("exits with error when --global and --local are both set", async () => {
    await resolveScope({ global: true, local: true });
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("prompts interactively when no flag is set and TTY is available", async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      writable: true,
    });

    mockSelect.mockResolvedValue("project" as never);

    const result = await resolveScope({});
    expect(result).toBe("project");
    expect(mockSelect).toHaveBeenCalled();

    Object.defineProperty(process.stdin, "isTTY", {
      value: originalIsTTY,
      writable: true,
    });
  });

  it("exits with error when no flag and not TTY", async () => {
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      writable: true,
    });

    await resolveScope({});
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining("--user"));

    Object.defineProperty(process.stdin, "isTTY", {
      value: originalIsTTY,
      writable: true,
    });
  });

  it("ignores flags that are false or undefined", async () => {
    const result = await resolveScope({
      user: false,
      global: undefined,
      project: true,
      local: false,
    });
    expect(result).toBe("project");
  });
});
