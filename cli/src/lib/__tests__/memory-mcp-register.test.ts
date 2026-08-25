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

vi.mock("../omp-config.js", () => ({
  writeOmpMcpEntry: vi.fn(),
  readOmpMcpJson: vi.fn(),
  removeOmpMcpEntry: vi.fn(),
}));

vi.mock("../agy-config.js", () => ({
  writeAgyMcpEntry: vi.fn(),
  readAgyMcpConfig: vi.fn(),
  removeAgyMcpEntry: vi.fn(),
}));

import { runWithStderr } from "../exec.js";
import { log } from "../log.js";
import {
  registerMemoryMcp,
  isMemoryMcpRegistered,
  unregisterMemoryMcp,
} from "../memory-mcp-register.js";
import {
  readAgyMcpConfig,
  removeAgyMcpEntry,
  writeAgyMcpEntry,
} from "../agy-config.js";
import {
  readOmpMcpJson,
  removeOmpMcpEntry,
  writeOmpMcpEntry,
} from "../omp-config.js";

const mockRunWithStderr = vi.mocked(runWithStderr);
const mockLog = vi.mocked(log);
const mockWriteOmpMcpEntry = vi.mocked(writeOmpMcpEntry);
const mockReadOmpMcpJson = vi.mocked(readOmpMcpJson);
const mockRemoveOmpMcpEntry = vi.mocked(removeOmpMcpEntry);
const mockWriteAgyMcpEntry = vi.mocked(writeAgyMcpEntry);
const mockReadAgyMcpConfig = vi.mocked(readAgyMcpConfig);
const mockRemoveAgyMcpEntry = vi.mocked(removeAgyMcpEntry);

const OMP_MEMORY_SERVER = {
  command: "npx",
  args: ["-y", "coding-friend-cli", "mcp-serve"],
};

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

  it('invokes claude CLI when host is explicit "claude"', () => {
    mockRunWithStderr.mockReturnValue({ stdout: "", stderr: "", exitCode: 0 });

    const result = registerMemoryMcp("claude");

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
    expect(mockWriteOmpMcpEntry).not.toHaveBeenCalled();
  });

  it('writes the omp mcp.json entry when host is "omp"', () => {
    const result = registerMemoryMcp("omp");

    expect(mockWriteOmpMcpEntry).toHaveBeenCalledWith(
      "coding-friend-memory",
      OMP_MEMORY_SERVER,
    );
    expect(result).toBe(true);
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });

  it("returns false and warns when omp write throws", () => {
    mockWriteOmpMcpEntry.mockImplementation(() => {
      throw new Error("EACCES");
    });

    const result = registerMemoryMcp("omp");

    expect(result).toBe(false);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not register MCP: EACCES"),
    );
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });

  it('writes the agy plugin mcp_config entry when host is "agy"', () => {
    const result = registerMemoryMcp("agy");

    expect(mockWriteAgyMcpEntry).toHaveBeenCalledWith(
      "coding-friend-memory",
      OMP_MEMORY_SERVER,
    );
    expect(result).toBe(true);
    expect(mockRunWithStderr).not.toHaveBeenCalled();
    expect(mockWriteOmpMcpEntry).not.toHaveBeenCalled();
  });

  it("returns false and warns when agy write throws", () => {
    mockWriteAgyMcpEntry.mockImplementation(() => {
      throw new Error("EACCES");
    });

    const result = registerMemoryMcp("agy");

    expect(result).toBe(false);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not register MCP: EACCES"),
    );
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });
});

describe("isMemoryMcpRegistered", () => {
  it("returns true when exit code is 0", () => {
    mockRunWithStderr.mockReturnValue({
      stdout: "...",
      stderr: "",
      exitCode: 0,
    });

    expect(isMemoryMcpRegistered()).toBe(true);
    expect(mockRunWithStderr).toHaveBeenCalledWith("claude", [
      "mcp",
      "get",
      "coding-friend-memory",
    ]);
  });

  it("returns false when exit code is non-zero", () => {
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "not found",
      exitCode: 1,
    });

    expect(isMemoryMcpRegistered()).toBe(false);
  });

  it("returns true when omp mcp.json has coding-friend-memory", () => {
    mockReadOmpMcpJson.mockReturnValue({
      mcpServers: {
        "coding-friend-memory": OMP_MEMORY_SERVER,
      },
    });

    expect(isMemoryMcpRegistered("omp")).toBe(true);
    expect(mockReadOmpMcpJson).toHaveBeenCalled();
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });

  it("returns false when omp mcp.json is null", () => {
    mockReadOmpMcpJson.mockReturnValue(null);

    expect(isMemoryMcpRegistered("omp")).toBe(false);
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });

  it("returns false when omp mcp.json is missing coding-friend-memory", () => {
    mockReadOmpMcpJson.mockReturnValue({
      mcpServers: {
        "coding-friend-learn": OMP_MEMORY_SERVER,
      },
    });

    expect(isMemoryMcpRegistered("omp")).toBe(false);
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });

  it("returns true when agy mcp_config has coding-friend-memory", () => {
    mockReadAgyMcpConfig.mockReturnValue({
      mcpServers: {
        "coding-friend-memory": OMP_MEMORY_SERVER,
      },
    });

    expect(isMemoryMcpRegistered("agy")).toBe(true);
    expect(mockReadAgyMcpConfig).toHaveBeenCalled();
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });

  it("returns false when agy mcp_config is null", () => {
    mockReadAgyMcpConfig.mockReturnValue(null);

    expect(isMemoryMcpRegistered("agy")).toBe(false);
    expect(mockRunWithStderr).not.toHaveBeenCalled();
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
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "error",
      exitCode: 1,
    });

    expect(unregisterMemoryMcp()).toBe(false);
  });

  it('removes the omp mcp.json entry when host is "omp"', () => {
    mockReadOmpMcpJson.mockReturnValue({ mcpServers: {} });

    const result = unregisterMemoryMcp("omp");

    expect(mockRemoveOmpMcpEntry).toHaveBeenCalledWith("coding-friend-memory");
    expect(result).toBe(true);
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });

  it("returns false and warns when omp remove throws", () => {
    mockRemoveOmpMcpEntry.mockImplementation(() => {
      throw new Error("EACCES");
    });

    const result = unregisterMemoryMcp("omp");

    expect(result).toBe(false);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not unregister MCP: EACCES"),
    );
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });

  it('removes the agy mcp_config entry when host is "agy"', () => {
    mockReadAgyMcpConfig.mockReturnValue({ mcpServers: {} });

    const result = unregisterMemoryMcp("agy");

    expect(mockRemoveAgyMcpEntry).toHaveBeenCalledWith("coding-friend-memory");
    expect(result).toBe(true);
    expect(mockRunWithStderr).not.toHaveBeenCalled();
    expect(mockRemoveOmpMcpEntry).not.toHaveBeenCalled();
  });

  it("returns false and warns when agy remove throws", () => {
    mockRemoveAgyMcpEntry.mockImplementation(() => {
      throw new Error("EACCES");
    });

    const result = unregisterMemoryMcp("agy");

    expect(result).toBe(false);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not unregister MCP: EACCES"),
    );
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });
});
