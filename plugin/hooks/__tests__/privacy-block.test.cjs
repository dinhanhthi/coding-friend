"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.resolve(__dirname, "../privacy-block.sh");

function runHook(payload) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cf-privacy-block-"));
  try {
    const stdout = execFileSync("bash", [SCRIPT], {
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
  it("blocks a sensitive file_path", () => {
    const result = runHook({
      tool_name: "Read",
      tool_input: { file_path: "config/.env" },
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('"decision": "block"');
  });

  it("allows a normal file_path", () => {
    const result = runHook({
      tool_name: "Read",
      tool_input: { file_path: "src/app.ts" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("{}");
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
    expect(result.stdout).toContain('"decision": "block"');
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
