import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../statusline.js", () => ({ getInstalledVersion: vi.fn() }));
vi.mock("../codex-config.js", () => ({ getCodexInstalledVersion: vi.fn() }));
vi.mock("../agy-config.js", () => ({ readAgyPluginVersion: vi.fn() }));
vi.mock("../devin-config.js", () => ({ readDevinPluginVersion: vi.fn() }));
vi.mock("../omp-config.js", () => ({ isOmpAgentInstalled: vi.fn() }));

import { collectVersionInfo } from "../version-info.js";
import { CONTRACT_VERSION } from "../output.js";
import { getInstalledVersion } from "../statusline.js";
import { getCodexInstalledVersion } from "../codex-config.js";
import { readAgyPluginVersion } from "../agy-config.js";
import { readDevinPluginVersion } from "../devin-config.js";
import { isOmpAgentInstalled } from "../omp-config.js";

beforeEach(() => {
  vi.mocked(getInstalledVersion).mockReturnValue(null);
  vi.mocked(getCodexInstalledVersion).mockReturnValue(null);
  vi.mocked(readAgyPluginVersion).mockReturnValue(null);
  vi.mocked(readDevinPluginVersion).mockReturnValue(null);
  vi.mocked(isOmpAgentInstalled).mockReturnValue(false);
});

describe("collectVersionInfo", () => {
  it("reports each host's installed version from its helper", () => {
    vi.mocked(getInstalledVersion).mockReturnValue("0.46.0");
    vi.mocked(getCodexInstalledVersion).mockReturnValue("0.45.0");
    vi.mocked(readAgyPluginVersion).mockReturnValue("0.44.0");
    vi.mocked(readDevinPluginVersion).mockReturnValue("0.43.0");
    vi.mocked(isOmpAgentInstalled).mockImplementation(
      (scope) => scope === "project",
    );

    expect(collectVersionInfo("1.42.0")).toEqual({
      cli: "1.42.0",
      contractVersion: CONTRACT_VERSION,
      hosts: {
        claude: { installed: true, version: "0.46.0" },
        codex: { installed: true, version: "0.45.0" },
        omp: { installed: true, version: null },
        agy: { installed: true, version: "0.44.0" },
        devin: { installed: true, version: "0.43.0" },
      },
    });
  });

  it("marks hosts without a version as not installed", () => {
    const info = collectVersionInfo("1.42.0");
    for (const host of Object.values(info.hosts)) {
      expect(host).toEqual({ installed: false, version: null });
    }
  });

  it("treats a throwing helper as not installed", () => {
    vi.mocked(getCodexInstalledVersion).mockImplementation(() => {
      throw new Error("boom");
    });
    vi.mocked(isOmpAgentInstalled).mockImplementation(() => {
      throw new Error("boom");
    });
    vi.mocked(getInstalledVersion).mockReturnValue("0.46.0");

    const info = collectVersionInfo("1.42.0");
    expect(info.hosts.codex).toEqual({ installed: false, version: null });
    expect(info.hosts.omp).toEqual({ installed: false, version: null });
    expect(info.hosts.claude).toEqual({ installed: true, version: "0.46.0" });
  });
});
