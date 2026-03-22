import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";

vi.mock("child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

const mockExecFileSync = vi.mocked(execFileSync);

describe("commandExists platform detection", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    mockExecFileSync.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("uses 'where' on Windows", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    mockExecFileSync.mockReturnValue("C:\\Windows\\System32\\node.exe");

    // Dynamic import to pick up the mocked child_process
    const { commandExists } = await import("../exec.js");
    commandExists("node");

    expect(mockExecFileSync).toHaveBeenCalledWith(
      "where",
      ["node"],
      expect.any(Object),
    );
  });

  it("uses 'which' on non-Windows", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    mockExecFileSync.mockReturnValue("/usr/bin/node");

    const { commandExists } = await import("../exec.js");
    commandExists("node");

    expect(mockExecFileSync).toHaveBeenCalledWith(
      "which",
      ["node"],
      expect.any(Object),
    );
  });
});
