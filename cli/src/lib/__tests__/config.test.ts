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

vi.mock("../project-root.js", () => ({
  resolveMainRepoRoot: vi.fn(),
}));

import { readJson } from "../json.js";
import { loadConfig, resolveMemoryDir, resolveProjectMemoryDir, sanitizeRawConfig } from "../config.js";
import { resolveMainRepoRoot } from "../project-root.js";
import { log } from "../log.js";

const mockReadJson = vi.mocked(readJson);
const mockResolveMainRepoRoot = vi.mocked(resolveMainRepoRoot);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("sanitizeRawConfig", () => {
  it("returns valid parsed config when all keys are known", () => {
    const raw = { language: "en", docsDir: "docs" };
    const result = sanitizeRawConfig(raw);
    expect(result).toEqual({ language: "en", docsDir: "docs" });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("returns original raw config and warns when there is an unknown top-level key (parse fails)", () => {
    const raw = { unknownTopLevelKey: "some-value" };
    const result = sanitizeRawConfig(raw);
    // Falls back to raw when parsing fails
    expect(result).toBe(raw);
    // Must emit a warning
    expect(log.warn).toHaveBeenCalled();
  });

  it("includes the unrecognized key name in the warning message", () => {
    const raw = { weirdUnknownKey: 123 };
    sanitizeRawConfig(raw);
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("weirdUnknownKey"),
    );
  });
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

  it("strips memory.daemon.idleTimeout — not a supported config field", () => {
    mockReadJson
      .mockReturnValueOnce(null) // global
      .mockReturnValueOnce({
        memory: { daemon: { idleTimeout: 30 } },
      }); // local

    const config = loadConfig();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((config.memory as any)?.daemon).toBeUndefined();
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

  it("warns and strips legacy codex block (migration: users who had codex config)", () => {
    mockReadJson.mockReturnValueOnce(null).mockReturnValueOnce({
      codex: { enabled: true, modes: ["STANDARD", "DEEP"], effort: "medium" },
    });
    const config = loadConfig();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("codex"));
    expect((config as Record<string, unknown>)["codex"]).toBeUndefined();
  });

  it("accepts review.withCodex as a valid config key (boolean)", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ review: { withCodex: true } });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.review?.withCodex).toBe(true);
  });

  it("warns and strips review.withCodex when it is the wrong type", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ review: { withCodex: "yes" } });

    const config = loadConfig();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("withCodex"),
    );
    expect(config.review?.withCodex).toBeUndefined();
  });

  it("accepts disableGUIPlan as a valid config key (boolean)", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ disableGUIPlan: true });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.disableGUIPlan).toBe(true);
  });

  it("accepts guiPlanFormat as a valid config key (enum 'md')", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ guiPlanFormat: "md" });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.guiPlanFormat).toBe("md");
  });

  it("warns and strips guiPlanFormat when given an invalid enum value", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ guiPlanFormat: "pdf" });

    const config = loadConfig();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("guiPlanFormat"),
    );
    expect(config.guiPlanFormat).toBeUndefined();
  });

  it("warns and strips disableGUIPlan when given the wrong type", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ disableGUIPlan: "yes" });

    const config = loadConfig();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("disableGUIPlan"),
    );
    expect(config.disableGUIPlan).toBeUndefined();
  });
});

describe("resolveProjectMemoryDir", () => {
  it("uses config docsDir when .coding-friend/config.json has docsDir set", () => {
    const root = "/tmp/myproject";
    mockResolveMainRepoRoot.mockReturnValue(root);
    mockReadJson.mockReturnValue({ docsDir: "documentation" });

    const result = resolveProjectMemoryDir("/tmp/myproject/worktree");
    expect(result).toBe(`${root}/documentation/memory`);
  });

  it("falls back to docs/memory when .coding-friend/config.json is missing", () => {
    const root = "/tmp/myproject";
    mockResolveMainRepoRoot.mockReturnValue(root);
    mockReadJson.mockReturnValue(null);

    const result = resolveProjectMemoryDir("/tmp/myproject");
    expect(result).toBe(`${root}/docs/memory`);
  });

  it("falls back to docs/memory when config exists but docsDir is absent", () => {
    const root = "/tmp/myproject";
    mockResolveMainRepoRoot.mockReturnValue(root);
    mockReadJson.mockReturnValue({});

    const result = resolveProjectMemoryDir("/tmp/myproject");
    expect(result).toBe(`${root}/docs/memory`);
  });

  it("uses absolute docsDir as-is without prepending root", () => {
    const root = "/tmp/myproject";
    mockResolveMainRepoRoot.mockReturnValue(root);
    mockReadJson.mockReturnValue({ docsDir: "/absolute/docs" });

    const result = resolveProjectMemoryDir("/tmp/myproject");
    expect(result).toBe("/absolute/docs/memory");
  });

  it("calls resolveMainRepoRoot with the provided baseDir", () => {
    const root = "/tmp/myproject";
    mockResolveMainRepoRoot.mockReturnValue(root);
    mockReadJson.mockReturnValue(null);

    resolveProjectMemoryDir("/some/base/dir");
    expect(mockResolveMainRepoRoot).toHaveBeenCalledWith("/some/base/dir");
  });
});
