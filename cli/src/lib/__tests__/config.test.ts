import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../json.js", () => ({
  readJson: vi.fn(),
}));

vi.mock("../paths.js", () => ({
  localConfigPath: vi.fn(() => "/project/.coding-friend/config.json"),
  globalConfigPath: vi.fn(() => "/home/user/.coding-friend/config.json"),
  resolvePath: vi.fn((p: string) => `/resolved/${p}`),
}));

import { readJson } from "../json.js";
import { resolveMemoryDir } from "../config.js";

const mockReadJson = vi.mocked(readJson);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("resolveMemoryDir", () => {
  it("returns resolved 'docs/memory' by default when no config exists", () => {
    mockReadJson.mockReturnValue(null);

    const result = resolveMemoryDir();
    expect(result).toBe("/resolved/docs/memory");
  });

  it("uses explicit path argument when provided", () => {
    mockReadJson.mockReturnValue(null);

    const result = resolveMemoryDir("/custom/memory");
    expect(result).toBe("/resolved//custom/memory");
  });

  it("uses config.memory.docsDir when set", () => {
    mockReadJson.mockReturnValue(null);

    // loadConfig merges global + local, so we need to mock it differently.
    // Since loadConfig reads both configs and merges, let's mock the readJson
    // calls in order: first call = global config, second call = local config
    // But resolveMemoryDir uses loadConfig() which calls readJson twice.
    // Let's mock so global returns null and local returns memory.docsDir.
    mockReadJson
      .mockReturnValueOnce(null) // global config
      .mockReturnValueOnce({ memory: { docsDir: "custom/mem" } }); // local config

    const result = resolveMemoryDir();
    expect(result).toBe("/resolved/custom/mem");
  });

  it("uses top-level config.docsDir + '/memory' when memory.docsDir is not set", () => {
    mockReadJson
      .mockReturnValueOnce(null) // global config
      .mockReturnValueOnce({ docsDir: "documentation" }); // local config

    const result = resolveMemoryDir();
    expect(result).toBe("/resolved/documentation/memory");
  });

  it("prefers memory.docsDir over top-level docsDir", () => {
    mockReadJson
      .mockReturnValueOnce(null) // global config
      .mockReturnValueOnce({
        docsDir: "documentation",
        memory: { docsDir: "my-memories" },
      }); // local config

    const result = resolveMemoryDir();
    expect(result).toBe("/resolved/my-memories");
  });

  it("does NOT return docs/learn/memory (the bug)", () => {
    mockReadJson.mockReturnValue(null);

    const result = resolveMemoryDir();
    expect(result).not.toContain("docs/learn");
  });
});
