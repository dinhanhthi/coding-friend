import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../exec.js", () => ({
  commandExists: vi.fn(),
  run: vi.fn(),
}));

import {
  checkCodexVersion,
  compareVersions,
  detectHostsAvailable,
  extractVersion,
  getCodexMinVersion,
  resolveHost,
} from "../host.js";
import { commandExists, run } from "../exec.js";

const mockCommandExists = vi.mocked(commandExists);
const mockRun = vi.mocked(run);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("detectHostsAvailable", () => {
  it("returns available hosts in default order", () => {
    mockCommandExists.mockImplementation((cmd) => cmd === "claude");

    expect(detectHostsAvailable()).toEqual(["claude"]);
    expect(mockCommandExists).toHaveBeenCalledWith("claude");
    expect(mockCommandExists).toHaveBeenCalledWith("codex");
  });

  it("includes codex when installed", () => {
    mockCommandExists.mockReturnValue(true);

    expect(detectHostsAvailable()).toEqual(["claude", "codex"]);
  });
});

describe("resolveHost", () => {
  it("defaults to claude", () => {
    expect(resolveHost({})).toBe("claude");
  });

  it("resolves --agent codex", () => {
    expect(resolveHost({ agent: "codex" })).toBe("codex");
  });

  it("resolves --codex alias", () => {
    expect(resolveHost({ codex: true })).toBe("codex");
  });

  it("allows --agent codex with --codex alias", () => {
    expect(resolveHost({ agent: "codex", codex: true })).toBe("codex");
  });

  it("rejects unknown agents", () => {
    expect(() => resolveHost({ agent: "cursor" })).toThrow(
      'Unsupported agent "cursor"',
    );
  });

  it("rejects conflicting --agent claude and --codex", () => {
    expect(() => resolveHost({ agent: "claude", codex: true })).toThrow(
      "Use either --agent claude or --codex",
    );
  });
});

describe("version helpers", () => {
  it("returns the locked Codex minimum", () => {
    expect(getCodexMinVersion()).toBe("0.130.0");
  });

  it("extracts semver from Codex output", () => {
    expect(extractVersion("codex-cli 0.130.0")).toBe("0.130.0");
  });

  it("compares versions numerically", () => {
    expect(compareVersions("0.130.0", "0.130.0")).toBe(0);
    expect(compareVersions("0.131.0", "0.130.9")).toBe(1);
    expect(compareVersions("0.129.9", "0.130.0")).toBe(-1);
  });

  it("passes when codex is at the minimum", () => {
    mockRun.mockReturnValue("codex-cli 0.130.0");

    expect(checkCodexVersion()).toEqual({
      ok: true,
      actual: "0.130.0",
      min: "0.130.0",
    });
  });

  it("fails when codex is too old", () => {
    mockRun.mockReturnValue("codex-cli 0.129.0");

    expect(checkCodexVersion()).toEqual({
      ok: false,
      actual: "0.129.0",
      min: "0.130.0",
    });
  });

  it("fails when codex is missing", () => {
    mockRun.mockReturnValue(null);

    expect(checkCodexVersion()).toEqual({
      ok: false,
      actual: undefined,
      min: "0.130.0",
    });
  });
});
