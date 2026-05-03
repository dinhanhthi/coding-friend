import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAreSqliteDepsAvailable = vi.fn();
const mockRmSync = vi.fn();
const mockExistsSync = vi.fn();

// Instance mock fns — recreated per instance so resetAllMocks doesn't wipe them
const mockRebuild = vi.fn();
const mockStats = vi.fn();
const mockClose = vi.fn();
const mockIsVecEnabled = vi.fn();
const mockIsRebuildNeeded = vi.fn();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockSqliteBackend = vi.fn(function (this: any) {
  this.rebuild = (...args: unknown[]) => mockRebuild(...args);
  this.stats = (...args: unknown[]) => mockStats(...args);
  this.close = (...args: unknown[]) => mockClose(...args);
  this.isVecEnabled = (...args: unknown[]) => mockIsVecEnabled(...args);
  this.isRebuildNeeded = (...args: unknown[]) => mockIsRebuildNeeded(...args);
});

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    rmSync: (...args: unknown[]) => mockRmSync(...args),
  };
});

vi.mock("../../lib/config.js", () => ({
  resolveMemoryDir: vi.fn(() => "/fake/docs/memory"),
  loadConfig: vi.fn(() => ({})),
}));

vi.mock("../../lib/lib-path.js", () => ({
  getLibPath: vi.fn(() => "/fake/cf-memory"),
}));

vi.mock("../../lib/exec.js", () => ({
  run: vi.fn(() => ({ exitCode: 0, stdout: "" })),
  runWithStderr: vi.fn(() => ({ exitCode: 0, stdout: "", stderr: "" })),
}));

vi.mock("../../lib/log.js", () => ({
  log: {
    info: vi.fn(),
    step: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    dim: vi.fn(),
  },
}));

vi.mock("../../lib/memory-prompts.js", () => ({
  memoryConfigMenu: vi.fn(),
  getMemoryMcpStatus: vi.fn(() => ({ configured: false, scope: null })),
  writeMemoryMcpEntry: vi.fn(),
}));

vi.mock("../../lib/json.js", () => ({
  readJson: vi.fn(() => ({})),
  mergeJson: vi.fn(),
}));

vi.mock("../../lib/paths.js", () => ({
  globalConfigPath: vi.fn(() => "/fake/global-config.json"),
  localConfigPath: vi.fn(() => "/fake/local-config.json"),
}));

vi.mock("../../lib/prompt-utils.js", () => ({
  showConfigHint: vi.fn(),
}));

vi.mock("../../lib/mcp-state.js", () => ({
  warnStaleMcpJson: vi.fn(),
}));

vi.mock("../../lib/mcp-health.js", () => ({
  checkMemoryMcpHealth: vi.fn(),
  printHealthSection: vi.fn(),
}));

vi.mock("chalk", () => {
  const identity = (s: string) => s;
  const handler: ProxyHandler<typeof identity> = {
    get: () => new Proxy(identity, handler),
    apply: (_t, _this, args) => args[0],
  };
  return { default: new Proxy(identity, handler) };
});

vi.mock("/fake/cf-memory/dist/lib/lazy-install.js", () => ({
  areSqliteDepsAvailable: (...args: unknown[]) =>
    mockAreSqliteDepsAvailable(...args),
}));

vi.mock("/fake/cf-memory/dist/backends/sqlite/index.js", () => ({
  SqliteBackend: MockSqliteBackend,
}));

import { memoryRebuildCommand } from "../memory.js";
import { log } from "../../lib/log.js";

const mockLog = vi.mocked(log);

function makeCorruptError(code: string, message?: string) {
  const err = new Error(message ?? `SqliteError: ${code}`) as Error & {
    code: string;
  };
  err.code = code;
  return err;
}

beforeEach(() => {
  vi.resetAllMocks();
  // Restore MockSqliteBackend constructor implementation after resetAllMocks wipes it
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MockSqliteBackend.mockImplementation(function (this: any) {
    this.rebuild = (...args: unknown[]) => mockRebuild(...args);
    this.stats = (...args: unknown[]) => mockStats(...args);
    this.close = (...args: unknown[]) => mockClose(...args);
    this.isVecEnabled = (...args: unknown[]) => mockIsVecEnabled(...args);
    this.isRebuildNeeded = (...args: unknown[]) => mockIsRebuildNeeded(...args);
  });
  // Default: SQLite deps available, existsSync returns true for cf-memory dist/node_modules
  mockAreSqliteDepsAvailable.mockReturnValue(true);
  mockExistsSync.mockImplementation((p: unknown) => {
    const path = String(p);
    return (
      path.includes("cf-memory/node_modules") || path.includes("cf-memory/dist")
    );
  });
  mockStats.mockResolvedValue({ total: 5 });
  mockClose.mockResolvedValue(undefined);
  mockIsVecEnabled.mockReturnValue(false);
  mockIsRebuildNeeded.mockReturnValue(true);
});

describe("memoryRebuildCommand — happy path", () => {
  it("rebuilds and reports count on success", async () => {
    mockRebuild.mockResolvedValue(undefined);
    mockStats.mockResolvedValue({ total: 42 });

    await memoryRebuildCommand();

    expect(mockLog.success).toHaveBeenCalledWith(expect.stringContaining("42"));
    expect(mockClose).toHaveBeenCalled();
  });
});

describe("memoryRebuildCommand — SQLITE_CORRUPT recovery", () => {
  it("deletes DB files and retries on SQLITE_CORRUPT", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (
        path.includes("cf-memory/node_modules") ||
        path.includes("cf-memory/dist")
      )
        return true;
      if (path.includes("db.sqlite")) return true;
      return false;
    });

    mockRebuild
      .mockRejectedValueOnce(makeCorruptError("SQLITE_CORRUPT"))
      .mockResolvedValueOnce(undefined);

    await memoryRebuildCommand();

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("corrupt"),
    );
    // All three WAL-mode files must be deleted
    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining("db.sqlite"),
      { force: true },
    );
    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining("db.sqlite-shm"),
      { force: true },
    );
    expect(mockRmSync).toHaveBeenCalledWith(
      expect.stringContaining("db.sqlite-wal"),
      { force: true },
    );
    expect(mockRebuild).toHaveBeenCalledTimes(2);
    expect(mockLog.success).toHaveBeenCalled();
  });

  it("deletes DB files and retries on SQLITE_IOERR_SHORT_READ", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      return (
        path.includes("cf-memory/node_modules") ||
        path.includes("cf-memory/dist") ||
        path.includes("db.sqlite")
      );
    });

    mockRebuild
      .mockRejectedValueOnce(makeCorruptError("SQLITE_IOERR_SHORT_READ"))
      .mockResolvedValueOnce(undefined);

    await memoryRebuildCommand();

    expect(mockRebuild).toHaveBeenCalledTimes(2);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("corrupt"),
    );
  });

  it("recovers when message contains 'database disk image is malformed'", async () => {
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      return (
        path.includes("cf-memory/node_modules") ||
        path.includes("cf-memory/dist") ||
        path.includes("db.sqlite")
      );
    });

    const err = new Error("database disk image is malformed");
    mockRebuild.mockRejectedValueOnce(err).mockResolvedValueOnce(undefined);

    await memoryRebuildCommand();

    expect(mockRebuild).toHaveBeenCalledTimes(2);
  });

  it("does not delete files when getDbPath returns null (DB already absent)", async () => {
    // existsSync returns false for db.sqlite path → getDbPath returns null
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      return (
        path.includes("cf-memory/node_modules") ||
        path.includes("cf-memory/dist")
      );
    });

    mockRebuild
      .mockRejectedValueOnce(makeCorruptError("SQLITE_CORRUPT"))
      .mockResolvedValueOnce(undefined);

    await memoryRebuildCommand();

    expect(mockRmSync).not.toHaveBeenCalled();
    expect(mockRebuild).toHaveBeenCalledTimes(2);
  });
});

describe("memoryRebuildCommand — non-corruption errors are re-thrown", () => {
  it("rethrows EACCES without deleting files", async () => {
    const err = new Error("permission denied") as Error & { code: string };
    err.code = "EACCES";
    mockRebuild.mockRejectedValueOnce(err);

    await expect(memoryRebuildCommand()).rejects.toThrow("permission denied");
    expect(mockRmSync).not.toHaveBeenCalled();
    expect(mockRebuild).toHaveBeenCalledTimes(1);
  });

  it("rethrows bare SQLITE_IOERR without deleting files", async () => {
    const err = makeCorruptError("SQLITE_IOERR", "disk I/O error");
    mockRebuild.mockRejectedValueOnce(err);

    await expect(memoryRebuildCommand()).rejects.toThrow();
    expect(mockRmSync).not.toHaveBeenCalled();
    expect(mockRebuild).toHaveBeenCalledTimes(1);
  });

  it("rethrows generic Error without deleting files", async () => {
    mockRebuild.mockRejectedValueOnce(new Error("unexpected failure"));

    await expect(memoryRebuildCommand()).rejects.toThrow("unexpected failure");
    expect(mockRmSync).not.toHaveBeenCalled();
  });
});
