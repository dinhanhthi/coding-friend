#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const insideWorktree = spawnSync(
  "git",
  ["rev-parse", "--is-inside-work-tree"],
  {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  },
);

if (
  insideWorktree.status !== 0 ||
  insideWorktree.stdout.trim().toLowerCase() !== "true"
) {
  process.exit(0);
}

const currentHooksPath = spawnSync(
  "git",
  ["config", "--get", "core.hooksPath"],
  {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  },
);
const configuredPath = currentHooksPath.stdout.trim();

if (currentHooksPath.status === 0 && configuredPath !== ".githooks") {
  console.warn(
    `Keeping existing Git hooks path "${configuredPath}". Run \`git config core.hooksPath .githooks\` to use Coding Friend's tracked hooks.`,
  );
  process.exit(0);
}

const configure = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: "inherit",
});

if (configure.status !== 0) {
  console.error("Failed to configure the repository Git hooks path.");
  process.exit(configure.status ?? 1);
}
