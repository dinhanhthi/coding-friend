import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../exec.js", () => ({
  commandExists: vi.fn(),
  run: vi.fn(),
}));

import {
  checkCodexVersion,
  checkOmpVersion,
  compareVersions,
  detectHostsAvailable,
  extractVersion,
  getCodexMinVersion,
  getOmpMinVersion,
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

    expect(detectHostsAvailable()).toEqual(["claude", "codex", "omp"]);
  });

  it("returns omp when only omp is installed", () => {
    mockCommandExists.mockImplementation((cmd) => cmd === "omp");

    expect(detectHostsAvailable()).toEqual(["omp"]);
  });

  it("returns claude and omp in canonical order when codex is missing", () => {
    mockCommandExists.mockImplementation(
      (cmd) => cmd === "claude" || cmd === "omp",
    );

    expect(detectHostsAvailable()).toEqual(["claude", "omp"]);
  });

  it("returns codex and omp in canonical order when claude is missing", () => {
    mockCommandExists.mockImplementation(
      (cmd) => cmd === "codex" || cmd === "omp",
    );

    expect(detectHostsAvailable()).toEqual(["codex", "omp"]);
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

  it("resolves --agent omp", () => {
    expect(resolveHost({ agent: "omp" })).toBe("omp");
  });

  it("resolves --omp alias", () => {
    expect(resolveHost({ omp: true })).toBe("omp");
  });

  it("allows --agent omp with --omp alias", () => {
    expect(resolveHost({ agent: "omp", omp: true })).toBe("omp");
  });

  it("rejects unknown agents listing all valid hosts", () => {
    expect(() => resolveHost({ agent: "unknown" })).toThrow(
      'Unsupported agent "unknown". Use "claude", "codex", or "omp".',
    );
  });

  it("rejects conflicting --agent claude and --omp", () => {
    expect(() => resolveHost({ agent: "claude", omp: true })).toThrow(
      "Use either --agent claude or --omp, not both.",
    );
  });

  it("rejects conflicting --agent codex and --omp", () => {
    expect(() => resolveHost({ agent: "codex", omp: true })).toThrow(
      "Use either --agent codex or --omp, not both.",
    );
  });

  it("rejects conflicting --agent omp and --codex", () => {
    expect(() => resolveHost({ agent: "omp", codex: true })).toThrow(
      "Use either --agent omp or --codex, not both.",
    );
  });

  it("rejects conflicting --codex and --omp aliases", () => {
    expect(() => resolveHost({ codex: true, omp: true })).toThrow(
      "Use either --codex or --omp, not both.",
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

  it("returns the locked omp minimum", () => {
    expect(getOmpMinVersion()).toBe("0.1.0");
  });

  it("passes when omp is at the minimum", () => {
    mockRun.mockReturnValue("omp 0.1.0");

    expect(checkOmpVersion()).toEqual({
      ok: true,
      actual: "0.1.0",
      min: "0.1.0",
    });
    expect(mockRun).toHaveBeenCalledWith("omp", ["--version"]);
  });

  it("fails when omp is too old", () => {
    mockRun.mockReturnValue("omp 0.0.9");

    expect(checkOmpVersion()).toEqual({
      ok: false,
      actual: "0.0.9",
      min: "0.1.0",
    });
  });

  it("fails when omp is missing", () => {
    mockRun.mockReturnValue(null);

    expect(checkOmpVersion()).toEqual({
      ok: false,
      actual: undefined,
      min: "0.1.0",
    });
  });
});
