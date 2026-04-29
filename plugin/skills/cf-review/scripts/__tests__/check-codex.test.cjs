"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.resolve(__dirname, "../check-codex.sh");

// Resolve the host's real `jq` binary once. We symlink it into the test's
// isolated PATH so we don't have to include `/usr/local/bin` or
// `/opt/homebrew/bin` (which on a developer machine may also contain a real
// `codex` binary, leaking into the codexInPath:false branch as a false negative).
const JQ_BIN = (() => {
  try {
    return execFileSync("which", ["jq"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error("jq is required to run check-codex tests but was not found in PATH");
  }
})();

// Run check-codex.sh with isolated HOME + cwd + PATH
//   args: positional CLI args (e.g. ["STANDARD"])
//   localConfig: object → written to <cwd>/.coding-friend/config.json (or null)
//   globalConfig: object → written to <home>/.coding-friend/config.json (or null)
//   codexInPath: when true, install a fake `codex` shim into a temp PATH entry
function run({
  args = [],
  localConfig = null,
  globalConfig = null,
  codexInPath = true,
} = {}) {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "cf-check-codex-home-"));
  const tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "cf-check-codex-cwd-"));
  const tmpBin = fs.mkdtempSync(path.join(os.tmpdir(), "cf-check-codex-bin-"));

  if (localConfig) {
    fs.mkdirSync(path.join(tmpCwd, ".coding-friend"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpCwd, ".coding-friend", "config.json"),
      JSON.stringify(localConfig),
    );
  }
  if (globalConfig) {
    fs.mkdirSync(path.join(tmpHome, ".coding-friend"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, ".coding-friend", "config.json"),
      JSON.stringify(globalConfig),
    );
  }

  // Always symlink the host's real jq into tmpBin so PATH resolution doesn't
  // need /usr/local/bin or /opt/homebrew/bin (which would also expose any
  // brew-installed `codex` binary and break the codexInPath:false branch).
  fs.symlinkSync(JQ_BIN, path.join(tmpBin, "jq"));
  if (codexInPath) {
    fs.writeFileSync(
      path.join(tmpBin, "codex"),
      "#!/bin/sh\necho fake-codex\n",
    );
    fs.chmodSync(path.join(tmpBin, "codex"), 0o755);
  }
  const pathEntries = [tmpBin, "/bin", "/usr/bin"];

  let stdout = "";
  let exitCode = 0;
  try {
    stdout = execFileSync("bash", [SCRIPT, ...args], {
      cwd: tmpCwd,
      encoding: "utf8",
      env: { HOME: tmpHome, PATH: pathEntries.join(":") },
      timeout: 5000,
    });
  } catch (err) {
    stdout = err.stdout || "";
    exitCode = err.status;
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpCwd, { recursive: true, force: true });
    fs.rmSync(tmpBin, { recursive: true, force: true });
  }

  // Parse KEY=value lines into an object
  const result = {};
  for (const line of stdout.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) result[m[1]] = m[2];
  }
  return { stdout, exitCode, result };
}

describe("check-codex.sh", () => {
  it("emits KEY=value lines (not just compute shell vars)", () => {
    const { stdout } = run({
      args: ["STANDARD"],
      globalConfig: { codex: { enabled: true } },
    });
    expect(stdout).toMatch(/^CODEX_ENABLED=/m);
    expect(stdout).toMatch(/^CODEX_EFFORT=/m);
  });

  it("returns CODEX_ENABLED=true when enabled, mode is in modes list, codex CLI in PATH", () => {
    const { result } = run({
      args: ["STANDARD"],
      globalConfig: {
        codex: { enabled: true, modes: ["STANDARD", "DEEP"], effort: "high" },
      },
    });
    expect(result.CODEX_ENABLED).toBe("true");
    expect(result.CODEX_EFFORT).toBe("high");
  });

  it("returns CODEX_ENABLED=false when codex.enabled is false", () => {
    const { result } = run({
      args: ["STANDARD"],
      globalConfig: {
        codex: { enabled: false, modes: ["STANDARD", "DEEP"] },
      },
    });
    expect(result.CODEX_ENABLED).toBe("false");
  });

  it("returns CODEX_ENABLED=false when MODE is not in configured modes", () => {
    const { result } = run({
      args: ["QUICK"],
      globalConfig: {
        codex: { enabled: true, modes: ["STANDARD", "DEEP"] },
      },
    });
    expect(result.CODEX_ENABLED).toBe("false");
  });

  it("returns CODEX_ENABLED=false when MODE arg is missing", () => {
    const { result } = run({
      args: [],
      globalConfig: { codex: { enabled: true, modes: ["STANDARD", "DEEP"] } },
    });
    expect(result.CODEX_ENABLED).toBe("false");
  });

  it("returns CODEX_ENABLED=false when codex CLI is not in PATH", () => {
    const { result } = run({
      args: ["STANDARD"],
      codexInPath: false,
      globalConfig: { codex: { enabled: true, modes: ["STANDARD", "DEEP"] } },
    });
    expect(result.CODEX_ENABLED).toBe("false");
  });

  it("local config overrides global for codex.enabled", () => {
    const { result } = run({
      args: ["STANDARD"],
      localConfig: { codex: { enabled: false } },
      globalConfig: { codex: { enabled: true, modes: ["STANDARD", "DEEP"] } },
    });
    expect(result.CODEX_ENABLED).toBe("false");
  });

  it("falls back to global config when local has no codex section", () => {
    const { result } = run({
      args: ["STANDARD"],
      localConfig: { language: "vi" },
      globalConfig: {
        codex: { enabled: true, modes: ["STANDARD", "DEEP"], effort: "high" },
      },
    });
    expect(result.CODEX_ENABLED).toBe("true");
    expect(result.CODEX_EFFORT).toBe("high");
  });

  it("defaults effort to medium when not configured", () => {
    const { result } = run({
      args: ["STANDARD"],
      globalConfig: { codex: { enabled: true, modes: ["STANDARD", "DEEP"] } },
    });
    expect(result.CODEX_EFFORT).toBe("medium");
  });

  it("defaults modes to STANDARD,DEEP when not configured", () => {
    const { result } = run({
      args: ["STANDARD"],
      globalConfig: { codex: { enabled: true } },
    });
    expect(result.CODEX_ENABLED).toBe("true");
  });

  it("returns CODEX_ENABLED=false when neither config exists", () => {
    const { result } = run({ args: ["STANDARD"] });
    expect(result.CODEX_ENABLED).toBe("false");
  });

  it("falls back to defaults when config is malformed JSON", () => {
    // Write invalid JSON directly — jq will fail and emit empty stdout.
    // Without a guard, CODEX_EFFORT would echo as empty (silent degradation).
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "cf-malformed-"));
    fs.mkdirSync(path.join(tmpHome, ".coding-friend"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpHome, ".coding-friend", "config.json"),
      "{not valid json",
    );
    const tmpBin = fs.mkdtempSync(path.join(os.tmpdir(), "cf-malformed-bin-"));
    fs.symlinkSync(JQ_BIN, path.join(tmpBin, "jq"));
    fs.writeFileSync(path.join(tmpBin, "codex"), "#!/bin/sh\n");
    fs.chmodSync(path.join(tmpBin, "codex"), 0o755);

    let stdout = "";
    try {
      stdout = execFileSync("bash", [SCRIPT, "STANDARD"], {
        cwd: tmpHome,
        encoding: "utf8",
        env: {
          HOME: tmpHome,
          PATH: [tmpBin, "/bin", "/usr/bin"].join(":"),
        },
        timeout: 5000,
      });
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
      fs.rmSync(tmpBin, { recursive: true, force: true });
    }

    const result = {};
    for (const line of stdout.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) result[m[1]] = m[2];
    }
    expect(result.CODEX_ENABLED).toBe("false");
    expect(result.CODEX_EFFORT).toBe("medium");
  });
});
