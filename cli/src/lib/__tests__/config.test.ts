import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../json.js", () => ({
  readJson: vi.fn(),
}));

vi.mock("../paths.js", () => ({
  localConfigPath: vi.fn(() => "/project/.coding-friend/config.json"),
  globalConfigPath: vi.fn(() => "/home/user/.coding-friend/config.json"),
  resolvePath: vi.fn((p: string) => `/resolved/${p}`),
}));

vi.mock("../log.js", () => ({
  log: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    dim: vi.fn(),
  },
}));

import { readJson } from "../json.js";
import { loadConfig, resolveMemoryDir } from "../config.js";
import { log } from "../log.js";

const mockReadJson = vi.mocked(readJson);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("loadConfig", () => {
  it("deep merges nested objects (local memory.autoCapture + global memory.embedding)", () => {
    mockReadJson
      .mockReturnValueOnce({
        memory: {
          embedding: { provider: "ollama", model: "nomic-embed-text" },
        },
      }) // global config
      .mockReturnValueOnce({
        memory: { autoCapture: true },
      }); // local config

    const config = loadConfig();
    expect(config.memory?.autoCapture).toBe(true);
    expect(config.memory?.embedding?.provider).toBe("ollama");
    expect(config.memory?.embedding?.model).toBe("nomic-embed-text");
  });

  it("local values override global values at the same nested key", () => {
    mockReadJson
      .mockReturnValueOnce({
        memory: {
          embedding: { provider: "transformers", model: "old-model" },
        },
      }) // global config
      .mockReturnValueOnce({
        memory: {
          embedding: { model: "new-model" },
        },
      }); // local config

    const config = loadConfig();
    expect(config.memory?.embedding?.model).toBe("new-model");
    expect(config.memory?.embedding?.provider).toBe("transformers");
  });

  it("deep merges learn config", () => {
    mockReadJson
      .mockReturnValueOnce({
        learn: { language: "en", outputDir: "/global/learn" },
      }) // global
      .mockReturnValueOnce({
        learn: { language: "vi" },
      }); // local

    const config = loadConfig();
    expect(config.learn?.language).toBe("vi");
    expect(config.learn?.outputDir).toBe("/global/learn");
  });
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

  it("uses top-level config.docsDir + '/memory'", () => {
    mockReadJson
      .mockReturnValueOnce(null) // global config
      .mockReturnValueOnce({ docsDir: "documentation" }); // local config

    const result = resolveMemoryDir();
    expect(result).toBe("/resolved/documentation/memory");
  });

  it("does NOT return docs/learn/memory (the bug)", () => {
    mockReadJson.mockReturnValue(null);

    const result = resolveMemoryDir();
    expect(result).not.toContain("docs/learn");
  });
});

describe("loadConfig validation", () => {
  it("warns and uses default when autoApprove is wrong type (string instead of boolean)", () => {
    mockReadJson
      .mockReturnValueOnce(null) // global
      .mockReturnValueOnce({ autoApprove: "yes" }); // local — invalid

    const config = loadConfig();
    // Should warn about invalid type
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("autoApprove"),
    );
    // Should strip invalid value (not in defaults, so undefined)
    expect(config.autoApprove).toBeUndefined();
  });

  it("warns on unknown config keys", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ autoapprove: true }); // typo

    const config = loadConfig();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("autoapprove"),
    );
    // Unknown key should not appear on result
    expect((config as Record<string, unknown>)["autoapprove"]).toBeUndefined();
  });

  it("warns on nested invalid value (memory.autoCapture as string)", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ memory: { autoCapture: "true" } });

    const config = loadConfig();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("autoCapture"),
    );
  });

  it("passes through valid config without warnings", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ autoApprove: true, language: "vi" });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.autoApprove).toBe(true);
    expect(config.language).toBe("vi");
  });

  it("accepts autoApproveIgnore as a valid config key (array of strings)", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ autoApproveIgnore: ["npm test", "npx jest"] });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect((config as Record<string, unknown>)["autoApproveIgnore"]).toEqual([
      "npm test",
      "npx jest",
    ]);
  });

  it("accepts autoApproveAllowExtra as a valid config key (array of strings)", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ autoApproveAllowExtra: ["my-custom-cmd"] });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(
      (config as Record<string, unknown>)["autoApproveAllowExtra"],
    ).toEqual(["my-custom-cmd"]);
  });
});
