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
import {
  getConfigJsonSchema,
  loadConfig,
  resolveMemoryDir,
  resolveProjectMemoryDir,
  sanitizeRawConfig,
} from "../config.js";
import { resolveMainRepoRoot } from "../project-root.js";
import { log } from "../log.js";
import { DEFAULT_CONFIG } from "../../types.js";

const mockReadJson = vi.mocked(readJson);
const mockResolveMainRepoRoot = vi.mocked(resolveMainRepoRoot);

beforeEach(() => {
  vi.resetAllMocks();
});

// Characterization: locks the warning order/text and return values of
// loadConfig and sanitizeRawConfig as they were with z.strictObject.
// Do NOT edit these expectations.
describe("config validation characterization", () => {
  const mixed = () => ({
    autoApprove: "yes",
    langauge: "vi",
    review: { withCodex: true, bogusKey: 1, maxRounds: 0 },
    autoApproveCodex: true,
    zzzUnknown: 42,
    planAuto: "x",
    tdd: "no",
    docsDir: "documentation",
  });
  const unknownOnly = () => ({
    autoApproveCodex: true,
    review: { extra: 1, withGrok: true },
    memory: { daemon: { idleTimeout: 30 }, autoCapture: true },
    tdd: true,
  });

  it("loadConfig: mixed invalid values + unknown top-level/review keys + renamed key", () => {
    mockReadJson.mockReturnValueOnce(null).mockReturnValueOnce(mixed());

    const config = loadConfig();
    expect(vi.mocked(log.warn).mock.calls).toEqual([
      [
        "Config: tdd — Invalid input: expected boolean, received string. Using default.",
      ],
      [
        "Config: review.maxRounds — Too small: expected number to be >=1. Using default.",
      ],
      ["Unknown config key 'review.bogusKey'."],
      [
        "Config: autoApprove — Invalid input: expected boolean, received string. Using default.",
      ],
      [
        "Config: planAuto — Invalid input: expected boolean, received string. Using default.",
      ],
      ["Unknown config key 'langauge'. Did you mean 'language'?"],
      [
        "Unknown config key 'autoApproveCodex'. It was replaced by 'autoApprove' — set that instead.",
      ],
      ["Unknown config key 'zzzUnknown'."],
    ]);
    expect(config).toEqual({
      language: "en",
      docsDir: "documentation",
      learn: DEFAULT_CONFIG.learn,
      review: { withCodex: true },
    });
  });

  it("sanitizeRawConfig: mixed config warns with review then top-level unknown keys and returns raw", () => {
    const raw = mixed();
    const result = sanitizeRawConfig(raw);
    expect(result).toBe(raw);
    expect(result).toEqual(mixed());
    expect(vi.mocked(log.warn).mock.calls).toEqual([
      [
        "sanitizeRawConfig: unrecognized config keys: bogusKey, langauge, autoApproveCodex, zzzUnknown — returning raw config",
      ],
    ]);
  });

  it("loadConfig: unknown keys only (otherwise valid) keeps nested extras via the strip path", () => {
    mockReadJson.mockReturnValueOnce(null).mockReturnValueOnce(unknownOnly());

    const config = loadConfig();
    expect(vi.mocked(log.warn).mock.calls).toEqual([
      ["Unknown config key 'review.extra'."],
      [
        "Unknown config key 'autoApproveCodex'. It was replaced by 'autoApprove' — set that instead.",
      ],
    ]);
    expect(config).toEqual({
      language: "en",
      docsDir: "docs",
      learn: DEFAULT_CONFIG.learn,
      review: { withGrok: true },
      memory: { daemon: { idleTimeout: 30 }, autoCapture: true },
      tdd: true,
    });
  });

  it("sanitizeRawConfig: unknown keys only warns and returns raw", () => {
    const raw = unknownOnly();
    const result = sanitizeRawConfig(raw);
    expect(result).toBe(raw);
    expect(result).toEqual(unknownOnly());
    expect(vi.mocked(log.warn).mock.calls).toEqual([
      [
        "sanitizeRawConfig: unrecognized config keys: extra, autoApproveCodex — returning raw config",
      ],
    ]);
  });

  it("sanitizeRawConfig: invalid value only warns without a key list and returns raw", () => {
    const raw = { planAuto: "x", language: "vi" };
    const result = sanitizeRawConfig(raw);
    expect(result).toBe(raw);
    expect(vi.mocked(log.warn).mock.calls).toEqual([
      ["sanitizeRawConfig: unrecognized config keys — returning raw config"],
    ]);
  });
});

describe("getConfigJsonSchema", () => {
  function hasAdditionalPropertiesFalse(node: unknown): boolean {
    if (!node || typeof node !== "object") return false;
    for (const [key, value] of Object.entries(node)) {
      if (key === "additionalProperties" && value === false) return true;
      if (hasAdditionalPropertiesFalse(value)) return true;
    }
    return false;
  }

  it("never forbids additional properties anywhere", () => {
    expect(hasAdditionalPropertiesFalse(getConfigJsonSchema())).toBe(false);
  });

  it("includes projectRegistry", () => {
    const schema = getConfigJsonSchema() as {
      properties: Record<string, unknown>;
    };
    expect(schema.properties.projectRegistry).toEqual({ type: "boolean" });
  });
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

  it("warns on the removed autoApproveAgy key", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ autoApproveAgy: true });

    const config = loadConfig();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("autoApproveAgy"),
    );
    expect(
      (config as Record<string, unknown>)["autoApproveAgy"],
    ).toBeUndefined();
  });

  it("points autoApproveCodex at the shared autoApprove key", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ autoApproveCodex: true });

    const config = loadConfig();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("autoApprove"),
    );
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("autoApproveCodex"),
    );
    expect(
      (config as Record<string, unknown>)["autoApproveCodex"],
    ).toBeUndefined();
  });

  it("accepts autoApproveLLM as a valid config key (boolean)", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ autoApproveLLM: true });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.autoApproveLLM).toBe(true);
  });

  it("accepts privacyBlock as a valid config key (boolean)", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ privacyBlock: false });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.privacyBlock).toBe(false);
  });

  it("accepts scoutBlock as a valid config key (boolean)", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ scoutBlock: false });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.scoutBlock).toBe(false);
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
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("withCodex"));
    expect(config.review?.withCodex).toBeUndefined();
  });

  for (const key of [
    "withClaude",
    "withGrok",
    "withCursor",
    "withGemini",
    "fix",
    "commit",
  ] as const) {
    it(`accepts review.${key} as a valid config key (boolean)`, () => {
      mockReadJson
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({ review: { [key]: true } });

      const config = loadConfig();
      expect(log.warn).not.toHaveBeenCalled();
      expect(config.review?.[key]).toBe(true);
    });

    it(`warns and strips review.${key} when it is the wrong type`, () => {
      mockReadJson
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({ review: { [key]: "yes" } });

      const config = loadConfig();
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining(key));
      expect(config.review?.[key]).toBeUndefined();
    });
  }

  it("accepts review.maxRounds as a valid config key (integer ≥ 1)", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ review: { maxRounds: 5 } });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.review?.maxRounds).toBe(5);
  });

  it("keeps review.withCodex and review.maxRounds when both are set", () => {
    mockReadJson.mockReturnValueOnce(null).mockReturnValueOnce({
      review: { withCodex: true, maxRounds: 8 },
    });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.review?.withCodex).toBe(true);
    expect(config.review?.maxRounds).toBe(8);
  });

  it("warns and strips review.maxRounds when it is the wrong type", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ review: { maxRounds: "five" } });

    const config = loadConfig();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("maxRounds"));
    expect(config.review?.maxRounds).toBeUndefined();
  });

  it("warns and strips review.maxRounds when it is not a positive integer", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ review: { maxRounds: 0 } });

    const config = loadConfig();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("maxRounds"));
    expect(config.review?.maxRounds).toBeUndefined();
  });

  it("accepts review.agentTimeout as a valid config key (positive integer)", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ review: { agentTimeout: 300 } });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.review?.agentTimeout).toBe(300);
  });

  it("accepts review.nativeTimeout as a valid config key (positive integer)", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ review: { nativeTimeout: 600 } });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.review?.nativeTimeout).toBe(600);
  });

  // Zero, negative, fractional and string seconds cannot be enforced as a
  // deadline — each must be reported and dropped, never silently coerced.
  for (const key of ["agentTimeout", "nativeTimeout"] as const) {
    for (const bad of [0, -5, 1.5, "300"]) {
      it(`warns and strips review.${key} when it is ${JSON.stringify(bad)}`, () => {
        mockReadJson
          .mockReturnValueOnce(null)
          .mockReturnValueOnce({ review: { [key]: bad } });

        const config = loadConfig();
        expect(log.warn).toHaveBeenCalledWith(expect.stringContaining(key));
        expect(config.review?.[key]).toBeUndefined();
      });
    }
  }

  it("keeps every review key when all four are set", () => {
    mockReadJson.mockReturnValueOnce(null).mockReturnValueOnce({
      review: {
        withCodex: true,
        maxRounds: 8,
        agentTimeout: 120,
        nativeTimeout: 900,
      },
    });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.review).toEqual({
      withCodex: true,
      maxRounds: 8,
      agentTimeout: 120,
      nativeTimeout: 900,
    });
  });

  it("lets a local review key override global without dropping its siblings", () => {
    mockReadJson
      .mockReturnValueOnce({
        review: { withCodex: true, maxRounds: 3, agentTimeout: 100 },
      })
      .mockReturnValueOnce({ review: { agentTimeout: 200 } });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.review).toEqual({
      withCodex: true,
      maxRounds: 3,
      agentTimeout: 200,
    });
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

  it("accepts planAuto as a valid config key (boolean)", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ planAuto: true });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.planAuto).toBe(true);
  });

  it("warns and strips planAuto when given the wrong type", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ planAuto: "yes" });

    const config = loadConfig();
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("planAuto"));
    expect(config.planAuto).toBeUndefined();
  });

  it("accepts planCommitPerTask as a valid config key (boolean)", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ planCommitPerTask: true });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.planCommitPerTask).toBe(true);
  });

  it("warns and strips planCommitPerTask when given the wrong type", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ planCommitPerTask: "yes" });

    const config = loadConfig();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining("planCommitPerTask"),
    );
    expect(config.planCommitPerTask).toBeUndefined();
  });

  it("accepts a full showcase config (video + poster)", () => {
    const showcase = {
      video: {
        length: "auto",
        aspect: "9:16",
        audio: false,
        languages: ["en", "vi"],
      },
      poster: { size: "1200x630", formats: ["png", "pdf"], languages: ["en"] },
    };
    mockReadJson.mockReturnValueOnce(null).mockReturnValueOnce({ showcase });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.showcase).toEqual(showcase);
  });

  it("accepts showcase.video.length as a positive integer of seconds", () => {
    mockReadJson
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ showcase: { video: { length: 45 } } });

    const config = loadConfig();
    expect(log.warn).not.toHaveBeenCalled();
    expect(config.showcase?.video?.length).toBe(45);
  });

  // Each bad value must be reported and dropped, never silently kept.
  const badShowcase: Array<{
    name: string;
    showcase: Record<string, unknown>;
    key: string;
    get: (c: ReturnType<typeof loadConfig>) => unknown;
  }> = [
    {
      name: "video.length is 0",
      showcase: { video: { length: 0 } },
      key: "length",
      get: (c) => c.showcase?.video?.length,
    },
    {
      name: 'video.length is "long"',
      showcase: { video: { length: "long" } },
      key: "length",
      get: (c) => c.showcase?.video?.length,
    },
    {
      name: 'video.aspect is "4:3"',
      showcase: { video: { aspect: "4:3" } },
      key: "aspect",
      get: (c) => c.showcase?.video?.aspect,
    },
    {
      name: "poster.formats is empty",
      showcase: { poster: { formats: [] } },
      key: "formats",
      get: (c) => c.showcase?.poster?.formats,
    },
    {
      name: 'poster.formats contains "gif"',
      showcase: { poster: { formats: ["gif"] } },
      key: "formats",
      get: (c) => c.showcase?.poster?.formats?.[0],
    },
    {
      name: 'poster.size is "huge"',
      showcase: { poster: { size: "huge" } },
      key: "size",
      get: (c) => c.showcase?.poster?.size,
    },
    {
      name: "video has unknown sub-key fps",
      showcase: { video: { fps: 30 } },
      key: "fps",
      get: (c) => (c.showcase?.video as Record<string, unknown>)?.fps,
    },
  ];
  for (const { name, showcase, key, get } of badShowcase) {
    it(`warns and strips showcase when ${name}`, () => {
      mockReadJson.mockReturnValueOnce(null).mockReturnValueOnce({ showcase });

      const config = loadConfig();
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining(key));
      expect(get(config)).toBeUndefined();
    });
  }
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
