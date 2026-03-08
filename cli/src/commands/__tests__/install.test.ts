import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/exec.js", () => ({
  commandExists: vi.fn(),
  run: vi.fn(),
}));

vi.mock("../../lib/plugin-state.js", () => ({
  isMarketplaceRegistered: vi.fn(),
}));

vi.mock("../../lib/statusline.js", () => ({
  getInstalledVersion: vi.fn(),
}));

vi.mock("../../lib/shell-completion.js", () => ({
  ensureShellCompletion: vi.fn(),
}));

vi.mock("../update.js", () => ({
  getLatestVersion: vi.fn(),
  semverCompare: vi.fn(),
}));

import { commandExists, run } from "../../lib/exec.js";
import { isMarketplaceRegistered } from "../../lib/plugin-state.js";
import { getInstalledVersion } from "../../lib/statusline.js";
import { ensureShellCompletion } from "../../lib/shell-completion.js";
import { installCommand } from "../install.js";

const mockCommandExists = vi.mocked(commandExists);
const mockRun = vi.mocked(run);
const mockIsMarketplaceRegistered = vi.mocked(isMarketplaceRegistered);
const mockGetInstalledVersion = vi.mocked(getInstalledVersion);
const mockEnsureShellCompletion = vi.mocked(ensureShellCompletion);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
});

describe("installCommand", () => {
  it("calls ensureShellCompletion after successful install", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(true);
    mockGetInstalledVersion.mockReturnValue("0.7.2");

    await installCommand();

    expect(mockEnsureShellCompletion).toHaveBeenCalledWith({ silent: false });
  });

  it("calls ensureShellCompletion even when plugin needs installing", async () => {
    mockCommandExists.mockReturnValue(true);
    mockIsMarketplaceRegistered.mockReturnValue(false);
    mockRun.mockReturnValue("ok");
    mockGetInstalledVersion.mockReturnValueOnce(null).mockReturnValueOnce(null);

    await installCommand();

    expect(mockEnsureShellCompletion).toHaveBeenCalledWith({ silent: false });
  });

  it("exits early when claude CLI is missing", async () => {
    mockCommandExists.mockReturnValue(false);
    const mockExit = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await installCommand();

    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
