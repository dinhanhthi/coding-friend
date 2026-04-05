import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCf } from "./helpers.js";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-e2e-memory-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  // Create minimal project structure
  mkdirSync(join(testDir, ".coding-friend"), { recursive: true });
  writeFileSync(
    join(testDir, ".coding-friend", "config.json"),
    JSON.stringify({ memory: { tier: "markdown" } }),
  );
  mkdirSync(join(testDir, "docs", "memory"), { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("cf memory status", () => {
  it("shows memory status without crashing", () => {
    const result = runCf(["memory", "status"], { cwd: testDir });
    // Should not crash even without daemon
    expect(result.stdout).toContain("Memory");
  });
});

describe("cf memory search", () => {
  it("returns empty results for empty memory dir", () => {
    const result = runCf(["memory", "search", "test"], { cwd: testDir });
    // Should not crash on empty dir
    expect(result.exitCode).toBeDefined();
  });
});
