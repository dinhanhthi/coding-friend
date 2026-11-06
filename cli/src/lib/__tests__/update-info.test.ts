import { describe, it, expect, vi, beforeEach } from "vitest";

// No importOriginal: the real update.ts imports update-info.ts back (cycle).
vi.mock("../../commands/update.js", () => ({
  semverCompare: (a: string, b: string) =>
    a.localeCompare(b, undefined, { numeric: true }),
  getCliVersion: vi.fn(),
  getLatestVersion: vi.fn(),
  getLatestCliVersion: vi.fn(),
  isCliGlobalLinked: vi.fn(),
  getStatuslineVersion: vi.fn(),
}));

vi.mock("../version-info.js", () => ({
  collectVersionInfo: vi.fn(),
}));

import {
  getCliVersion,
  getLatestCliVersion,
  getLatestVersion,
  getStatuslineVersion,
  isCliGlobalLinked,
} from "../../commands/update.js";
import { collectVersionInfo } from "../version-info.js";
import { collectUpdateCheck } from "../update-info.js";

const notInstalled = { installed: false, version: null };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCliVersion).mockReturnValue("1.0.0");
  vi.mocked(isCliGlobalLinked).mockReturnValue(false);
  vi.mocked(getStatuslineVersion).mockReturnValue("0.45.0");
  vi.mocked(collectVersionInfo).mockReturnValue({
    cli: "1.0.0",
    contractVersion: 1,
    hosts: {
      claude: { installed: true, version: "0.45.0" },
      codex: { installed: true, version: "0.46.0" },
      omp: { installed: true, version: null },
      agy: notInstalled,
      devin: notInstalled,
    },
  });
});

describe("collectUpdateCheck", () => {
  it("compares the CLI and each host against the latest releases", () => {
    vi.mocked(getLatestCliVersion).mockReturnValue("1.2.0");
    vi.mocked(getLatestVersion).mockReturnValue("0.46.0");

    expect(collectUpdateCheck()).toEqual({
      cli: {
        current: "1.0.0",
        latest: "1.2.0",
        updateAvailable: true,
        linked: false,
      },
      plugin: { latest: "0.46.0" },
      hosts: [
        {
          host: "claude",
          installed: true,
          current: "0.45.0",
          updateAvailable: true,
        },
        {
          host: "codex",
          installed: true,
          current: "0.46.0",
          updateAvailable: false,
        },
        { host: "omp", installed: true, current: null, updateAvailable: null },
        { host: "agy", installed: false, current: null, updateAvailable: null },
        {
          host: "devin",
          installed: false,
          current: null,
          updateAvailable: null,
        },
      ],
      statusline: { current: "0.45.0" },
    });
  });

  it("reports null latest and unknown availability when the network fails", () => {
    vi.mocked(getLatestCliVersion).mockReturnValue(null);
    vi.mocked(getLatestVersion).mockReturnValue(null);

    const result = collectUpdateCheck("9.9.9");

    expect(result.cli).toEqual({
      current: "9.9.9",
      latest: null,
      updateAvailable: null,
      linked: false,
    });
    expect(result.plugin.latest).toBeNull();
    expect(result.hosts.every((h) => h.updateAvailable === null)).toBe(true);
    expect(collectVersionInfo).toHaveBeenCalledWith("9.9.9");
  });
});
