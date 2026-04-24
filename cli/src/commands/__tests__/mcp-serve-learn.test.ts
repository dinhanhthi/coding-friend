import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";

vi.mock("../../lib/lib-path.js", () => ({
  getLibPath: vi.fn(() => "/fake/learn-mcp"),
}));

const mockSpawn = vi.fn();
vi.mock("child_process", () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}));

const mockExistsSync = vi.fn();
const mockStatSync = vi.fn();
vi.mock("fs", () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
}));

const mockRunWithStderr = vi.fn();
vi.mock("../../lib/exec.js", () => ({
  runWithStderr: (...args: unknown[]) => mockRunWithStderr(...args),
}));

const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {
  // noop
}) as (code?: number) => never);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: docsDir is valid, all deps are installed/built
  mockExistsSync.mockReturnValue(true);
  mockStatSync.mockReturnValue({ isDirectory: () => true });
  mockRunWithStderr.mockReturnValue({ stdout: "", stderr: "", exitCode: 0 });
});

describe("mcpServeLearnCommand", () => {
  it("spawns node with the learn-mcp server path and docsDir", async () => {
    const fakeProcess = new EventEmitter();
    mockSpawn.mockReturnValue(fakeProcess);

    const { mcpServeLearnCommand } = await import("../mcp-serve-learn.js");
    mcpServeLearnCommand("/some/docs/dir");

    expect(mockSpawn).toHaveBeenCalledWith(
      "node",
      ["/fake/learn-mcp/dist/index.js", "/some/docs/dir"],
      expect.objectContaining({ stdio: "inherit" }),
    );
  });

  it("passes docsDir as second arg to node", async () => {
    const fakeProcess = new EventEmitter();
    mockSpawn.mockReturnValue(fakeProcess);

    const { mcpServeLearnCommand } = await import("../mcp-serve-learn.js");
    const docsDir = "/custom/project/docs/learn";
    mcpServeLearnCommand(docsDir);

    const spawnArgs = mockSpawn.mock.calls[0];
    expect(spawnArgs[1][1]).toBe(docsDir);
  });

  it("calls process.exit with child exit code when child exits", async () => {
    const fakeProcess = new EventEmitter();
    mockSpawn.mockReturnValue(fakeProcess);

    const { mcpServeLearnCommand } = await import("../mcp-serve-learn.js");
    mcpServeLearnCommand("/some/docs/dir");

    fakeProcess.emit("exit", 0);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it("calls process.exit with non-zero code on failure", async () => {
    const fakeProcess = new EventEmitter();
    mockSpawn.mockReturnValue(fakeProcess);

    const { mcpServeLearnCommand } = await import("../mcp-serve-learn.js");
    mcpServeLearnCommand("/some/docs/dir");

    fakeProcess.emit("exit", 1);
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("uses getLibPath('learn-mcp') to resolve server path", async () => {
    const fakeProcess = new EventEmitter();
    mockSpawn.mockReturnValue(fakeProcess);

    const { getLibPath } = await import("../../lib/lib-path.js");
    const mockGetLibPath = vi.mocked(getLibPath);

    const { mcpServeLearnCommand } = await import("../mcp-serve-learn.js");
    mcpServeLearnCommand("/docs");

    expect(mockGetLibPath).toHaveBeenCalledWith("learn-mcp");
  });

  it("calls process.exit(1) and logs error when spawn emits error event", async () => {
    const fakeProcess = new EventEmitter();
    mockSpawn.mockReturnValue(fakeProcess);

    const { mcpServeLearnCommand } = await import("../mcp-serve-learn.js");
    mcpServeLearnCommand("/some/docs/dir");

    fakeProcess.emit("error", new Error("ENOENT: no such file"));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  // I1: docsDir validation
  it("exits with code 1 if docsDir does not exist", async () => {
    mockExistsSync.mockImplementation((p: string) => p !== "/nonexistent/docs");

    const { mcpServeLearnCommand } = await import("../mcp-serve-learn.js");
    mcpServeLearnCommand("/nonexistent/docs");

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("exits with code 1 if docsDir is not a directory", async () => {
    mockStatSync.mockReturnValue({ isDirectory: () => false });

    const { mcpServeLearnCommand } = await import("../mcp-serve-learn.js");
    mcpServeLearnCommand("/some/file.txt");

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});

// C1: bootstrap guard
describe("ensureLearnBuilt (bootstrap guard)", () => {
  it("runs npm install when node_modules is missing", async () => {
    const fakeProcess = new EventEmitter();
    mockSpawn.mockReturnValue(fakeProcess);
    mockExistsSync.mockImplementation((p: string) => {
      if (p === "/fake/learn-mcp/node_modules") return false;
      return true;
    });

    const { mcpServeLearnCommand } = await import("../mcp-serve-learn.js");
    mcpServeLearnCommand("/some/docs");

    expect(mockRunWithStderr).toHaveBeenCalledWith(
      "npm",
      ["install"],
      expect.objectContaining({ cwd: "/fake/learn-mcp" }),
    );
  });

  it("runs npm run build when dist is missing", async () => {
    const fakeProcess = new EventEmitter();
    mockSpawn.mockReturnValue(fakeProcess);
    mockExistsSync.mockImplementation((p: string) => {
      if (p === "/fake/learn-mcp/dist") return false;
      return true;
    });

    const { mcpServeLearnCommand } = await import("../mcp-serve-learn.js");
    mcpServeLearnCommand("/some/docs");

    expect(mockRunWithStderr).toHaveBeenCalledWith(
      "npm",
      ["run", "build"],
      expect.objectContaining({ cwd: "/fake/learn-mcp" }),
    );
  });

  it("skips npm install when node_modules already exists", async () => {
    const fakeProcess = new EventEmitter();
    mockSpawn.mockReturnValue(fakeProcess);
    // All paths exist (default mock)

    const { mcpServeLearnCommand } = await import("../mcp-serve-learn.js");
    mcpServeLearnCommand("/some/docs");

    expect(mockRunWithStderr).not.toHaveBeenCalledWith(
      "npm",
      ["install"],
      expect.anything(),
    );
  });

  it("exits with code 1 if npm install fails", async () => {
    const fakeProcess = new EventEmitter();
    mockSpawn.mockReturnValue(fakeProcess);
    mockExistsSync.mockImplementation((p: string) => {
      if (p === "/fake/learn-mcp/node_modules") return false;
      return true;
    });
    mockRunWithStderr.mockReturnValue({
      stdout: "",
      stderr: "install error",
      exitCode: 1,
    });

    const { mcpServeLearnCommand } = await import("../mcp-serve-learn.js");
    mcpServeLearnCommand("/some/docs");

    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
