import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-shell-completion-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
  vi.resetModules();
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function mockEnv(shell: string, platform: NodeJS.Platform, home: string) {
  vi.doMock("os", () => ({
    homedir: () => home,
    tmpdir: () => tmpdir(),
  }));
  vi.stubEnv("SHELL", shell);
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
}

async function loadModule() {
  return import("../shell-completion.js");
}

// ─── shell detection ─────────────────────────────────────────────────────────

describe("zsh on linux", () => {
  it("writes to ~/.zshrc", async () => {
    mockEnv("/bin/zsh", "linux", testDir);
    writeFileSync(join(testDir, ".zshrc"), "");
    const { ensureShellCompletion } = await loadModule();
    ensureShellCompletion({ silent: true });
    expect(readFileSync(join(testDir, ".zshrc"), "utf-8")).toContain(
      "compdef _cf cf",
    );
  });
});

describe("zsh on macOS", () => {
  it("writes to ~/.zshrc", async () => {
    mockEnv("/bin/zsh", "darwin", testDir);
    writeFileSync(join(testDir, ".zshrc"), "");
    const { ensureShellCompletion } = await loadModule();
    ensureShellCompletion({ silent: true });
    expect(readFileSync(join(testDir, ".zshrc"), "utf-8")).toContain(
      "compdef _cf cf",
    );
  });
});

describe("bash on linux", () => {
  it("writes to ~/.bashrc", async () => {
    mockEnv("/bin/bash", "linux", testDir);
    writeFileSync(join(testDir, ".bashrc"), "");
    const { ensureShellCompletion } = await loadModule();
    ensureShellCompletion({ silent: true });
    expect(readFileSync(join(testDir, ".bashrc"), "utf-8")).toContain(
      "complete -o default -F _cf_completions cf",
    );
  });
});

describe("bash on macOS", () => {
  it("writes to ~/.bash_profile, not ~/.bashrc", async () => {
    mockEnv("/bin/bash", "darwin", testDir);
    writeFileSync(join(testDir, ".bash_profile"), "");
    const { ensureShellCompletion } = await loadModule();
    ensureShellCompletion({ silent: true });
    expect(readFileSync(join(testDir, ".bash_profile"), "utf-8")).toContain(
      "complete -o default -F _cf_completions cf",
    );
    expect(existsSync(join(testDir, ".bashrc"))).toBe(false);
  });
});

describe("fish shell", () => {
  it("writes cf.fish to ~/.config/fish/completions/", async () => {
    mockEnv("/usr/bin/fish", "linux", testDir);
    mkdirSync(join(testDir, ".config", "fish", "completions"), {
      recursive: true,
    });
    const { ensureShellCompletion } = await loadModule();
    ensureShellCompletion({ silent: true });
    const fishFile = join(testDir, ".config", "fish", "completions", "cf.fish");
    expect(existsSync(fishFile)).toBe(true);
    expect(readFileSync(fishFile, "utf-8")).toContain("complete -c cf");
  });

  it("creates fish completions dir if missing", async () => {
    mockEnv("/usr/bin/fish", "linux", testDir);
    const { ensureShellCompletion } = await loadModule();
    ensureShellCompletion({ silent: true });
    const fishFile = join(testDir, ".config", "fish", "completions", "cf.fish");
    expect(existsSync(fishFile)).toBe(true);
  });
});

describe("PowerShell on Windows", () => {
  it("writes Register-ArgumentCompleter to PS profile", async () => {
    mockEnv("", "win32", testDir);
    const psDir = join(testDir, "Documents", "PowerShell");
    mkdirSync(psDir, { recursive: true });
    writeFileSync(join(psDir, "Microsoft.PowerShell_profile.ps1"), "");
    vi.stubEnv("USERPROFILE", testDir);
    const { ensureShellCompletion } = await loadModule();
    ensureShellCompletion({ silent: true });
    const content = readFileSync(
      join(psDir, "Microsoft.PowerShell_profile.ps1"),
      "utf-8",
    );
    expect(content).toContain("Register-ArgumentCompleter");
  });

  it("creates PowerShell profile dir if missing", async () => {
    mockEnv("", "win32", testDir);
    vi.stubEnv("USERPROFILE", testDir);
    const psProfile = join(
      testDir,
      "Documents",
      "PowerShell",
      "Microsoft.PowerShell_profile.ps1",
    );
    const { ensureShellCompletion } = await loadModule();
    ensureShellCompletion({ silent: true });
    expect(existsSync(psProfile)).toBe(true);
    expect(readFileSync(psProfile, "utf-8")).toContain(
      "Register-ArgumentCompleter",
    );
  });
});

describe("unsupported shell", () => {
  it("returns false without throwing", async () => {
    mockEnv("/usr/bin/tcsh", "linux", testDir);
    const { ensureShellCompletion } = await loadModule();
    expect(() => ensureShellCompletion({ silent: true })).not.toThrow();
    expect(ensureShellCompletion({ silent: true })).toBe(false);
  });
});

// ─── zsh compinit ────────────────────────────────────────────────────────────

describe("zsh compinit", () => {
  it("adds compinit to the completion block when missing from .zshrc", async () => {
    mockEnv("/bin/zsh", "linux", testDir);
    writeFileSync(join(testDir, ".zshrc"), "# empty zshrc\n");
    const { ensureShellCompletion } = await loadModule();
    ensureShellCompletion({ silent: true });
    const content = readFileSync(join(testDir, ".zshrc"), "utf-8");
    expect(content).toContain("autoload -Uz compinit");
  });

  it("does NOT duplicate compinit when already present in .zshrc", async () => {
    mockEnv("/bin/zsh", "linux", testDir);
    writeFileSync(
      join(testDir, ".zshrc"),
      "autoload -Uz compinit && compinit\n",
    );
    const { ensureShellCompletion } = await loadModule();
    ensureShellCompletion({ silent: true });
    const content = readFileSync(join(testDir, ".zshrc"), "utf-8");
    const count = (content.match(/autoload -Uz compinit/g) ?? []).length;
    expect(count).toBe(1);
  });
});

// ─── update path (block already exists but outdated) ────────────────────────

describe("update outdated block - bash", () => {
  it("replaces an outdated completion block in ~/.bashrc", async () => {
    mockEnv("/bin/bash", "linux", testDir);
    const bashrc = join(testDir, ".bashrc");
    writeFileSync(
      bashrc,
      "# preamble\n# >>> coding-friend CLI completion >>>\n_old_completions() { echo old; }\n# <<< coding-friend CLI completion <<<\n",
    );
    const { ensureShellCompletion } = await loadModule();
    const result = ensureShellCompletion({ silent: true });
    expect(result).toBe(true);
    const content = readFileSync(bashrc, "utf-8");
    expect(content).toContain("_cf_completions");
    expect(content).not.toContain("_old_completions");
    expect(content).toContain("# preamble");
  });
});

describe("update outdated fish file", () => {
  it("overwrites an outdated cf.fish", async () => {
    mockEnv("/usr/bin/fish", "linux", testDir);
    const fishDir = join(testDir, ".config", "fish", "completions");
    mkdirSync(fishDir, { recursive: true });
    const fishFile = join(fishDir, "cf.fish");
    writeFileSync(fishFile, "# old content\ncomplete -c cf -f\n");
    const { ensureShellCompletion } = await loadModule();
    const result = ensureShellCompletion({ silent: true });
    expect(result).toBe(true);
    const content = readFileSync(fishFile, "utf-8");
    expect(content).toContain("__fish_use_subcommand");
    expect(content).not.toContain("# old content");
  });
});

// ─── removeShellCompletion ───────────────────────────────────────────────────

describe("removeShellCompletion - fish", () => {
  it("deletes the fish completion file", async () => {
    mockEnv("/usr/bin/fish", "linux", testDir);
    const fishDir = join(testDir, ".config", "fish", "completions");
    mkdirSync(fishDir, { recursive: true });
    const fishFile = join(fishDir, "cf.fish");
    writeFileSync(fishFile, "complete -c cf -f\n");
    const { removeShellCompletion } = await loadModule();
    expect(removeShellCompletion()).toBe(true);
    expect(existsSync(fishFile)).toBe(false);
  });
});

// ─── hasShellCompletion ──────────────────────────────────────────────────────

describe("hasShellCompletion - fish", () => {
  it("returns true when cf.fish exists", async () => {
    mockEnv("/usr/bin/fish", "linux", testDir);
    const fishDir = join(testDir, ".config", "fish", "completions");
    mkdirSync(fishDir, { recursive: true });
    writeFileSync(join(fishDir, "cf.fish"), "complete -c cf -f\n");
    const { hasShellCompletion } = await loadModule();
    expect(hasShellCompletion()).toBe(true);
  });

  it("returns false when cf.fish does not exist", async () => {
    mockEnv("/usr/bin/fish", "linux", testDir);
    const { hasShellCompletion } = await loadModule();
    expect(hasShellCompletion()).toBe(false);
  });
});
