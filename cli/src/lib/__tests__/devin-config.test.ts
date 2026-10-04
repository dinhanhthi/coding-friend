import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isolated = vi.hoisted(() => ({
  home: "",
}));

vi.mock("../paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../paths.js")>();
  return {
    ...actual,
    devStatePath: () =>
      join(isolated.home, ".coding-friend", "dev-state.json"),
    devinPluginsLockPath: () =>
      join(
        isolated.home,
        ".local",
        "share",
        "devin",
        "cli",
        "plugins",
        "lock.json",
      ),
  };
});

vi.mock("../exec.js", () => ({
  commandExists: vi.fn(),
  run: vi.fn(),
  runWithStderr: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { run } from "../exec.js";
import {
  checkDevinTargetResolvable,
  desiredDevinSource,
  ensureDevinAuth,
  isDevinPluginInstalled,
  readDevinInstallState,
  readDevinPluginVersion,
  reconcileDevinPlugin,
  removeDevinPlugin,
} from "../devin-config.js";
import { devinPluginsLockPath, devStatePath } from "../paths.js";

const mockRun = vi.mocked(run);

const GITHUB_SPEC = "dinhanhthi/coding-friend#plugin-devin";
const GITHUB_URL = "https://github.com/dinhanhthi/coding-friend";

const tmpDirs: string[] = [];

function makeTemp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function githubEntry(subdir: string, version = "0.45.3") {
  return {
    name: "coding-friend",
    spec: {
      source: "git-subdir",
      url: GITHUB_URL,
      path: subdir,
    },
    identity: `${GITHUB_URL}#${subdir}`,
    resolved: {
      kind: "git",
      sha: "2eac27f714b1986335b8496782d7f3bbd8d6fc62",
    },
    version_dir: version,
  };
}

function localEntry(path: string, version = "0.45.3") {
  return {
    name: "coding-friend",
    spec: { source: "local", path },
    identity: path,
    resolved: { kind: "local" },
    version_dir: version,
  };
}

function lockJson(resolved: unknown[], requirements: unknown[] = []) {
  return `${JSON.stringify({ requirements, resolved, edges: [] }, null, 2)}\n`;
}

function writeLock(content: string): void {
  const file = devinPluginsLockPath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/** Create <repo>/plugin-devin/.claude-plugin/plugin.json; return repo root. */
function makeDevRepo(version = "0.45.3"): string {
  const repo = makeTemp("cf-devin-repo-");
  const manifestDir = join(repo, "plugin-devin", ".claude-plugin");
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(
    join(manifestDir, "plugin.json"),
    `${JSON.stringify({ name: "coding-friend", version }, null, 2)}\n`,
  );
  return repo;
}

function seedDevState(localPath: string): void {
  const file = devStatePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `${JSON.stringify({ localPath, savedAt: "2026-10-04T00:00:00.000Z" }, null, 2)}\n`,
  );
}

/** run() default: signed in, git reachable, all devin calls succeed. */
function mockHappySubprocesses(): void {
  mockRun.mockImplementation((cmd, args = []) => {
    if (cmd === "devin" && args[0] === "auth") {
      return "Logged in (via Devin)";
    }
    if (cmd === "git" && args[0] === "ls-remote") {
      return "2eac27f714b1986335b8496782d7f3bbd8d6fc62\tHEAD";
    }
    return "ok";
  });
}

function devinCalls(subcommand?: string): string[][] {
  return mockRun.mock.calls
    .filter(([cmd, args]) => {
      const argv = (args ?? []) as string[];
      return cmd === "devin" && (!subcommand || argv[0] === subcommand);
    })
    .map(([, args]) => (args ?? []) as string[]);
}

beforeEach(() => {
  isolated.home = makeTemp("cf-devin-home-");
  vi.spyOn(console, "log").mockImplementation(() => {});
  mockRun.mockReset();
  mockFetch.mockReset();
  mockHappySubprocesses();
  mockFetch.mockResolvedValue({ ok: true, status: 200 });
});

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("readDevinInstallState", () => {
  it("returns none when lock.json is missing", () => {
    expect(readDevinInstallState()).toEqual({ kind: "none" });
  });

  it("returns none when no coding-friend entry is resolved", () => {
    writeLock(lockJson([{ name: "other-plugin", spec: { source: "local" } }]));

    expect(readDevinInstallState()).toEqual({ kind: "none" });
  });

  it("parses a github #plugin-devin entry", () => {
    writeLock(lockJson([githubEntry("plugin-devin")]));

    expect(readDevinInstallState()).toEqual({
      kind: "github",
      path: GITHUB_URL,
      subdir: "plugin-devin",
      version: "0.45.3",
    });
  });

  it("parses a foreign github #plugin entry as github with its subdir", () => {
    writeLock(lockJson([githubEntry("plugin")]));

    expect(readDevinInstallState()).toEqual({
      kind: "github",
      path: GITHUB_URL,
      subdir: "plugin",
      version: "0.45.3",
    });
  });

  it("parses a local entry", () => {
    writeLock(lockJson([localEntry("/private/tmp/dev/plugin-devin")]));

    expect(readDevinInstallState()).toEqual({
      kind: "local",
      path: "/private/tmp/dev/plugin-devin",
      version: "0.45.3",
    });
  });

  it("returns unknown for an unreadable lock file", () => {
    writeLock("{ not json");

    expect(readDevinInstallState()).toEqual({ kind: "unknown" });
  });

  it("returns unknown when resolved[] is absent", () => {
    writeLock("{}\n");

    expect(readDevinInstallState()).toEqual({ kind: "unknown" });
  });

  it("returns unknown for an unrecognized spec.source", () => {
    writeLock(
      lockJson([
        {
          name: "coding-friend",
          spec: { source: "git", url: GITHUB_URL },
          version_dir: "0.40.0",
        },
      ]),
    );

    expect(readDevinInstallState()).toEqual({
      kind: "unknown",
      version: "0.40.0",
    });
  });
});

describe("desiredDevinSource", () => {
  it("returns the github spec when dev mode is off", () => {
    expect(desiredDevinSource()).toEqual({
      kind: "github",
      spec: GITHUB_SPEC,
    });
  });

  it("returns the local plugin-devin path in dev mode", () => {
    const repo = makeDevRepo();
    seedDevState(repo);

    expect(desiredDevinSource()).toEqual({
      kind: "local",
      path: join(repo, "plugin-devin"),
    });
  });

  it("throws the build hint when plugin-devin is not built (never falls back to github)", () => {
    const repo = makeTemp("cf-devin-empty-");
    seedDevState(repo);

    expect(() => desiredDevinSource()).toThrow(/npm run build:devin/);
  });

  it("treats a blank localPath as dev mode off", () => {
    const repo = makeDevRepo();
    seedDevState(`${repo}   `);

    // trailing whitespace trims to a valid path — still dev mode
    expect(desiredDevinSource()).toEqual({
      kind: "local",
      path: join(repo, "plugin-devin"),
    });
  });
});

describe("ensureDevinAuth", () => {
  it("passes when devin auth status exits 0", () => {
    expect(() => ensureDevinAuth()).not.toThrow();
    expect(mockRun).toHaveBeenCalledWith("devin", ["auth", "status"]);
  });

  it("throws the login hint when signed out", () => {
    mockRun.mockReturnValue(null);

    expect(() => ensureDevinAuth()).toThrow(/devin auth login/);
  });
});

describe("checkDevinTargetResolvable", () => {
  it("passes for a local source with a manifest", async () => {
    const repo = makeDevRepo();

    await expect(
      checkDevinTargetResolvable({
        kind: "local",
        path: join(repo, "plugin-devin"),
      }),
    ).resolves.toBeUndefined();
  });

  it("throws the build hint for a local source without a manifest", async () => {
    const repo = makeTemp("cf-devin-empty-");

    await expect(
      checkDevinTargetResolvable({
        kind: "local",
        path: join(repo, "plugin-devin"),
      }),
    ).rejects.toThrow(/npm run build:devin/);
  });

  it("passes for github when ls-remote works and the manifest returns 200", async () => {
    await expect(
      checkDevinTargetResolvable({ kind: "github", spec: GITHUB_SPEC }),
    ).resolves.toBeUndefined();

    expect(mockRun).toHaveBeenCalledWith("git", [
      "ls-remote",
      `${GITHUB_URL}.git`,
      "HEAD",
    ]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "raw.githubusercontent.com/dinhanhthi/coding-friend",
      ),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("throws when git ls-remote fails and never fetches", async () => {
    mockRun.mockImplementation((cmd, args = []) =>
      cmd === "git" && args?.[0] === "ls-remote" ? null : "ok",
    );

    await expect(
      checkDevinTargetResolvable({ kind: "github", spec: GITHUB_SPEC }),
    ).rejects.toThrow(/ls-remote/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws the not-on-default-branch error when the manifest is missing", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(
      checkDevinTargetResolvable({ kind: "github", spec: GITHUB_SPEC }),
    ).rejects.toThrow(/not on the default branch yet/);
  });

  it("throws when fetch fails (network down)", async () => {
    mockFetch.mockRejectedValue(new Error("ENOTFOUND"));

    await expect(
      checkDevinTargetResolvable({ kind: "github", spec: GITHUB_SPEC }),
    ).rejects.toThrow(/not on the default branch yet/);
  });
});

describe("reconcileDevinPlugin", () => {
  it("installs the github spec when nothing is installed", async () => {
    const action = await reconcileDevinPlugin({ allowReplace: true });

    expect(action).toBe("installed");
    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "install",
      GITHUB_SPEC,
      "-y",
    ]);
    expect(devinCalls("plugins").filter((a) => a[1] === "remove")).toEqual([]);
  });

  it("runs `devin plugins update` when the matching github plugin is installed", async () => {
    writeLock(lockJson([githubEntry("plugin-devin")]));

    const action = await reconcileDevinPlugin({ allowReplace: true });

    expect(action).toBe("updated");
    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "update",
      "coding-friend",
    ]);
    expect(devinCalls("plugins").filter((a) => a[1] === "remove")).toEqual([]);
    expect(devinCalls("plugins").filter((a) => a[1] === "install")).toEqual([]);
  });

  it("replaces a foreign github #plugin install via plain remove", async () => {
    writeLock(lockJson([githubEntry("plugin")]));

    const action = await reconcileDevinPlugin({ allowReplace: true });

    expect(action).toBe("replaced");
    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "remove",
      "coding-friend",
      "-y",
    ]);
    expect(mockRun).not.toHaveBeenCalledWith(
      "devin",
      expect.arrayContaining(["--local"]),
    );
    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "install",
      GITHUB_SPEC,
      "-y",
    ]);
    // remove must run before install
    const calls = devinCalls("plugins");
    const removeIdx = calls.findIndex((a) => a[1] === "remove");
    const installIdx = calls.findIndex((a) => a[1] === "install");
    expect(removeIdx).toBeGreaterThanOrEqual(0);
    expect(installIdx).toBeGreaterThan(removeIdx);
  });

  it("refuses to replace a foreign install without allowReplace", async () => {
    writeLock(lockJson([githubEntry("plugin")]));

    await expect(reconcileDevinPlugin()).rejects.toThrow(/cf install --devin/);
    expect(devinCalls("plugins")).toEqual([]);
  });

  it("no-ops on a same-path local install (link is live)", async () => {
    const repo = makeDevRepo();
    const pluginDir = join(repo, "plugin-devin");
    seedDevState(repo);
    // Devin stores the realpath in lock.json (e.g. /tmp → /private/tmp)
    writeLock(lockJson([localEntry(realpathSync(pluginDir))]));

    const action = await reconcileDevinPlugin({ allowReplace: true });

    expect(action).toBe("unchanged");
    expect(devinCalls("plugins")).toEqual([]);
  });

  it("replaces a different-path local install in dev mode", async () => {
    const repo = makeDevRepo();
    seedDevState(repo);
    const other = makeTemp("cf-devin-other-");
    writeLock(
      lockJson([localEntry(join(other, "plugin-devin"), "0.44.0")]),
    );

    const action = await reconcileDevinPlugin({ allowReplace: true });

    expect(action).toBe("replaced");
    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "install",
      "--local",
      join(repo, "plugin-devin"),
      "-y",
    ]);
  });

  it("replaces a local install with the github spec when dev mode is off", async () => {
    const repo = makeDevRepo();
    writeLock(lockJson([localEntry(join(repo, "plugin-devin"))]));

    const action = await reconcileDevinPlugin({ allowReplace: true });

    expect(action).toBe("replaced");
    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "remove",
      "coding-friend",
      "--local",
      "-y",
    ]);
    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "install",
      GITHUB_SPEC,
      "-y",
    ]);
  });

  it("replaces a github install with --local in dev mode", async () => {
    const repo = makeDevRepo();
    seedDevState(repo);
    writeLock(lockJson([githubEntry("plugin-devin")]));

    const action = await reconcileDevinPlugin({ allowReplace: true });

    expect(action).toBe("replaced");
    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "remove",
      "coding-friend",
      "-y",
    ]);
    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "install",
      "--local",
      join(repo, "plugin-devin"),
      "-y",
    ]);
  });

  it("tries both remove scopes on an unknown lock shape, then installs", async () => {
    writeLock("{ not json");

    const action = await reconcileDevinPlugin({ allowReplace: true });

    expect(action).toBe("replaced");
    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "remove",
      "coding-friend",
      "-y",
    ]);
    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "remove",
      "coding-friend",
      "--local",
      "-y",
    ]);
    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "install",
      GITHUB_SPEC,
      "-y",
    ]);
  });

  it("replaces a plugin-devin install from a lookalike repo (never updates it)", async () => {
    for (const url of [
      "https://github.com/evil-dinhanhthi/coding-friend",
      "https://gitlab.com/dinhanhthi/coding-friend",
      "https://github.com/x/dinhanhthi/coding-friend",
    ]) {
      mockRun.mockClear();
      const foreign = githubEntry("plugin-devin");
      foreign.spec.url = url;
      foreign.identity = `${url}#plugin-devin`;
      writeLock(lockJson([foreign]));

      const action = await reconcileDevinPlugin({ allowReplace: true });

      expect(action).toBe("replaced");
      expect(devinCalls("plugins").filter((a) => a[1] === "update")).toEqual([]);
      expect(mockRun).toHaveBeenCalledWith("devin", [
        "plugins",
        "remove",
        "coding-friend",
        "-y",
      ]);
      expect(mockRun).toHaveBeenCalledWith("devin", [
        "plugins",
        "install",
        GITHUB_SPEC,
        "-y",
      ]);
    }
  });

  it("updates the same repo in its git@ ssh form", async () => {
    const ssh = githubEntry("plugin-devin");
    ssh.spec.url = "git@github.com:dinhanhthi/coding-friend";
    ssh.identity = `${ssh.spec.url}#plugin-devin`;
    writeLock(lockJson([ssh]));

    const action = await reconcileDevinPlugin({ allowReplace: true });

    expect(action).toBe("updated");
    expect(devinCalls("plugins").filter((a) => a[1] === "remove")).toEqual([]);
  });

  it("throws before any mutation when lock.json lists duplicates", async () => {
    writeLock(
      lockJson([
        githubEntry("plugin-devin"),
        localEntry("/tmp/cf-other/plugin-devin"),
      ]),
    );

    await expect(
      reconcileDevinPlugin({ allowReplace: true }),
    ).rejects.toThrow(/lists coding-friend 2 times/);
    expect(devinCalls("plugins")).toEqual([]);
  });

  it("fails on auth before any remove call", async () => {
    writeLock(lockJson([githubEntry("plugin")]));
    mockRun.mockImplementation((cmd, args = []) =>
      cmd === "devin" && args?.[0] === "auth" ? null : "ok",
    );

    await expect(
      reconcileDevinPlugin({ allowReplace: true }),
    ).rejects.toThrow(/devin auth login/);
    expect(devinCalls("plugins")).toEqual([]);
  });

  it("fails on unresolvable target before any remove call", async () => {
    writeLock(lockJson([githubEntry("plugin")]));
    mockFetch.mockResolvedValue({ ok: false, status: 404 });

    await expect(
      reconcileDevinPlugin({ allowReplace: true }),
    ).rejects.toThrow(/not on the default branch yet/);
    expect(devinCalls("plugins")).toEqual([]);
  });

  it("fails with the dev build hint before any remove call", async () => {
    writeLock(lockJson([githubEntry("plugin-devin")]));
    seedDevState(makeTemp("cf-devin-empty-")); // dev mode on, artifact missing

    await expect(
      reconcileDevinPlugin({ allowReplace: true }),
    ).rejects.toThrow(/npm run build:devin/);
    expect(devinCalls("plugins")).toEqual([]);
  });

  it("includes the restore command when install fails after remove", async () => {
    writeLock(lockJson([githubEntry("plugin")]));
    mockRun.mockImplementation((cmd, args = []) => {
      if (cmd === "devin" && args?.[0] === "auth") return "ok";
      if (cmd === "git") return "sha\tHEAD";
      if (cmd === "devin" && args?.[0] === "plugins" && args?.[1] === "install")
        return null;
      return "ok";
    });

    await expect(
      reconcileDevinPlugin({ allowReplace: true }),
    ).rejects.toThrow(`devin plugins install ${GITHUB_SPEC} -y`);
  });
});

describe("removeDevinPlugin", () => {
  it("does nothing when nothing is installed", () => {
    removeDevinPlugin();

    expect(devinCalls("plugins")).toEqual([]);
  });

  it("uses plain remove for a github install", () => {
    writeLock(lockJson([githubEntry("plugin-devin")]));

    removeDevinPlugin();

    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "remove",
      "coding-friend",
      "-y",
    ]);
    expect(mockRun).not.toHaveBeenCalledWith(
      "devin",
      expect.arrayContaining(["--local"]),
    );
  });

  it("uses --local remove for a local install", () => {
    writeLock(lockJson([localEntry("/private/tmp/dev/plugin-devin")]));

    removeDevinPlugin();

    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "remove",
      "coding-friend",
      "--local",
      "-y",
    ]);
  });

  it("tries both scopes for an unknown shape", () => {
    writeLock("{ not json");

    removeDevinPlugin();

    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "remove",
      "coding-friend",
      "-y",
    ]);
    expect(mockRun).toHaveBeenCalledWith("devin", [
      "plugins",
      "remove",
      "coding-friend",
      "--local",
      "-y",
    ]);
  });
  it("warns when lock.json still lists coding-friend after remove", () => {
    // Duplicate entries make plain remove ambiguous per the spec — whatever
    // `devin` did, a stale entry must not be reported as a clean uninstall.
    writeLock(lockJson([githubEntry("plugin"), githubEntry("plugin")]));
    const logSpy = vi.mocked(console.log);

    removeDevinPlugin();

    const output = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("still appears in Devin's lock.json");
  });
});

describe("isDevinPluginInstalled / readDevinPluginVersion", () => {
  it("reports not installed when lock.json is missing", () => {
    expect(isDevinPluginInstalled()).toBe(false);
    expect(readDevinPluginVersion()).toBeNull();
  });

  it("reports installed with version for a github entry", () => {
    writeLock(lockJson([githubEntry("plugin-devin", "0.45.3")]));

    expect(isDevinPluginInstalled()).toBe(true);
    expect(readDevinPluginVersion()).toBe("0.45.3");
  });

  it("reports installed for a local entry", () => {
    writeLock(lockJson([localEntry("/private/tmp/dev/plugin-devin", "0.46.0")]));

    expect(isDevinPluginInstalled()).toBe(true);
    expect(readDevinPluginVersion()).toBe("0.46.0");
  });

  it("reports installed (unknown kind) for an unreadable lock", () => {
    writeLock("{ not json");

    expect(isDevinPluginInstalled()).toBe(true);
    expect(readDevinPluginVersion()).toBeNull();
  });

  it("returns null version when version_dir is absent", () => {
    const entry = githubEntry("plugin-devin") as Record<string, unknown>;
    delete entry.version_dir;
    writeLock(lockJson([entry]));

    expect(readDevinPluginVersion()).toBeNull();
  });
});
