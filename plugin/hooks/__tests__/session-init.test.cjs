"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.resolve(__dirname, "../session-init.sh");
const PLUGIN_ROOT = path.resolve(__dirname, "../..");

describe("session-init.sh", () => {
  it("emits Codex host context when CF_HOST=codex", () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "cf-session-init-"));
    try {
      const stdout = execFileSync("bash", [SCRIPT], {
        cwd,
        input: JSON.stringify({ hookEventName: "SessionStart" }),
        encoding: "utf8",
        env: {
          ...process.env,
          PLUGIN_ROOT,
          CF_HOST: "codex",
        },
      });

      const parsed = JSON.parse(stdout);
      expect(parsed.hookSpecificOutput.hookEventName).toBe("SessionStart");
      expect(parsed.hookSpecificOutput.additionalContext).toContain(
        "HOST: codex",
      );
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
