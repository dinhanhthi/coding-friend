import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCf } from "./helpers.js";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-e2e-config-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  mkdirSync(join(testDir, ".coding-friend"), { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("config validation warnings", () => {
  it("warns on invalid config types", () => {
    writeFileSync(
      join(testDir, ".coding-friend", "config.json"),
      JSON.stringify({ autoApprove: "yes" }),
    );
    // Warnings go to stderr (via log.warn)
    const result = runCf(["memory", "status"], { cwd: testDir });
    const output = result.stdout + result.stderr;
    expect(output).toContain("autoApprove");
  });

  it("warns on unknown config keys", () => {
    writeFileSync(
      join(testDir, ".coding-friend", "config.json"),
      JSON.stringify({ autoapprove: true }),
    );
    const result = runCf(["memory", "status"], { cwd: testDir });
    const output = result.stdout + result.stderr;
    expect(output).toContain("autoapprove");
  });
});
