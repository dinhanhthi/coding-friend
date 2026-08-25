"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.resolve(__dirname, "../scout-block.agy.cjs");
const PLUGIN_ROOT = path.resolve(__dirname, "../..");

function runHook(payload, { config, ignore } = {}) {
  const tempProject = fs.mkdtempSync(
    path.join(os.tmpdir(), "cf-scout-block-agy-"),
  );
  try {
    if (config || ignore != null) {
      fs.mkdirSync(path.join(tempProject, ".coding-friend"), {
        recursive: true,
      });
      if (config) {
        fs.writeFileSync(
          path.join(tempProject, ".coding-friend", "config.json"),
          JSON.stringify(config),
        );
      }
      if (ignore != null) {
        fs.writeFileSync(
          path.join(tempProject, ".coding-friend", "ignore"),
          ignore,
        );
      }
    }
    const input =
      typeof payload === "string"
        ? payload
        : JSON.stringify({
            ...payload,
            workspacePaths: payload.workspacePaths || [tempProject],
          });
    const stdout = execFileSync("node", [SCRIPT], {
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

describe("scout-block.agy.cjs", () => {
  it("denies a blocked node_modules path (exit 0)", () => {
    const result = runHook({
      toolCall: {
        name: "view_file",
        args: { AbsolutePath: "/x/node_modules/pkg/index.js" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toContain("node_modules");
  });

  it("denies list_dir DirectoryPath node_modules (relative, single segment)", () => {
    const result = runHook({
      toolCall: {
        name: "list_dir",
        args: { DirectoryPath: "node_modules" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toContain("node_modules");
  });

  it("allows a normal src path", () => {
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

  it("allows grep_search Query build/dist with SearchPath src/", () => {
    for (const query of ["build", "dist"]) {
      const result = runHook({
        toolCall: {
          name: "grep_search",
          args: { SearchPath: "src/", Query: query },
        },
      });
      expect(result.status).toBe(0);
      expect(result.json).toEqual({ decision: "allow" });
    }
  });

  it("denies find_by_name Pattern *node_modules*", () => {
    const result = runHook({
      toolCall: {
        name: "find_by_name",
        args: { Pattern: "*node_modules*" },
      },
    });
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toContain("node_modules");
  });

  it("allows malformed JSON (fail-open, exit 0)", () => {
    const result = runHook("not-json");
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
  });

  it("allows when scoutBlock is false in workspacePaths[0] (not hook cwd)", () => {
    const result = runHook(
      {
        toolCall: {
          name: "view_file",
          args: { AbsolutePath: "/x/node_modules/pkg/index.js" },
        },
      },
      { config: { scoutBlock: false } },
    );
    expect(result.status).toBe(0);
    expect(result.json).toEqual({ decision: "allow" });
  });

  it("applies project .coding-friend/ignore from workspacePaths[0]", () => {
    const result = runHook(
      {
        toolCall: {
          name: "view_file",
          args: { AbsolutePath: "my-secret-dir/x" },
        },
      },
      { ignore: "my-secret-dir\n" },
    );
    expect(result.status).toBe(0);
    expect(result.json.decision).toBe("deny");
    expect(result.json.reason).toContain("my-secret-dir");
  });
});
