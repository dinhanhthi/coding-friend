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

function runHook(payload, bashBin = "bash") {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cf-privacy-block-"));
  try {
    const stdout = execFileSync(bashBin, [SCRIPT], {
      cwd,
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

  it("allows a safe .env.example file_path", () => {
    const result = runHook({
      tool_name: "Read",
      tool_input: { file_path: ".env.example" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
  });

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

  it("blocks a Glob pattern for .env.* files", () => {
    const result = runHook({
      tool_name: "Glob",
      tool_input: { pattern: "**/.env.*" },
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"permissionDecision": "deny"');
    expect(result.stdout).toContain("**/.env.*");
  });

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
});
