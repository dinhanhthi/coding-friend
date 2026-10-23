import {
  describe,
  it,
  expect,
  vi,
  afterEach,
  beforeAll,
  afterAll,
} from "vitest";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { fileURLToPath } from "url";

const fake = vi.hoisted(() => ({ missing: new Set<string>() }));

vi.mock("../../exec.js", () => ({
  commandExists: (bin: string) => !fake.missing.has(bin),
  run: () => "codex-cli 999.0.0",
}));

import {
  binaryVersion as reexported,
  eligibleProviders,
  providerIneligibility,
} from "../providers/eligible.js";
import { binaryVersion, tempDirRoots } from "../providers/version.js";
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

const saved = {
  claude: PROVIDERS.claude,
  codex: PROVIDERS.codex,
  opencode: PROVIDERS.opencode,
};

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
  PROVIDERS.opencode = saved.opencode;
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

describe("opencode eligibility (C3a)", () => {
  // The real caps; preflight replaced so no opencode binary ever runs.
  const preflight = vi.fn(() => undefined);
  const useOpencode = () => {
    PROVIDERS.opencode = { ...saved.opencode, preflight };
    preflight.mockClear();
  };

  it("a writer task → USAGE (read-only worker), before any probe", () => {
    useOpencode();
    const refused = providerIneligibility("opencode", {
      ...git(false),
      models: { opencode: "m-1" },
    });
    expect(refused).toEqual({
      code: "USAGE",
      message: "opencode cannot run writer tasks",
    });
    expect(preflight).not.toHaveBeenCalled();
  });

  it("a read-only task without a model → USAGE naming task.models.opencode, before any probe", () => {
    useOpencode();
    const refused = providerIneligibility("opencode", git(true));
    expect(refused?.code).toBe("USAGE");
    expect(refused?.message).toContain("task.models.opencode");
    expect(preflight).not.toHaveBeenCalled();
    expect(
      providerIneligibility("opencode", {
        ...git(true),
        models: { opencode: "m-1" },
      }),
    ).toBeUndefined();
    expect(preflight).toHaveBeenCalledTimes(1);
  });
});

describe("binaryVersion (providers/version.ts)", () => {
  let dir: string;
  /** A fake binary: a POSIX sh script. */
  const fakeBin = (name: string, body: string): string => {
    const file = join(dir, name);
    writeFileSync(file, `#!/bin/sh\n${body}\n`);
    chmodSync(file, 0o755);
    return file;
  };

  beforeAll(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), "cf-version-")));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it.each([
    ["opencode v2.0.13", "2.0.13"],
    ["2026.10.22-27dcf5f", "2026.10.22"],
    ["grok 1.0.46 (2765805b9442) [stable]", "1.0.46"],
    ["1.0.46", "1.0.46"],
  ])("%s → %s", (output, version) => {
    const bin = fakeBin("echo-out", 'printf "%s\\n" "$FAKE_OUT"');
    expect(binaryVersion(bin, { env: { FAKE_OUT: output } })).toBe(version);
  });

  it("opts.env reaches the --version child", () => {
    const bin = fakeBin("echo-env", 'printf "%s\\n" "$CURSOR_CONFIG_DIR"');
    expect(binaryVersion(bin, { env: { CURSOR_CONFIG_DIR: "9.8.7" } })).toBe(
      "9.8.7",
    );
  });

  it("opts.args follow --version; without them only --version", () => {
    const bin = fakeBin(
      "echo-args",
      'case "$*" in "--version") echo 1.0.0 ;; "--version --no-auto-update") echo 2.0.0 ;; esac',
    );
    expect(binaryVersion(bin)).toBe("1.0.0");
    expect(binaryVersion(bin, { args: ["--no-auto-update"] })).toBe("2.0.0");
  });

  it("runs in tmpdir(), never the caller's cwd", () => {
    const want = realpathSync(tmpdir());
    const bin = fakeBin(
      "echo-cwd",
      `[ "$(pwd -P)" = "${want}" ] && echo 3.3.3`,
    );
    expect(binaryVersion(bin)).toBe("3.3.3");
  });

  it("a missing binary or no version → undefined", () => {
    expect(binaryVersion(join(dir, "missing"))).toBeUndefined();
    expect(binaryVersion(fakeBin("no-version", "echo none"))).toBeUndefined();
  });

  it("eligible.ts re-exports the same function", () => {
    expect(reexported).toBe(binaryVersion);
  });

  it("version.ts is a leaf: no providers/index, eligible or adapter import", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../providers/version.ts", import.meta.url)),
      "utf-8",
    );
    const local = [...src.matchAll(/from\s+["'](\.[^"']*)["']/g)].map(
      (m) => m[1],
    );
    for (const spec of local) {
      expect(["../../exec.js", "../../host.js"]).toContain(spec);
    }
  });
});

describe("tempDirRoots", () => {
  it("realpaths, no duplicates, missing entries dropped, $TMPDIR included", () => {
    const extra = realpathSync(mkdtempSync(join(tmpdir(), "cf-tmproot-")));
    try {
      const roots = tempDirRoots({ TMPDIR: `${extra}/` });
      expect(roots).toContain(extra);
      expect(roots).toContain(realpathSync("/tmp"));
      expect(new Set(roots).size).toBe(roots.length);
      for (const r of roots) expect(realpathSync(r)).toBe(r);
      if (process.platform === "darwin") {
        expect(roots).toContain("/private/tmp");
        expect(roots).not.toContain("/tmp");
      }
      expect(tempDirRoots({ TMPDIR: join(extra, "missing") })).not.toContain(
        join(extra, "missing"),
      );
    } finally {
      rmSync(extra, { recursive: true, force: true });
    }
  });
});
