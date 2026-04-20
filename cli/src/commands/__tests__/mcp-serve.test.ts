import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

// Mock lib-path before importing mcp-serve
vi.mock("../../lib/lib-path.js", () => ({
  getLibPath: vi.fn(() => "/fake/cf-memory"),
}));

// Mock child_process.spawn
const mockSpawn = vi.fn();
vi.mock("child_process", () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// Mock process.exit so tests don't terminate
const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {
  // noop — prevents test runner from dying
}) as (code?: number) => never);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("mcpServeCommand", () => {
  it("spawns node with the cf-memory server path and memoryDir", async () => {
    const fakeProcess = new EventEmitter() as EventEmitter & {
      stdin: null;
      stdout: null;
      stderr: null;
    };
    mockSpawn.mockReturnValue(fakeProcess);

    const { mcpServeCommand } = await import("../mcp-serve.js");
    mcpServeCommand("/some/memory/dir");

    expect(mockSpawn).toHaveBeenCalledWith(
      "node",
      ["/fake/cf-memory/dist/index.js", "/some/memory/dir"],
      expect.objectContaining({ stdio: "inherit" }),
    );
  });

  it("calls process.exit with child exit code when child exits", async () => {
    const fakeProcess = new EventEmitter();
    mockSpawn.mockReturnValue(fakeProcess);

    const { mcpServeCommand } = await import("../mcp-serve.js");
    mcpServeCommand("/some/memory/dir");

    // Simulate child exit
    fakeProcess.emit("exit", 0);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("calls process.exit with non-zero code on failure", async () => {
    const fakeProcess = new EventEmitter();
    mockSpawn.mockReturnValue(fakeProcess);

    const { mcpServeCommand } = await import("../mcp-serve.js");
    mcpServeCommand("/some/memory/dir");

    fakeProcess.emit("exit", 1);
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("uses getLibPath('cf-memory') to resolve server path", async () => {
    const fakeProcess = new EventEmitter();
    mockSpawn.mockReturnValue(fakeProcess);

    const { getLibPath } = await import("../../lib/lib-path.js");
    const mockGetLibPath = vi.mocked(getLibPath);

    const { mcpServeCommand } = await import("../mcp-serve.js");
    mcpServeCommand("/mem");

    expect(mockGetLibPath).toHaveBeenCalledWith("cf-memory");
  });

  it("passes memoryDir as second arg to node", async () => {
    const fakeProcess = new EventEmitter();
    mockSpawn.mockReturnValue(fakeProcess);

    const { mcpServeCommand } = await import("../mcp-serve.js");
    const memoryDir = "/custom/project/docs/memory";
    mcpServeCommand(memoryDir);

    const spawnArgs = mockSpawn.mock.calls[0];
    expect(spawnArgs[1][1]).toBe(memoryDir);
  });

  it("calls process.exit(1) and logs error when spawn emits error event", async () => {
    const fakeProcess = new EventEmitter();
    mockSpawn.mockReturnValue(fakeProcess);

    const { mcpServeCommand } = await import("../mcp-serve.js");
    mcpServeCommand("/some/memory/dir");

    fakeProcess.emit("error", new Error("ENOENT: no such file"));
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
