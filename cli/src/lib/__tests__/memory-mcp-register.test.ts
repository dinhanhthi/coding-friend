import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../exec.js", () => ({
  runWithStderr: vi.fn(),
}));

vi.mock("../log.js", () => ({
  log: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import { runWithStderr } from "../exec.js";
import { log } from "../log.js";
import {
  registerMemoryMcp,
  isMemoryMcpRegistered,
  unregisterMemoryMcp,
} from "../memory-mcp-register.js";

const mockRunWithStderr = vi.mocked(runWithStderr);
const mockLog = vi.mocked(log);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("registerMemoryMcp", () => {
  it("invokes claude with the exact expected args (no trailing path)", () => {
    mockRunWithStderr.mockReturnValue({ stdout: "", stderr: "", exitCode: 0 });

    const result = registerMemoryMcp();

    expect(mockRunWithStderr).toHaveBeenCalledWith("claude", [
      "mcp",
      "add",
      "--scope",
      "user",
      "coding-friend-memory",
      "--",
      "npx",
      "-y",
      "coding-friend-cli",
      "mcp-serve",
    ]);
    expect(result).toBe(true);
  });

  it("returns false and warns with manual hint when ENOENT in stderr", () => {
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "spawn claude ENOENT",
      exitCode: 1,
    });

    const result = registerMemoryMcp();

    expect(result).toBe(false);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "claude mcp add --scope user coding-friend-memory -- npx -y coding-friend-cli mcp-serve",
      ),
    );
  });

  it("returns false and warns with manual hint when command not found in stderr", () => {
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "command not found: claude",
      exitCode: 127,
    });

    const result = registerMemoryMcp();

    expect(result).toBe(false);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("claude CLI not found"),
    );
  });

  it("returns false and warns with stderr on non-ENOENT failure", () => {
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "some other error",
      exitCode: 1,
    });

    const result = registerMemoryMcp();

    expect(result).toBe(false);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not register MCP"),
    );
  });
});

describe("isMemoryMcpRegistered", () => {
  it("returns true when exit code is 0", () => {
    mockRunWithStderr.mockReturnValue({ stdout: "...", stderr: "", exitCode: 0 });

    expect(isMemoryMcpRegistered()).toBe(true);
    expect(mockRunWithStderr).toHaveBeenCalledWith("claude", [
      "mcp",
      "get",
      "coding-friend-memory",
    ]);
  });

  it("returns false when exit code is non-zero", () => {
    mockRunWithStderr.mockReturnValue({ stdout: "", stderr: "not found", exitCode: 1 });

    expect(isMemoryMcpRegistered()).toBe(false);
  });
});

describe("unregisterMemoryMcp", () => {
  it("invokes claude mcp remove --scope user coding-friend-memory", () => {
    mockRunWithStderr.mockReturnValue({ stdout: "", stderr: "", exitCode: 0 });

    const result = unregisterMemoryMcp();

    expect(mockRunWithStderr).toHaveBeenCalledWith("claude", [
      "mcp",
      "remove",
      "--scope",
      "user",
      "coding-friend-memory",
    ]);
    expect(result).toBe(true);
  });

  it("returns false when removal fails", () => {
    mockRunWithStderr.mockReturnValue({ stdout: "", stderr: "error", exitCode: 1 });

    expect(unregisterMemoryMcp()).toBe(false);
  });
});
