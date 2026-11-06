"use strict";

const { describe: nodeDescribe, it: nodeIt } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const describe =
  typeof globalThis.describe === "function"
    ? globalThis.describe
    : nodeDescribe;
const it = typeof globalThis.it === "function" ? globalThis.it : nodeIt;

function expect(actual) {
  return {
    toBe(expected) {
      assert.strictEqual(actual, expected);
    },
    toContain(expected) {
      assert.ok(
        String(actual).includes(expected),
        `expected ${JSON.stringify(actual)} to contain ${JSON.stringify(expected)}`,
      );
    },
  };
}

const SCRIPT = path.resolve(__dirname, "../privacy-block.sh");

function runHook(payload, bashBin = "bash", env = undefined) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cf-privacy-block-"));
  try {
    const stdout = execFileSync(bashBin, [SCRIPT], {
      cwd,
      env,
      input: JSON.stringify(payload),
      encoding: "utf8",
      timeout: 5000,
    });
    return { status: 0, stdout };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || "" };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

describe("privacy-block.sh", () => {
  it("allows an empty payload under /bin/bash and bash", () => {
    const payload = { tool_name: "Read", tool_input: {} };
    for (const bashBin of ["/bin/bash", "bash"]) {
      const result = runHook(payload, bashBin);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("{}");
    }
  });

  it("blocks a sensitive file_path", () => {
    const result = runHook({
      tool_name: "Read",
      tool_input: { file_path: "config/.env" },
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"hookEventName": "PreToolUse"');
    expect(result.stdout).toContain('"permissionDecision": "deny"');
    expect(result.stdout).toContain('"permissionDecisionReason"');
    expect(result.stdout).toContain("config/.env");
  });

  it("emits valid deny JSON for a backslash pattern under /bin/bash and bash", () => {
    // Regression: the raw `\.env$` pattern made the output invalid JSON.
    for (const bashBin of ["/bin/bash", "bash"]) {
      const result = runHook(
        { tool_name: "Read", tool_input: { file_path: "config/.env" } },
        bashBin,
      );
      expect(result.status).toBe(2);
      const out = JSON.parse(result.stdout).hookSpecificOutput;
      expect(out.permissionDecision).toBe("deny");
      expect(out.permissionDecisionReason).toContain("'config/.env'");
      expect(out.permissionDecisionReason).toContain("\\.env$");
    }
  });

  it("blocks a file_path whose name follows an escaped quote", () => {
    // Regression: the grep capture stopped at the JSON-escaped quote.
    const result = runHook({
      tool_name: "Read",
      tool_input: { file_path: 'a"b.env' },
    });
    expect(result.status).toBe(2);
    const out = JSON.parse(result.stdout).hookSpecificOutput;
    expect(out.permissionDecision).toBe("deny");
    expect(out.permissionDecisionReason).toContain('a"b.env');
  });

  // Regression: the unanchored safe row exempted a real dotenv variant whose
  // name only contains the example suffix.
  for (const [filePath, status] of [
    [".env.example", 0],
    ["config/.env.example.local", 2],
  ]) {
    it(`${status ? "blocks" : "allows"} example-style file_path ${filePath}`, () => {
      const result = runHook({
        tool_name: "Read",
        tool_input: { file_path: filePath },
      });
      expect(result.status).toBe(status);
      if (status) expect(result.stdout).toContain(filePath);
      else expect(result.stdout.trim()).toBe("{}");
    });
  }

  it("allows cf-commit's scan-secrets.sh script (#28)", () => {
    const result = runHook({
      tool_name: "Read",
      tool_input: {
        file_path:
          "/x/plugins/coding-friend/skills/cf-commit/scripts/scan-secrets.sh",
      },
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
  });

  it("allows a normal file_path", () => {
    const result = runHook({
      tool_name: "Read",
      tool_input: { file_path: "src/app.ts" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
  });

  // Regression: unanchored 'credentials' / 'secret' / '\.env\.' blocked
  // ordinary source and doc files.
  for (const filePath of [
    "src/brain-sso-credentials-form.ts",
    "src/config.env.ts",
    "src/types/process.env.d.ts",
    "src/secret-manager.ts",
    "src/features/credentials/form.tsx",
    "docs/secrets.md",
  ]) {
    it(`allows source/doc file_path ${filePath}`, () => {
      const result = runHook({
        tool_name: "Read",
        tool_input: { file_path: filePath },
      });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("{}");
    });
  }

  for (const filePath of [
    "/home/u/.aws/credentials",
    "/home/u/.git-credentials",
    "config/credentials.json",
    "config/credentials/prod.json",
    "config/secrets.yaml",
    "config/client_secret.json",
    "config/.env.production",
    "config/prod.env",
    ".env.local",
    "prod.env.local",
    "web.env.production",
    "secrets.py",
    "config/credentials.js",
    "/home/u/.ssh/helper.py",
  ]) {
    it(`blocks sensitive file_path ${filePath}`, () => {
      const result = runHook({
        tool_name: "Read",
        tool_input: { file_path: filePath },
      });
      expect(result.status).toBe(2);
      expect(result.stdout).toContain('"permissionDecision": "deny"');
      expect(result.stdout).toContain(filePath);
    });
  }

  it("allows a Grep whose content pattern mentions credentials", () => {
    // Grep's pattern is a content regex, not a path.
    for (const toolName of ["Grep", "grep"]) {
      const result = runHook({
        tool_name: toolName,
        tool_input: { pattern: "getCredentials", path: "src" },
      });
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("{}");
    }
  });

  // Regression: Grep's glob was never read, and tool_input.path had no test.
  for (const [label, payload] of [
    [
      "a Grep glob",
      {
        tool_name: "Grep",
        tool_input: { pattern: "KEY", path: ".", glob: ".env" },
      },
    ],
    [
      "a Grep path",
      {
        tool_name: "Grep",
        tool_input: { pattern: "KEY", path: "config/.env" },
      },
    ],
  ]) {
    for (const [mode, run] of [
      ["", runHook],
      [" when node is missing", runHookWithoutNode],
    ]) {
      it(`blocks ${label} naming a dotenv file${mode}`, () => {
        const result = run(payload);
        expect(result.status).toBe(2);
        const out = JSON.parse(result.stdout).hookSpecificOutput;
        expect(out.permissionDecision).toBe("deny");
      });
    }
  }

  // Regression: a Grep glob was only checked as a literal path, so wildcards
  // over a sensitive name passed, and a directory path had no "/" probe.
  for (const [label, toolInput, nodeStatus, reason] of [
    ["glob .env*", { glob: ".env*" }, 2],
    ["glob **/.env*", { glob: "**/.env*" }, 2],
    ["glob {.env,x}", { glob: "{.env,x}" }, 2],
    ["glob .[e]nv", { glob: ".[e]nv" }, 2],
    ["glob .e*", { glob: ".e*" }, 2],
    ["glob **/id_*", { glob: "**/id_*" }, 2],
    // Glob-vs-glob: a wildcard over part of a sensitive name.
    ["glob *ecret*.yaml", { glob: "*ecret*.yaml" }, 2, "'*ecret*.yaml'"],
    ["glob .e*.local", { glob: ".e*.local" }, 2],
    ["glob id_rs?.*", { glob: "id_rs?.*" }, 2],
    ["glob s?cret-prod.json", { glob: "s?cret-prod.json" }, 2],
    ["glob s*", { glob: "s*" }, 0],
    // ripgrep reads \x in a glob as a literal x.
    ["glob *.p\\em", { glob: "*.p\\em" }, 2],
    ["glob **/id_\\rsa*", { glob: "**/id_\\rsa*" }, 2],
    ["glob .\\env", { glob: ".\\env" }, 2],
    ["path /home/u/.ssh", { path: "/home/u/.ssh" }, 2],
    ["path /home/u/.aws", { path: "/home/u/.aws" }, 2],
    ["path /home/u/.gnupg", { path: "/home/u/.gnupg" }, 2],
    ["glob *.ts", { glob: "*.ts" }, 0],
    ["glob **/*.test.ts", { glob: "**/*.test.ts" }, 0],
    // A leading "!" makes ripgrep exclude the matches: it reads nothing.
    ["glob !**/.env.*", { glob: "!**/.env.*" }, 0],
    ["glob !**/.e*", { glob: "!**/.e*" }, 0],
    // Claude Code splits the glob on whitespace, then on commas (outside
    // braces), into one --glob per piece: only the "!" pieces exclude.
    ["glob !x .e*", { glob: "!x .e*" }, 2],
    ["glob !x,.e*", { glob: "!x,.e*" }, 2],
    ["glob !*.ts .e*", { glob: "!*.ts .e*" }, 2],
    ["glob .e* x", { glob: ".e* x" }, 2],
    ["glob .e*,x", { glob: ".e*,x" }, 2],
    ["glob !!.e*", { glob: "!!.e*" }, 2],
    ["glob .env,x", { glob: ".env,x" }, 2],
    ["glob !x,.env", { glob: "!x,.env" }, 2],
  ]) {
    const payload = {
      tool_name: "Grep",
      tool_input: { pattern: "KEY", ...toolInput },
    };
    it(`${nodeStatus ? "blocks" : "allows"} a Grep ${label}`, () => {
      const result = runHook(payload);
      expect(result.status).toBe(nodeStatus);
      if (!nodeStatus) expect(result.stdout.trim()).toBe("{}");
      if (reason) expect(result.stdout).toContain(reason);
    });
    // Without node every wildcard glob is denied (degraded mode).
    it(`blocks a Grep ${label} when node is missing`, () => {
      const result = runHookWithoutNode(payload);
      expect(result.status).toBe(2);
      const out = JSON.parse(result.stdout).hookSpecificOutput;
      expect(out.permissionDecision).toBe("deny");
    });
  }

  // Regression: the Grep "<path>/" probe missed the unslashed '\.example$'
  // safe row, so 'secret' denied a path that Read allows.
  it("allows a Grep path config/secrets.example", () => {
    const result = runHook({
      tool_name: "Grep",
      tool_input: { pattern: "KEY", path: "config/secrets.example" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
  });

  it("blocks a Glob pattern for .env.* files", () => {
    const result = runHook({
      tool_name: "Glob",
      tool_input: { pattern: "**/.env.*" },
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"permissionDecision": "deny"');
    expect(result.stdout).toContain("**/.env.*");
  });

  // Regression: a Glob pattern only got literal-regex checks, so a wildcard
  // over a sensitive name passed.
  for (const [pattern, status] of [
    ["**/id_*", 2],
    ["**/*.ts", 0],
  ]) {
    it(`${status ? "blocks" : "allows"} a Glob pattern ${pattern}`, () => {
      const result = runHook({ tool_name: "Glob", tool_input: { pattern } });
      expect(result.status).toBe(status);
      if (!status) expect(result.stdout.trim()).toBe("{}");
    });
  }

  it("blocks an apply_patch whose sensitive header follows a quoted hunk", () => {
    // Regression: the old `"[^"]*"` capture truncated the command at the first
    // escaped quote in the body, hiding any header after the first quoted hunk.
    const command = [
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "@@",
      "-const a = 1;",
      '+const a = "hello";',
      "*** Add File: config/secrets.env",
      "+SECRET=value",
      "*** End Patch",
    ].join("\n");
    const result = runHook({
      tool_name: "apply_patch",
      tool_input: { command },
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"hookEventName": "PreToolUse"');
    expect(result.stdout).toContain('"permissionDecision": "deny"');
    expect(result.stdout).toContain('"permissionDecisionReason"');
    expect(result.stdout).toContain("config/secrets.env");
  });

  it("allows an apply_patch that only touches safe files", () => {
    const command = [
      "*** Begin Patch",
      "*** Update File: src/app.ts",
      "@@",
      '+const greeting = "hi";',
      "*** End Patch",
    ].join("\n");
    const result = runHook({
      tool_name: "apply_patch",
      tool_input: { command },
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
  });

  it("blocks an apply_patch when node is missing", () => {
    // Regression: without node the patch headers were never read (fail open).
    const command = [
      "*** Begin Patch",
      "*** Add File: config/secrets.env",
      "+SECRET=value",
      "*** End Patch",
    ].join("\n");
    const result = runHookWithoutNode({
      tool_name: "apply_patch",
      tool_input: { command },
    });
    expect(result.status).toBe(2);
    const out = JSON.parse(result.stdout).hookSpecificOutput;
    expect(out.permissionDecision).toBe("deny");
    expect(out.permissionDecisionReason).toContain("needs node");
  });

  it("blocks a file_path with an escaped quote when node is missing", () => {
    // Regression: the grep fallback capture stopped at the escaped quote.
    const result = runHookWithoutNode({
      tool_name: "Read",
      tool_input: { file_path: 'a"b.env' },
    });
    expect(result.status).toBe(2);
    const out = JSON.parse(result.stdout).hookSpecificOutput;
    expect(out.permissionDecision).toBe("deny");
    expect(out.permissionDecisionReason).toContain('a"b.env');
  });
});

// runHookWithoutNode <payload> — run the hook with PATH limited to a shim
// directory holding the tools it needs, but no node.
function runHookWithoutNode(payload) {
  const shim = fs.mkdtempSync(path.join(os.tmpdir(), "cf-privacy-shim-"));
  try {
    for (const tool of [
      "bash",
      "cat",
      "grep",
      "sed",
      "head",
      "dirname",
      "tr",
    ]) {
      const real = execFileSync("which", [tool], { encoding: "utf8" }).trim();
      fs.symlinkSync(real, path.join(shim, tool));
    }
    return runHook(payload, path.join(shim, "bash"), {
      PATH: shim,
      HOME: shim,
    });
  } finally {
    fs.rmSync(shim, { recursive: true, force: true });
  }
}
