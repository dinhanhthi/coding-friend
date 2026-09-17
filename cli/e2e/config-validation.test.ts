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

  it("warns on a review timeout that cannot be enforced as a deadline", () => {
    writeFileSync(
      join(testDir, ".coding-friend", "config.json"),
      JSON.stringify({ review: { agentTimeout: 0, nativeTimeout: "600" } }),
    );
    const result = runCf(["memory", "status"], { cwd: testDir });
    const output = result.stdout + result.stderr;
    expect(output).toContain("review.agentTimeout");
    expect(output).toContain("review.nativeTimeout");
  });

  it("accepts positive integer review timeouts without a warning", () => {
    writeFileSync(
      join(testDir, ".coding-friend", "config.json"),
      JSON.stringify({ review: { agentTimeout: 120, nativeTimeout: 900 } }),
    );
    const result = runCf(["memory", "status"], { cwd: testDir });
    const output = result.stdout + result.stderr;
    // Without this, an empty output from a command that failed early would
    // satisfy both negative assertions below.
    expect(result.exitCode).toBe(0);
    expect(output).not.toContain("agentTimeout");
    expect(output).not.toContain("nativeTimeout");
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
