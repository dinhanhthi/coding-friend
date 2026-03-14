import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  areDepsInstalled,
  areSqliteDepsAvailable,
  areEmbeddingDepsAvailable,
  readManifest,
  getManifestPath,
  getDepsDir,
  SQLITE_DEPS,
  EMBEDDING_DEPS,
  ALL_DEPS,
  type DepsManifest,
} from "../lib/lazy-install.js";

let testDir: string;
let counter = 0;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-memory-lazy-test-${Date.now()}-${++counter}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("getDepsDir()", () => {
  it("returns a path under ~/.coding-friend/memory/", () => {
    const dir = getDepsDir();
    expect(dir).toContain(".coding-friend");
    expect(dir).toContain("memory");
  });
});

describe("getManifestPath()", () => {
  it("returns deps.json path within depsDir", () => {
    const p = getManifestPath(testDir);
    expect(p).toBe(join(testDir, "deps.json"));
  });
});

describe("readManifest()", () => {
  it("returns null when no manifest exists", () => {
    expect(readManifest(testDir)).toBeNull();
  });

  it("returns parsed manifest when file exists", () => {
    const manifest: DepsManifest = {
      version: 1,
      installed: { "better-sqlite3": "11.0.0" },
      installedAt: "2026-01-01T00:00:00Z",
    };
    writeFileSync(join(testDir, "deps.json"), JSON.stringify(manifest));

    const result = readManifest(testDir);
    expect(result).toEqual(manifest);
  });

  it("returns null for invalid JSON", () => {
    writeFileSync(join(testDir, "deps.json"), "not json");
    expect(readManifest(testDir)).toBeNull();
  });
});

describe("areDepsInstalled()", () => {
  it("returns false when no manifest exists", () => {
    expect(areDepsInstalled(SQLITE_DEPS, testDir)).toBe(false);
  });

  it("returns false when manifest version doesn't match", () => {
    writeFileSync(
      join(testDir, "deps.json"),
      JSON.stringify({ version: 999, installed: {}, installedAt: "" }),
    );
    expect(areDepsInstalled(SQLITE_DEPS, testDir)).toBe(false);
  });

  it("returns false when required dep is missing from manifest", () => {
    writeFileSync(
      join(testDir, "deps.json"),
      JSON.stringify({
        version: 1,
        installed: { "better-sqlite3": "11.0.0" },
        installedAt: "",
      }),
    );
    // SQLITE_DEPS requires both better-sqlite3 and sqlite-vec
    expect(areDepsInstalled(SQLITE_DEPS, testDir)).toBe(false);
  });

  it("returns false when major version doesn't match", () => {
    // Create fake node_modules
    mkdirSync(join(testDir, "node_modules", "better-sqlite3"), {
      recursive: true,
    });
    mkdirSync(join(testDir, "node_modules", "sqlite-vec"), {
      recursive: true,
    });

    writeFileSync(
      join(testDir, "deps.json"),
      JSON.stringify({
        version: 1,
        installed: {
          "better-sqlite3": "9.0.0", // required ^11.0.0
          "sqlite-vec": "0.1.6",
        },
        installedAt: "",
      }),
    );
    expect(areDepsInstalled(SQLITE_DEPS, testDir)).toBe(false);
  });

  it("returns false when module dir doesn't exist on disk", () => {
    writeFileSync(
      join(testDir, "deps.json"),
      JSON.stringify({
        version: 1,
        installed: {
          "better-sqlite3": "11.0.0",
          "sqlite-vec": "0.1.6",
        },
        installedAt: "",
      }),
    );
    // No node_modules on disk
    expect(areDepsInstalled(SQLITE_DEPS, testDir)).toBe(false);
  });

  it("returns false for 0.x packages with wrong minor version", () => {
    // ^0.1.6 should reject 0.2.0 (different minor)
    mkdirSync(join(testDir, "node_modules", "better-sqlite3"), {
      recursive: true,
    });
    mkdirSync(join(testDir, "node_modules", "sqlite-vec"), {
      recursive: true,
    });

    writeFileSync(
      join(testDir, "deps.json"),
      JSON.stringify({
        version: 1,
        installed: {
          "better-sqlite3": "11.0.0",
          "sqlite-vec": "0.2.0", // required ^0.1.6, minor mismatch
        },
        installedAt: "",
      }),
    );
    expect(areDepsInstalled(SQLITE_DEPS, testDir)).toBe(false);
  });

  it("returns true when all deps match", () => {
    // Create fake node_modules
    mkdirSync(join(testDir, "node_modules", "better-sqlite3"), {
      recursive: true,
    });
    mkdirSync(join(testDir, "node_modules", "sqlite-vec"), {
      recursive: true,
    });

    writeFileSync(
      join(testDir, "deps.json"),
      JSON.stringify({
        version: 1,
        installed: {
          "better-sqlite3": "11.2.0",
          "sqlite-vec": "0.1.8",
        },
        installedAt: "",
      }),
    );
    expect(areDepsInstalled(SQLITE_DEPS, testDir)).toBe(true);
  });
});

describe("areSqliteDepsAvailable()", () => {
  it("returns false when deps not installed", () => {
    expect(areSqliteDepsAvailable(testDir)).toBe(false);
  });
});

describe("areEmbeddingDepsAvailable()", () => {
  it("returns false when deps not installed", () => {
    expect(areEmbeddingDepsAvailable(testDir)).toBe(false);
  });
});

describe("dependency constants", () => {
  it("SQLITE_DEPS includes better-sqlite3 and sqlite-vec", () => {
    expect(SQLITE_DEPS["better-sqlite3"]).toBeDefined();
    expect(SQLITE_DEPS["sqlite-vec"]).toBeDefined();
  });

  it("EMBEDDING_DEPS includes @huggingface/transformers", () => {
    expect(EMBEDDING_DEPS["@huggingface/transformers"]).toBeDefined();
  });

  it("ALL_DEPS is a superset of both", () => {
    for (const key of Object.keys(SQLITE_DEPS)) {
      expect(ALL_DEPS[key]).toBeDefined();
    }
    for (const key of Object.keys(EMBEDDING_DEPS)) {
      expect(ALL_DEPS[key]).toBeDefined();
    }
  });
});
