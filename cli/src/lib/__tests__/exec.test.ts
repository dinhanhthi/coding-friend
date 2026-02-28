import { describe, it, expect } from "vitest";
import { run, commandExists, streamExec } from "../exec.js";

describe("run", () => {
  it("returns stdout for a successful command", () => {
    const result = run("echo", ["hello"]);
    expect(result).toBe("hello");
  });

  it("returns null when the command fails", () => {
    expect(run("false")).toBeNull();
  });

  it("returns null for a command that does not exist", () => {
    expect(run("this-command-does-not-exist-cf")).toBeNull();
  });

  it("trims trailing whitespace from output", () => {
    const result = run("printf", ["  trimmed  "]);
    // execFileSync trims via .trim() in implementation
    expect(result).toBe("trimmed");
  });

  it("respects the cwd option", () => {
    const result = run("pwd", [], { cwd: "/tmp" });
    // /tmp may resolve to /private/tmp on macOS — check suffix
    expect(result?.endsWith("tmp")).toBe(true);
  });
});

describe("commandExists", () => {
  it("returns true for commands that exist on PATH", () => {
    expect(commandExists("echo")).toBe(true);
    expect(commandExists("node")).toBe(true);
  });

  it("returns false for commands that do not exist", () => {
    expect(commandExists("this-command-does-not-exist-cf")).toBe(false);
  });
});

describe("streamExec", () => {
  it("resolves with exit code 0 for a successful command", async () => {
    const code = await streamExec("true", []);
    expect(code).toBe(0);
  });

  it("resolves with a non-zero exit code for a failing command", async () => {
    const code = await streamExec("false", []);
    expect(code).toBeGreaterThan(0);
  });
});
