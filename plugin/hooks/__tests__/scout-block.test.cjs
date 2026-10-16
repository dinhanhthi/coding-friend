const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  DEFAULT_PATTERNS,
  normalizePath,
  parseIgnoreFile,
  buildEffectivePatterns,
  pathMatchesPattern,
  isBlocked,
  extractPaths,
  blockReason,
} = require("../scout-block.cjs");

const SCRIPT = path.resolve(__dirname, "../scout-block.cjs");

// Helper: run the script with given JSON stdin, return { stdout, exitCode }.
// HOME is pinned to a fresh empty temp dir (hermetic) unless env.HOME is set.
function run(jsonInput, { env = {}, cwd } = {}) {
  const input =
    typeof jsonInput === "string" ? jsonInput : JSON.stringify(jsonInput);
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "cf-scout-home-"));
  try {
    const stdout = execFileSync("node", [SCRIPT], {
      input,
      cwd,
      encoding: "utf8",
      env: { ...process.env, HOME: tempHome, ...env },
      timeout: 5000,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || "", exitCode: err.status };
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

// Helper: write .coding-friend/{config.json,ignore} under dir
function writeCf(dir, { config, ignore } = {}) {
  fs.mkdirSync(path.join(dir, ".coding-friend"), { recursive: true });
  if (config) {
    fs.writeFileSync(
      path.join(dir, ".coding-friend", "config.json"),
      JSON.stringify(config),
    );
  }
  if (ignore != null) {
    fs.writeFileSync(path.join(dir, ".coding-friend", "ignore"), ignore);
  }
}

// ---------------------------------------------------------------------------
// Unit tests — exported functions
// ---------------------------------------------------------------------------

describe("normalizePath", () => {
  it("strips ./ prefix", () => {
    expect(normalizePath("./src/app.ts")).toBe("src/app.ts");
  });

  it("strips leading /", () => {
    expect(normalizePath("/src/app.ts")).toBe("src/app.ts");
  });

  it("converts backslashes", () => {
    expect(normalizePath("src\\components\\Button.tsx")).toBe(
      "src/components/Button.tsx",
    );
  });

  it("returns empty string for falsy input", () => {
    expect(normalizePath("")).toBe("");
    expect(normalizePath(null)).toBe("");
    expect(normalizePath(undefined)).toBe("");
  });
});

describe("parseIgnoreFile", () => {
  it("parses block patterns", () => {
    const { blocks, negations } = parseIgnoreFile("foo\nbar/\nbaz");
    expect(blocks).toEqual(["foo", "bar", "baz"]);
    expect(negations).toEqual([]);
  });

  it("parses negation patterns", () => {
    const { blocks, negations } = parseIgnoreFile("foo\n!bar\n!baz/");
    expect(blocks).toEqual(["foo"]);
    expect(negations).toEqual(["bar", "baz"]);
  });

  it("skips comments and empty lines", () => {
    const { blocks } = parseIgnoreFile("# comment\n\nfoo\n  # another\nbar");
    expect(blocks).toEqual(["foo", "bar"]);
  });

  it("strips inline comments", () => {
    const { blocks } = parseIgnoreFile("foo # this is a comment");
    expect(blocks).toEqual(["foo"]);
  });

  it("handles empty content", () => {
    const { blocks, negations } = parseIgnoreFile("");
    expect(blocks).toEqual([]);
    expect(negations).toEqual([]);
  });
});

describe("buildEffectivePatterns", () => {
  it("returns defaults when no user patterns", () => {
    const patterns = buildEffectivePatterns([], []);
    expect(patterns).toEqual(DEFAULT_PATTERNS);
  });

  it("appends user block patterns", () => {
    const patterns = buildEffectivePatterns(["my-dir"], []);
    expect(patterns).toContain("my-dir");
    expect(patterns).toContain("node_modules");
  });

  it("removes negated defaults", () => {
    const patterns = buildEffectivePatterns([], ["build"]);
    expect(patterns).not.toContain("build");
    expect(patterns).toContain("node_modules");
  });

  it("does not duplicate existing patterns", () => {
    const patterns = buildEffectivePatterns(["node_modules"], []);
    const count = patterns.filter((p) => p === "node_modules").length;
    expect(count).toBe(1);
  });

  it("layers on a given base: negations remove from base, blocks append", () => {
    const patterns = buildEffectivePatterns(["bar"], ["foo"], ["foo", "dist"]);
    expect(patterns).toEqual(["dist", "bar"]);
  });
});

describe("pathMatchesPattern", () => {
  it("matches at start of path", () => {
    expect(
      pathMatchesPattern("node_modules/pkg/index.js", "node_modules"),
    ).toBe(true);
  });

  it("matches as mid segment", () => {
    expect(
      pathMatchesPattern("src/node_modules/dep/file.js", "node_modules"),
    ).toBe(true);
  });

  it("matches at end of path", () => {
    expect(pathMatchesPattern("project/node_modules", "node_modules")).toBe(
      true,
    );
  });

  it("matches exact path", () => {
    expect(pathMatchesPattern("node_modules", "node_modules")).toBe(true);
  });

  it("does not match partial names", () => {
    expect(
      pathMatchesPattern("src/my_node_modules/file.js", "node_modules"),
    ).toBe(false);
    expect(
      pathMatchesPattern("node_modules_extra/file.js", "node_modules"),
    ).toBe(false);
  });

  it("returns false for empty inputs", () => {
    expect(pathMatchesPattern("", "node_modules")).toBe(false);
    expect(pathMatchesPattern("src/file.ts", "")).toBe(false);
  });
});

describe("isBlocked", () => {
  const defaults = DEFAULT_PATTERNS;

  it("blocks node_modules paths", () => {
    expect(isBlocked("node_modules/package/index.js", defaults)).toBe(
      "node_modules",
    );
  });

  it("blocks .next paths", () => {
    expect(isBlocked(".next/cache/abc", defaults)).toBe(".next");
  });

  it("blocks nested node_modules", () => {
    expect(isBlocked("src/node_modules/dep/file.js", defaults)).toBe(
      "node_modules",
    );
  });

  it("blocks __pycache__", () => {
    expect(isBlocked("__pycache__/module.pyc", defaults)).toBe("__pycache__");
  });

  it("blocks .git", () => {
    expect(isBlocked(".git/objects/abc", defaults)).toBe(".git");
  });

  it("allows normal source files", () => {
    expect(isBlocked("src/components/Button.tsx", defaults)).toBeNull();
  });

  it("allows README.md", () => {
    expect(isBlocked("README.md", defaults)).toBeNull();
  });

  it("strips ./ prefix before matching", () => {
    expect(isBlocked("./node_modules/x.js", defaults)).toBe("node_modules");
  });

  it("handles leading / in paths", () => {
    expect(isBlocked("/node_modules/x.js", defaults)).toBe("node_modules");
  });

  it("returns null for empty path", () => {
    expect(isBlocked("", defaults)).toBeNull();
  });
});

describe("extractPaths", () => {
  it("extracts file_path", () => {
    expect(extractPaths({ file_path: "/src/app.ts" })).toEqual(["/src/app.ts"]);
  });

  it("extracts path", () => {
    expect(extractPaths({ path: "/src" })).toEqual(["/src"]);
  });

  it("extracts pattern", () => {
    expect(extractPaths({ pattern: "**/*.ts" })).toEqual(["**/*.ts"]);
  });

  it("extracts multiple fields", () => {
    const paths = extractPaths({ file_path: "/a", path: "/b", pattern: "/c" });
    expect(paths).toEqual(["/a", "/b", "/c"]);
  });

  it("returns empty for no matching fields", () => {
    expect(extractPaths({ command: "git status" })).toEqual([]);
  });

  it("extracts targets from apply_patch envelopes in command", () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "*** Move to: src/renamed.ts",
      "@@",
      "-a",
      "+b",
      "*** Delete File: docs/old.md",
      "*** End Patch",
    ].join("\n");
    expect(extractPaths({ command: patch })).toEqual([
      "src/app.ts",
      "src/renamed.ts",
      "docs/old.md",
    ]);
  });

  it("extracts apply_patch headers with leading whitespace", () => {
    const patch = [
      "*** Begin Patch",
      "  *** Add File: config/.env",
      "+SECRET=1",
      "*** End Patch",
    ].join("\n");
    expect(extractPaths({ command: patch })).toEqual(["config/.env"]);
  });

  it("returns empty for null/undefined", () => {
    expect(extractPaths(null)).toEqual([]);
    expect(extractPaths(undefined)).toEqual([]);
  });
});

describe("blockReason", () => {
  it("suggests !pattern for a default pattern and asks the user", () => {
    const reason = blockReason("vendor/x", "vendor");
    expect(reason).toContain(
      'ask the user, who can allow it by adding "!vendor" to .coding-friend/ignore (project) or ~/.coding-friend/ignore (global), and removing any "vendor" line from that file.',
    );
    expect(reason).toContain("Do not edit ignore files yourself");
  });

  it("tells the user to drop a same-file block line for a default pattern", () => {
    expect(blockReason("dist/x", "dist")).toContain(
      'and removing any "dist" line from that file',
    );
    expect(blockReason("foo/x", "foo")).not.toContain("removing any");
  });

  it("suggests removing a custom pattern, not !pattern, and asks the user", () => {
    const reason = blockReason("foo/x", "foo");
    expect(reason).not.toContain("!foo");
    expect(reason).toContain(
      'ask the user, who can allow it by removing "foo" from the ignore file that lists it',
    );
    expect(reason).toContain("Do not edit ignore files yourself");
  });

  it("replaces control characters in path and pattern with spaces", () => {
    const reason = blockReason("a\nb\r\u0007c/x", "fo\no");
    expect(reason).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(reason).toContain("'a b  c/x'");
    expect(reason).toContain("ignore pattern: fo o.");
  });
});

// ---------------------------------------------------------------------------
// Integration tests — run the actual script
// ---------------------------------------------------------------------------

describe("integration: default patterns (no ignore file)", () => {
  it("blocks node_modules", () => {
    const { exitCode, stdout } = run({
      tool_name: "Read",
      tool_input: { file_path: "node_modules/pkg/index.js" },
    });
    expect(exitCode).toBe(2);
    expect(stdout).toContain("node_modules");
  });

  it("blocks .next", () => {
    const { exitCode } = run({
      tool_name: "Read",
      tool_input: { file_path: ".next/cache/abc" },
    });
    expect(exitCode).toBe(2);
  });

  it("blocks .git", () => {
    const { exitCode } = run({
      tool_name: "Read",
      tool_input: { file_path: ".git/objects/abc" },
    });
    expect(exitCode).toBe(2);
  });

  it("allows normal source files", () => {
    const { exitCode, stdout } = run({
      tool_name: "Read",
      tool_input: { file_path: "src/components/Button.tsx" },
    });
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("{}");
  });

  it("allows README.md", () => {
    const { exitCode } = run({
      tool_name: "Read",
      tool_input: { file_path: "README.md" },
    });
    expect(exitCode).toBe(0);
  });
});

describe("integration: fail-open behavior", () => {
  it("allows on empty stdin", () => {
    const { exitCode, stdout } = run("");
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("{}");
  });

  it("allows on malformed JSON", () => {
    const { exitCode, stdout } = run("not json at all");
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("{}");
  });

  it("allows on missing tool_input", () => {
    const { exitCode, stdout } = run({ tool_name: "Read" });
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("{}");
  });

  it("allows on empty path values", () => {
    const { exitCode } = run({
      tool_name: "Read",
      tool_input: { file_path: "" },
    });
    expect(exitCode).toBe(0);
  });
});

describe("integration: path extraction from different tools", () => {
  it("extracts file_path from Read", () => {
    const { exitCode } = run({
      tool_name: "Read",
      tool_input: { file_path: "node_modules/x.js" },
    });
    expect(exitCode).toBe(2);
  });

  it("extracts file_path from Edit", () => {
    const { exitCode } = run({
      tool_name: "Edit",
      tool_input: {
        file_path: "node_modules/x.js",
        old_string: "a",
        new_string: "b",
      },
    });
    expect(exitCode).toBe(2);
  });

  it("extracts file_path from Write", () => {
    const { exitCode } = run({
      tool_name: "Write",
      tool_input: { file_path: "node_modules/x.js", content: "x" },
    });
    expect(exitCode).toBe(2);
  });

  it("extracts path from Glob", () => {
    const { exitCode } = run({
      tool_name: "Glob",
      tool_input: { pattern: "**/*.ts", path: "node_modules" },
    });
    expect(exitCode).toBe(2);
  });

  it("extracts path from Grep", () => {
    const { exitCode } = run({
      tool_name: "Grep",
      tool_input: { pattern: "import", path: "node_modules/pkg" },
    });
    expect(exitCode).toBe(2);
  });

  it("extracts pattern from Glob for path-like patterns", () => {
    const { exitCode } = run({
      tool_name: "Glob",
      tool_input: { pattern: "node_modules/**/*.js" },
    });
    expect(exitCode).toBe(2);
  });
});

describe("integration: global (~/.coding-friend) and local layering", () => {
  const VENDOR_EDIT = {
    tool_name: "Edit",
    tool_input: { file_path: "src-tauri/vendor/swift-rs/src-rs/build.rs" },
  };
  let home;
  let project;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "cf-scout-home-"));
    project = fs.mkdtempSync(path.join(os.tmpdir(), "cf-scout-proj-"));
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(project, { recursive: true, force: true });
  });

  const runIn = (payload) =>
    run(payload, { env: { HOME: home }, cwd: project });

  it("allows when global config has scoutBlock: false", () => {
    writeCf(home, { config: { scoutBlock: false } });
    expect(runIn(VENDOR_EDIT).exitCode).toBe(0);
  });

  it("allows when global ignore negates a default (!vendor)", () => {
    writeCf(home, { ignore: "!vendor\n" });
    expect(runIn(VENDOR_EDIT).exitCode).toBe(0);
  });

  it("blocks when local scoutBlock: true overrides global false", () => {
    writeCf(home, { config: { scoutBlock: false } });
    writeCf(project, { config: { scoutBlock: true } });
    expect(runIn(VENDOR_EDIT).exitCode).toBe(2);
  });

  it("blocks when local ignore re-blocks a globally negated default", () => {
    writeCf(home, { ignore: "!vendor\n" });
    writeCf(project, { ignore: "vendor\n" });
    expect(runIn(VENDOR_EDIT).exitCode).toBe(2);
  });

  it("allows when local !foo undoes a global foo block", () => {
    writeCf(home, { ignore: "foo\n" });
    const payload = { tool_name: "Read", tool_input: { file_path: "foo/x" } };
    expect(runIn(payload).exitCode).toBe(2);
    writeCf(project, { ignore: "!foo\n" });
    expect(runIn(payload).exitCode).toBe(0);
  });

  it("block reason tells the user how to unblock a default", () => {
    const { exitCode, stdout } = runIn(VENDOR_EDIT);
    expect(exitCode).toBe(2);
    expect(JSON.parse(stdout).hookSpecificOutput.reason).toContain(
      'ask the user, who can allow it by adding "!vendor" to .coding-friend/ignore (project) or ~/.coding-friend/ignore (global), and removing any "vendor" line from that file.',
    );
  });

  it("still blocks defaults and applies local ignore when global ignore is unreadable", () => {
    // A directory at ~/.coding-friend/ignore makes readFileSync throw (EISDIR).
    fs.mkdirSync(path.join(home, ".coding-friend", "ignore"), {
      recursive: true,
    });
    const vendor = { tool_name: "Read", tool_input: { file_path: "vendor/x" } };
    const foo = { tool_name: "Read", tool_input: { file_path: "foo/x" } };
    expect(runIn(vendor).exitCode).toBe(2);
    expect(runIn(foo).exitCode).toBe(0);
    writeCf(project, { ignore: "foo\n" });
    expect(runIn(vendor).exitCode).toBe(2);
    expect(runIn(foo).exitCode).toBe(2);
  });

  it("still blocks when global ignore has both foo and !foo (same layer)", () => {
    writeCf(home, { ignore: "foo\n!foo\n" });
    const payload = { tool_name: "Read", tool_input: { file_path: "foo/x" } };
    expect(runIn(payload).exitCode).toBe(2);
  });

  it("block reason for a custom local pattern suggests removing it", () => {
    writeCf(project, { ignore: "foo\n" });
    const payload = { tool_name: "Read", tool_input: { file_path: "foo/x" } };
    const { exitCode, stdout } = runIn(payload);
    expect(exitCode).toBe(2);
    const { reason } = JSON.parse(stdout).hookSpecificOutput;
    expect(reason).toContain(
      'removing "foo" from the ignore file that lists it (.coding-friend/ignore or ~/.coding-friend/ignore)',
    );
    expect(reason).not.toContain("!foo");
  });
});
