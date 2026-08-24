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

import { runWithStderr } from "../exec.js";
import { log } from "../log.js";
import {
  registerLearnMcp,
  isLearnMcpRegistered,
  unregisterLearnMcp,
} from "../learn-prompts.js";
import {
  readOmpMcpJson,
  removeOmpMcpEntry,
  writeOmpMcpEntry,
} from "../omp-config.js";
import { resolvePath } from "../paths.js";

const mockRunWithStderr = vi.mocked(runWithStderr);
const mockLog = vi.mocked(log);
const mockWriteOmpMcpEntry = vi.mocked(writeOmpMcpEntry);
const mockReadOmpMcpJson = vi.mocked(readOmpMcpJson);
const mockRemoveOmpMcpEntry = vi.mocked(removeOmpMcpEntry);

const LEARN_DIR = "/tmp/learn";
const RESOLVED_LEARN_DIR = resolvePath(LEARN_DIR);

const CLAUDE_ADD_ARGS = [
  "mcp",
  "add",
  "--scope",
  "user",
  "coding-friend-learn",
  "--",
  "npx",
  "-y",
  "coding-friend-cli",
  "mcp-serve-learn",
  RESOLVED_LEARN_DIR,
];

const OMP_LEARN_SERVER = {
  command: "npx",
  args: ["-y", "coding-friend-cli", "mcp-serve-learn", RESOLVED_LEARN_DIR],
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("registerLearnMcp", () => {
  it("invokes claude with the exact expected args including resolved learn dir", () => {
    mockRunWithStderr.mockReturnValue({ stdout: "", stderr: "", exitCode: 0 });

    const result = registerLearnMcp(LEARN_DIR);

    expect(mockRunWithStderr).toHaveBeenCalledWith("claude", CLAUDE_ADD_ARGS);
    expect(result).toBe(true);
  });

  it("returns false and warns with manual hint when ENOENT in stderr", () => {
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "spawn claude ENOENT",
      exitCode: 1,
    });

    const result = registerLearnMcp(LEARN_DIR);

    expect(result).toBe(false);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `claude mcp add --scope user coding-friend-learn -- npx -y coding-friend-cli mcp-serve-learn ${RESOLVED_LEARN_DIR}`,
      ),
    );
  });

  it("returns false and warns with manual hint when command not found in stderr", () => {
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "command not found: claude",
      exitCode: 127,
    });

    const result = registerLearnMcp(LEARN_DIR);

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

    const result = registerLearnMcp(LEARN_DIR);

    expect(result).toBe(false);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not register MCP"),
    );
  });

  it("invokes claude CLI when host is explicit \"claude\"", () => {
    mockRunWithStderr.mockReturnValue({ stdout: "", stderr: "", exitCode: 0 });

    const result = registerLearnMcp(LEARN_DIR, "claude");

    expect(mockRunWithStderr).toHaveBeenCalledWith("claude", CLAUDE_ADD_ARGS);
    expect(result).toBe(true);
    expect(mockWriteOmpMcpEntry).not.toHaveBeenCalled();
  });

  it("writes the omp mcp.json entry when host is \"omp\"", () => {
    const result = registerLearnMcp(LEARN_DIR, "omp");

    expect(mockWriteOmpMcpEntry).toHaveBeenCalledWith(
      "coding-friend-learn",
      OMP_LEARN_SERVER,
    );
    expect(result).toBe(true);
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });

  it("returns false and warns when omp write throws", () => {
    mockWriteOmpMcpEntry.mockImplementation(() => {
      throw new Error("EACCES");
    });

    const result = registerLearnMcp(LEARN_DIR, "omp");

    expect(result).toBe(false);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not register MCP: EACCES"),
    );
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });
});

describe("isLearnMcpRegistered", () => {
  it("returns true when exit code is 0", () => {
    mockRunWithStderr.mockReturnValue({
      stdout: "...",
      stderr: "",
      exitCode: 0,
    });

    expect(isLearnMcpRegistered()).toBe(true);
    expect(mockRunWithStderr).toHaveBeenCalledWith("claude", [
      "mcp",
      "get",
      "coding-friend-learn",
    ]);
  });

  it("returns false when exit code is non-zero", () => {
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "not found",
      exitCode: 1,
    });

    expect(isLearnMcpRegistered()).toBe(false);
  });

  it("returns true when omp mcp.json has coding-friend-learn", () => {
    mockReadOmpMcpJson.mockReturnValue({
      mcpServers: {
        "coding-friend-learn": OMP_LEARN_SERVER,
      },
    });

    expect(isLearnMcpRegistered("omp")).toBe(true);
    expect(mockReadOmpMcpJson).toHaveBeenCalled();
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });

  it("returns false when omp mcp.json is null", () => {
    mockReadOmpMcpJson.mockReturnValue(null);

    expect(isLearnMcpRegistered("omp")).toBe(false);
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });

  it("returns false when omp mcp.json is missing coding-friend-learn", () => {
    mockReadOmpMcpJson.mockReturnValue({
      mcpServers: {
        "coding-friend-memory": {
          command: "npx",
          args: ["-y", "coding-friend-cli", "mcp-serve"],
        },
      },
    });

    expect(isLearnMcpRegistered("omp")).toBe(false);
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });
});

describe("unregisterLearnMcp", () => {
  it("invokes claude mcp remove --scope user coding-friend-learn", () => {
    mockRunWithStderr.mockReturnValue({ stdout: "", stderr: "", exitCode: 0 });

    const result = unregisterLearnMcp();

    expect(mockRunWithStderr).toHaveBeenCalledWith("claude", [
      "mcp",
      "remove",
      "--scope",
      "user",
      "coding-friend-learn",
    ]);
    expect(result).toBe(true);
  });

  it("returns false when removal fails", () => {
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "error",
      exitCode: 1,
    });

    expect(unregisterLearnMcp()).toBe(false);
  });

  it("removes the omp mcp.json entry when host is \"omp\"", () => {
    mockReadOmpMcpJson.mockReturnValue({ mcpServers: {} });

    const result = unregisterLearnMcp("omp");

    expect(mockRemoveOmpMcpEntry).toHaveBeenCalledWith("coding-friend-learn");
    expect(result).toBe(true);
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });

  it("returns false and warns when omp remove throws", () => {
    mockRemoveOmpMcpEntry.mockImplementation(() => {
      throw new Error("EACCES");
    });

    const result = unregisterLearnMcp("omp");

    expect(result).toBe(false);
    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not unregister MCP: EACCES"),
    );
    expect(mockRunWithStderr).not.toHaveBeenCalled();
  });
});
