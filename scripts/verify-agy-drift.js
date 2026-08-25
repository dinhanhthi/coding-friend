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

const build = run(process.execPath, ["scripts/build-antigravity-plugin.js"]);
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

// `git diff` only sees tracked files; a newly generated artifact file would
// slip through as untracked, so check those explicitly.
const untracked = run(
  "git",
  ["ls-files", "--others", "--exclude-standard", "--", "plugin-antigravity"],
  { stdio: ["ignore", "pipe", "inherit"] },
);
if (untracked.status !== 0) {
  console.error("Unable to list untracked Antigravity plugin artifact files.");
  process.exit(untracked.status ?? 1);
}
if (untracked.stdout.trim() !== "") {
  console.error(
    [
      "",
      "plugin-antigravity has untracked generated files.",
      "Run `npm run build:agy` and commit the generated changes:",
      untracked.stdout.trim().replace(/^/gm, "  - "),
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const diff = run("git", ["diff", "--quiet", "--", "plugin-antigravity"]);
if (diff.status === 0) {
  process.exit(0);
}

if (diff.status === 1) {
  console.error(
    [
      "",
      "plugin-antigravity is stale.",
      "Run `npm run build:agy` and commit the generated changes.",
      "",
    ].join("\n"),
  );
  run("git", ["diff", "--stat", "--", "plugin-antigravity"]);
  process.exit(1);
}

console.error("Unable to compare the generated Antigravity plugin artifact.");
process.exit(diff.status ?? 1);
