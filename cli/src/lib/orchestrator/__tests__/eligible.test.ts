import { describe, it, expect, vi, afterEach } from "vitest";

const fake = vi.hoisted(() => ({ missing: new Set<string>() }));

vi.mock("../../exec.js", () => ({
  commandExists: (bin: string) => !fake.missing.has(bin),
  run: () => "codex-cli 999.0.0",
}));

import {
  eligibleProviders,
  providerIneligibility,
} from "../providers/eligible.js";
import {
  PROVIDERS,
  type ProviderAdapter,
  type ProviderRequest,
} from "../providers/index.js";

const checkout = "/repo";
const git = (readOnly: boolean): ProviderRequest => ({
  isGitRepo: true,
  readOnly,
  checkout,
});

const saved = { claude: PROVIDERS.claude, codex: PROVIDERS.codex };

/** Swap in a fake claude adapter with these caps / preflight. */
function fakeClaude(over: Partial<ProviderAdapter>): ProviderAdapter {
  const adapter: ProviderAdapter = {
    ...saved.claude,
    bin: "fake-claude",
    caps: { ...saved.claude.caps },
    ...over,
  };
  PROVIDERS.claude = adapter;
  return adapter;
}

afterEach(() => {
  PROVIDERS.claude = saved.claude;
  PROVIDERS.codex = saved.codex;
  fake.missing.clear();
});

describe("eligibleProviders", () => {
  it("excludes codex outside a git checkout", () => {
    const nonGit = { isGitRepo: false, readOnly: true, checkout };
    expect(eligibleProviders(nonGit, ["claude", "codex"])).toEqual(["claude"]);
    expect(eligibleProviders(git(true), ["claude", "codex"])).toEqual([
      "claude",
      "codex",
    ]);
  });

  it("filters on capability and probes only the candidates", () => {
    fakeClaude({ caps: { ...saved.claude.caps, writer: false } });
    const preflight = vi.fn(() => undefined);
    PROVIDERS.codex = { ...saved.codex, preflight };

    expect(eligibleProviders(git(false), ["claude", "codex"])).toEqual([
      "codex",
    ]);
    expect(preflight).toHaveBeenCalledTimes(1);

    // codex is not a candidate (not in fallback, not current): never probed.
    preflight.mockClear();
    expect(eligibleProviders(git(true), ["claude"])).toEqual(["claude"]);
    expect(preflight).toHaveBeenCalledTimes(0);
  });
});

describe("providerIneligibility", () => {
  it("binary not on PATH → PROVIDER_UNAVAILABLE", () => {
    fakeClaude({});
    fake.missing.add("fake-claude");
    expect(providerIneligibility("claude", git(true))).toMatchObject({
      code: "PROVIDER_UNAVAILABLE",
    });
  });

  it("writer task on a provider without caps.writer → USAGE", () => {
    fakeClaude({ caps: { ...saved.claude.caps, writer: false } });
    expect(providerIneligibility("claude", git(false))).toMatchObject({
      code: "USAGE",
    });
    expect(providerIneligibility("claude", git(true))).toBeUndefined();
  });

  it("outside git, a provider without caps.nonGitReadOnly → USAGE", () => {
    fakeClaude({ caps: { ...saved.claude.caps, nonGitReadOnly: false } });
    const req = { isGitRepo: false, readOnly: true, checkout };
    expect(providerIneligibility("claude", req)).toMatchObject({
      code: "USAGE",
    });
  });

  it("caps.needsModel without a model → USAGE naming task.models and --model", () => {
    fakeClaude({ caps: { ...saved.claude.caps, needsModel: true } });
    const refused = providerIneligibility("claude", git(true));
    expect(refused?.code).toBe("USAGE");
    expect(refused?.message).toContain("task.models.claude");
    expect(refused?.message).toContain("--model");
    expect(
      providerIneligibility("claude", {
        ...git(true),
        models: { claude: "m-1" },
      }),
    ).toBeUndefined();
  });

  it("preflight refusal → the preflight's own code", () => {
    fakeClaude({
      preflight: () => ({ code: "PROVIDER_UNAVAILABLE", message: "too new" }),
    });
    expect(providerIneligibility("claude", git(true))).toEqual({
      code: "PROVIDER_UNAVAILABLE",
      message: "too new",
    });
  });
});
