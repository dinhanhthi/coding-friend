import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return { ...actual, existsSync: vi.fn(() => false) };
});

vi.mock("../json.js", () => ({ readJson: vi.fn(() => null) }));

vi.mock("../paths.js", () => ({
  globalConfigPath: vi.fn(() => "/mock/.coding-friend/config.json"),
  resolvePath: vi.fn((p: string) => p),
}));

vi.mock("../lib-path.js", () => ({ getLibPath: vi.fn() }));

vi.mock("../memory-mcp-register.js", () => ({
  isMemoryMcpRegistered: vi.fn(() => true),
}));

vi.mock("../learn-prompts.js", () => ({
  isLearnMcpRegistered: vi.fn(() => false),
}));

vi.mock("../fs-utils.js", () => ({
  listMdFilesRecursive: vi.fn(() => []),
}));

import { existsSync } from "fs";
import { readJson } from "../json.js";
import { getLibPath } from "../lib-path.js";
import {
  collectLearnMcpHealth,
  collectMemoryMcpHealth,
} from "../mcp-report.js";

const mockExists = vi.mocked(existsSync);
const mockGetLibPath = vi.mocked(getLibPath);
const mockReadJson = vi.mocked(readJson);

beforeEach(() => {
  vi.resetAllMocks();
  mockExists.mockReturnValue(false);
  mockReadJson.mockReturnValue(null);
});

describe("collectMemoryMcpHealth", () => {
  it("checks the cf-memory dist entry resolved via getLibPath", async () => {
    mockGetLibPath.mockReturnValue("/lib/cf-memory");
    mockExists.mockImplementation((p) => p === "/lib/cf-memory/dist/index.js");

    const result = await collectMemoryMcpHealth();

    const built = result.checks.find((c) => c.label === "Package built");
    expect(built?.ok).toBe(true);
    expect(mockGetLibPath).toHaveBeenCalledWith("cf-memory");
  });

  it("reports the package as not built when cf-memory cannot be located", async () => {
    mockGetLibPath.mockImplementation(() => {
      throw new Error("missing");
    });

    const result = await collectMemoryMcpHealth();

    const built = result.checks.find((c) => c.label === "Package built");
    expect(built?.ok).toBe(false);
    expect(mockExists).toHaveBeenCalledWith("/unavailable");
  });

  it("uses an explicit cf-memory dir without resolving it", async () => {
    mockExists.mockImplementation((p) => p === "/custom/dist/index.js");

    const result = await collectMemoryMcpHealth("/custom");

    const built = result.checks.find((c) => c.label === "Package built");
    expect(built?.ok).toBe(true);
    expect(mockGetLibPath).not.toHaveBeenCalled();
  });
});

describe("collectLearnMcpHealth", () => {
  it("uses learn.outputDir from the global config as docs dir", async () => {
    mockGetLibPath.mockReturnValue("/lib/learn-mcp");
    mockReadJson.mockReturnValue({ learn: { outputDir: "/my/learn" } });

    const result = await collectLearnMcpHealth();

    const docs = result.checks.find((c) => c.label === "Docs directory");
    expect(docs?.detail).toContain("/my/learn");
    expect(mockExists).toHaveBeenCalledWith("/lib/learn-mcp/dist/index.js");
  });

  it("honours explicit learn-mcp dir and docs dir", async () => {
    const result = await collectLearnMcpHealth({
      learnMcpDir: "/x/learn-mcp",
      docsDir: "/x/docs",
    });

    const docs = result.checks.find((c) => c.label === "Docs directory");
    expect(docs?.detail).toContain("/x/docs");
    expect(mockExists).toHaveBeenCalledWith("/x/learn-mcp/dist/index.js");
    expect(mockGetLibPath).not.toHaveBeenCalled();
  });
});
