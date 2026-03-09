import { describe, it, expect } from "vitest";
import { run, runWithStderr, commandExists, streamExec } from "../exec.js";

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

describe("runWithStderr", () => {
  it("returns stdout and exitCode 0 for a successful command", () => {
    const result = runWithStderr("echo", ["hello"]);
    expect(result).toEqual({ stdout: "hello", stderr: "", exitCode: 0 });
  });

  it("returns exitCode and stderr for a failing command", () => {
    // `ls` on a non-existent path writes to stderr and exits non-zero
    const result = runWithStderr("ls", [
      "/this-path-does-not-exist-cf-test-12345",
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });

  it("returns exitCode 1 for a command that does not exist", () => {
    const result = runWithStderr("this-command-does-not-exist-cf");
    expect(result.exitCode).toBeGreaterThanOrEqual(1);
  });

  it("trims stdout and stderr whitespace", () => {
    const result = runWithStderr("printf", ["  trimmed  "]);
    expect(result.stdout).toBe("trimmed");
  });

  it("respects the cwd option", () => {
    const result = runWithStderr("pwd", [], { cwd: "/tmp" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.endsWith("tmp")).toBe(true);
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
