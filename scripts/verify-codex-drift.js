#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
    ...options,
  });
}

const build = run(process.execPath, ["scripts/build-codex-plugin.js"]);
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const diff = run("git", ["diff", "--quiet", "--", "plugin-codex"]);
if (diff.status === 0) {
  process.exit(0);
}

if (diff.status === 1) {
  console.error(
    [
      "",
      "plugin-codex is stale.",
      "Run `npm run build:codex` and commit the generated changes.",
      "",
    ].join("\n"),
  );
  run("git", ["diff", "--stat", "--", "plugin-codex"]);
  process.exit(1);
}

console.error("Unable to compare the generated Codex plugin artifact.");
process.exit(diff.status ?? 1);
