import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@inquirer/prompts", () => ({
  checkbox: vi.fn(),
  confirm: vi.fn(),
  select: vi.fn(),
}));

vi.mock("../../lib/json.js", () => ({
  readJson: vi.fn(),
  mergeJson: vi.fn(),
}));

vi.mock("../../lib/prompt-utils.js", () => ({
  askScope: vi.fn(),
  resolveHostFlags: vi.fn(),
  getScopeLabel: vi.fn(),
  formatScopeLabel: vi.fn((scope: string) => `[${scope}]`),
  getMergedValue: vi.fn(),
}));

vi.mock("../../lib/permissions.js", () => ({
  STATIC_RULES: [],
  getAllRules: vi.fn(() => []),
  getExistingRules: vi.fn(() => []),
  applyPermissions: vi.fn(),
  groupByCategory: vi.fn(() => new Map()),
  cleanupStalePluginRules: vi.fn(() => 0),
  logPluginScriptWarning: vi.fn(),
  extractTag: vi.fn(),
  runDangerousRulesAudit: vi.fn(),
}));

import { select } from "@inquirer/prompts";
import { mergeJson } from "../../lib/json.js";
import {
  applyPermissions,
  getAllRules,
  getExistingRules,
} from "../../lib/permissions.js";
import { resolveHostFlags } from "../../lib/prompt-utils.js";
import { permissionCommand } from "../permission.js";

const mockMergeJson = vi.mocked(mergeJson);
const mockResolveHostFlags = vi.mocked(resolveHostFlags);
const mockApplyPermissions = vi.mocked(applyPermissions);
const mockGetAllRules = vi.mocked(getAllRules);
const mockGetExistingRules = vi.mocked(getExistingRules);
const mockSelect = vi.mocked(select);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  mockResolveHostFlags.mockReturnValue({ host: "codex" });
  mockGetAllRules.mockReturnValue([]);
  mockGetExistingRules.mockReturnValue([]);
  mockSelect.mockResolvedValue("__apply__");
});

describe("permissionCommand — Codex", () => {
  it("enables Codex auto-approve in local config", async () => {
    await permissionCommand({
      agent: "codex",
      enableAutoApprove: true,
    });

    expect(mockMergeJson).toHaveBeenCalledWith(
      expect.stringContaining(".coding-friend/config.json"),
      { autoApproveCodex: true },
    );
  });

  it("disables Codex auto-approve in local config", async () => {
    await permissionCommand({
      agent: "codex",
      disableAutoApprove: true,
    });

    expect(mockMergeJson).toHaveBeenCalledWith(
      expect.stringContaining(".coding-friend/config.json"),
      { autoApproveCodex: false },
    );
  });

  it("rejects conflicting Codex auto-approve flags", async () => {
    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await permissionCommand({
      agent: "codex",
      enableAutoApprove: true,
      disableAutoApprove: true,
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockMergeJson).not.toHaveBeenCalled();
  });
});

describe("permissionCommand — omp", () => {
  it("prints that omp uses its own approval-mode and points at docs/omp-dev.md", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });

    await permissionCommand({ agent: "omp" });

    const output = vi.mocked(console.log).mock.calls.flat().join("\n");
    expect(output).toContain("approval-mode");
    expect(output).toContain("docs/omp-dev.md");
    expect(output).toContain("omp config");
    expect(output).toContain("does not manage omp permissions");
  });

  it("does not call Claude permission writers", async () => {
    mockResolveHostFlags.mockReturnValue({ host: "omp" });

    await permissionCommand({ agent: "omp" });

    expect(mockGetExistingRules).not.toHaveBeenCalled();
    expect(mockGetAllRules).not.toHaveBeenCalled();
    expect(mockApplyPermissions).not.toHaveBeenCalled();
    expect(mockMergeJson).not.toHaveBeenCalled();
    expect(process.exit).not.toHaveBeenCalled();
  });
});
