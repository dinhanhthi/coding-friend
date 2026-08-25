"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.resolve(__dirname, "../privacy-block.agy.sh");
const PLUGIN_ROOT = path.resolve(__dirname, "../..");

function runHook(payload, { config, bashBin = "bash" } = {}) {
  const tempProject = fs.mkdtempSync(
    path.join(os.tmpdir(), "cf-privacy-block-agy-"),
  );
  try {
    if (config) {
      fs.mkdirSync(path.join(tempProject, ".coding-friend"), {
        recursive: true,
      });
      fs.writeFileSync(
        path.join(tempProject, ".coding-friend", "config.json"),
        JSON.stringify(config),
      );
    }
    const input =
      typeof payload === "string"
        ? payload
        : JSON.stringify({
            ...payload,
            workspacePaths: payload.workspacePaths || [tempProject],
          });
    const stdout = execFileSync(bashBin, [SCRIPT], {
      cwd: PLUGIN_ROOT,
      input,
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT },
    });
    return { status: 0, stdout, json: JSON.parse(stdout.trim()) };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || "" };
  } finally {
    fs.rmSync(tempProject, { recursive: true, force: true });
  }
}

describe("privacy-block.agy.sh", () => {
  it("denies view_file of .env (exit 0)", () => {
    const result = runHook({
      toolCall: {
        name: "view_file",
        args: { AbsolutePath: "/x/.env" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toContain("/x/.env");
  });

  it("denies write_to_file TargetFile .env (relative, single segment)", () => {
    const result = runHook({
      toolCall: {
        name: "write_to_file",
        args: { TargetFile: ".env" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toContain(".env");
  });

  it("denies find_by_name Pattern .env", () => {
    const result = runHook({
      toolCall: {
        name: "find_by_name",
        args: { Pattern: ".env" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toContain(".env");
  });

  it("denies grep_search SearchPath ~/.ssh (exit 0)", () => {
    const result = runHook({
      toolCall: {
        name: "grep_search",
        args: { SearchPath: "~/.ssh", Query: "key" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toMatch(/\.ssh/);
  });

  it("allows write_to_file src/a.ts", () => {
    const result = runHook({
      toolCall: {
        name: "write_to_file",
        args: { TargetFile: "src/a.ts" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
  });

  it("allows write_to_file src/a.ts when CodeContent mentions secret and node_modules", () => {
    const result = runHook({
      toolCall: {
        name: "write_to_file",
        args: {
          TargetFile: "src/a.ts",
          CodeContent: "const secret = '/node_modules/pkg';",
        },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
  });

  it("denies find_by_name Pattern *.env", () => {
    const result = runHook({
      toolCall: {
        name: "find_by_name",
        args: { Pattern: "*.env" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toMatch(/\.env/);
  });

  it("allows find_by_name Pattern .env.example", () => {
    const result = runHook({
      toolCall: {
        name: "find_by_name",
        args: { Pattern: ".env.example" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
  });

  it('denies run_command "cat .env" (exit 0)', () => {
    const result = runHook({
      toolCall: {
        name: "run_command",
        args: { CommandLine: "cat .env" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toContain("cat .env");
  });

  it("allows malformed JSON (fail-open, exit 0)", () => {
    const result = runHook("not-json");
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
  });

  it("allows when privacyBlock is false in workspacePaths[0] (not hook cwd)", () => {
    const result = runHook(
      {
        toolCall: {
          name: "view_file",
          args: { AbsolutePath: "/x/.env" },
        },
      },
      { config: { privacyBlock: false } },
    );
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
  });
});
