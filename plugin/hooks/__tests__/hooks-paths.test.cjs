"use strict";

const fs = require("fs");
const path = require("path");

const HOOKS_JSON = path.resolve(__dirname, "../hooks.json");
const PLUGIN_DIR = path.resolve(__dirname, "../..");

function extractCommands(obj) {
  const commands = [];
  if (Array.isArray(obj)) {
    for (const item of obj) commands.push(...extractCommands(item));
  } else if (obj && typeof obj === "object") {
    for (const [key, val] of Object.entries(obj)) {
      if (key === "command" && typeof val === "string") commands.push(val);
      else commands.push(...extractCommands(val));
    }
  }
  return commands;
}

describe("hooks.json path validation", () => {
  it("all command paths resolve to existing files", () => {
    const json = JSON.parse(fs.readFileSync(HOOKS_JSON, "utf8"));
    const commands = extractCommands(json);

    expect(commands.length).toBeGreaterThan(0);

    const missing = commands
      .map((cmd) => cmd.replace("${CLAUDE_PLUGIN_ROOT}/", ""))
      .filter((rel) => !fs.existsSync(path.join(PLUGIN_DIR, rel)));

    expect(missing).toEqual([]);
  });
});
