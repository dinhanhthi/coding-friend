"use strict";

const { execFileSync } = require("child_process");
const path = require("path");

const LIB = path.resolve(__dirname, "../agy-hook-io.sh");

function runHelpers(payload, script, extra = "") {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  return execFileSync(
    "bash",
    [
      "-c",
      `${extra}source ${JSON.stringify(LIB)}; agy_read_payload; ${script}`,
    ],
    { input, encoding: "utf8", timeout: 5000 },
  );
}

describe("agy-hook-io.sh", () => {
  it("prints path-like AbsolutePath from view_file args", () => {
    const out = runHelpers(
      { toolCall: { name: "view_file", args: { AbsolutePath: "/tmp/a.env" } } },
      "agy_path_args",
    );
    expect(out.trim()).toBe("/tmp/a.env");
  });

  it("includes run_command CommandLine even when it is not path-like", () => {
    const out = runHelpers(
      { toolCall: { name: "run_command", args: { CommandLine: "cat .env" } } },
      "agy_path_args",
    );
    expect(out.trim().split("\n")).toContain("cat .env");
  });

  it("prints a single-segment TargetFile like .env", () => {
    const out = runHelpers(
      {
        toolCall: {
          name: "write_to_file",
          args: { TargetFile: ".env" },
        },
      },
      "agy_path_args",
    );
    expect(out.trim().split("\n")).toContain(".env");
  });

  it("prints a single-segment Pattern like .env", () => {
    const out = runHelpers(
      {
        toolCall: {
          name: "find_by_name",
          args: { Pattern: ".env" },
        },
      },
      "agy_path_args",
    );
    expect(out.trim().split("\n")).toContain(".env");
  });

  it("prints a single-segment DirectoryPath like node_modules", () => {
    const out = runHelpers(
      {
        toolCall: {
          name: "list_dir",
          args: { DirectoryPath: "node_modules" },
        },
      },
      "agy_path_args",
    );
    expect(out.trim().split("\n")).toContain("node_modules");
  });

  it("skips CodeContent, Query, and other non-path strings", () => {
    const out = runHelpers(
      {
        toolCall: {
          name: "write_to_file",
          args: {
            TargetFile: "src/a.ts",
            CodeContent: "const secret = '/node_modules/x';",
            Description: "node_modules/secret",
          },
        },
      },
      "agy_path_args",
    );
    expect(out.trim().split("\n")).toEqual(["src/a.ts"]);
  });

  it("skips grep_search Query while collecting SearchPath", () => {
    const out = runHelpers(
      {
        toolCall: {
          name: "grep_search",
          args: { SearchPath: "src/", Query: "dist" },
        },
      },
      "agy_path_args",
    );
    expect(out.trim().split("\n")).toEqual(["src/"]);
  });

  it("collects ReplacementChunks[].TargetFile and skips ReplacementContent", () => {
    const out = runHelpers(
      {
        toolCall: {
          name: "multi_replace_file_content",
          args: {
            ReplacementChunks: [
              {
                TargetFile: "src/b.ts",
                ReplacementContent: "secret /node_modules/",
              },
            ],
          },
        },
      },
      "agy_path_args",
    );
    expect(out.trim().split("\n")).toEqual(["src/b.ts"]);
  });

  it("collects glob Pattern *.env", () => {
    const out = runHelpers(
      {
        toolCall: {
          name: "find_by_name",
          args: { Pattern: "*.env" },
        },
      },
      "agy_path_args",
    );
    expect(out.trim().split("\n")).toContain("*.env");
  });

  it("reads a dotted field", () => {
    const out = runHelpers({ invocationNum: 1 }, "agy_field invocationNum");
    expect(out.trim()).toBe("1");
  });

  it("emits valid decision and inject JSON", () => {
    const allow = runHelpers("{}", "agy_emit_allow");
    expect(JSON.parse(allow)).toEqual({ decision: "allow" });

    const deny = runHelpers("{}", 'agy_emit_deny "blocked \\"here\\""');
    expect(JSON.parse(deny)).toEqual({
      decision: "deny",
      reason: 'blocked "here"',
    });

    const empty = runHelpers("{}", "agy_emit_empty");
    expect(JSON.parse(empty)).toEqual({});

    const inject = runHelpers("{}", 'agy_emit_inject "HOST: agy"');
    expect(JSON.parse(inject)).toEqual({
      injectSteps: [{ ephemeralMessage: "HOST: agy" }],
    });
  });

  it("fails open on malformed JSON under set -euo pipefail", () => {
    const out = runHelpers(
      "not-json",
      "agy_field invocationNum; agy_path_args; agy_emit_allow",
      "set -euo pipefail; ",
    );
    expect(out.trim()).toBe('{"decision":"allow"}');
  });
});
