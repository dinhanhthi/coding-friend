import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { mergeJson } from "../../lib/json.js";
import { resolveHostFlags } from "../../lib/prompt-utils.js";
import { permissionCommand } from "../permission.js";

const mockMergeJson = vi.mocked(mergeJson);
const mockResolveHostFlags = vi.mocked(resolveHostFlags);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  mockResolveHostFlags.mockReturnValue({ host: "codex" });
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
