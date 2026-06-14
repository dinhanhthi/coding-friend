#!/usr/bin/env node

// Refresh local plugin installs after editing anything under plugin/.
// Runs three steps so both clients pick up your source changes:
//   1. build:codex  → regenerate plugin-codex/ from plugin/
//   2. cf dev sync  → copy plugin/ into the Claude Code dev cache
//   3. clear Codex cache → Codex re-copies plugin-codex/ on next launch
// Wired as: npm run ud-plugin-local

const { execFileSync } = require("node:child_process");
const { rmSync, existsSync } = require("node:fs");
const { homedir } = require("node:os");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const CODEX_CACHE = path.join(
  homedir(),
  ".codex/plugins/cache/coding-friend-marketplace",
);

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: "inherit", cwd: REPO_ROOT });
}

console.log("\n  \u{1F4E6} Updating local plugin installs...\n");

// 1. Regenerate plugin-codex/ from plugin/ source (same as `npm run build:codex`)
console.log("  → build:codex");
run("node", [path.join(REPO_ROOT, "scripts", "build-codex-plugin.js")]);

// 2. Sync plugin/ into the Claude Code dev cache.
//    Skips gracefully if dev mode is OFF or `cf` is not on PATH.
let claudeSynced = false;
console.log("\n  → cf dev sync");
try {
  run("cf", ["dev", "sync"]);
  claudeSynced = true;
} catch {
  console.log(
    "  ⚠ cf dev sync skipped — is dev mode ON (`cf dev on .`) and is `cf` on PATH?",
  );
}

// 3. Clear the Codex cache so Codex re-copies plugin-codex/ on next launch.
console.log("\n  → clearing Codex cache");
if (existsSync(CODEX_CACHE)) {
  rmSync(CODEX_CACHE, { recursive: true, force: true });
  console.log(`  ✓ removed ${CODEX_CACHE}`);
} else {
  console.log("  ✓ Codex cache already clear");
}

// Final reminder — changes only load after a restart.
console.log("\n  ✅ Local plugin updated.\n");
console.log("  ⚠ RESTART REQUIRED to load changes:");
console.log(
  `    • Codex   — quit and relaunch (re-copies plugin-codex/)`,
);
if (claudeSynced) {
  console.log(
    "    • Claude Code — restart, or run `/plugin` and reload coding-friend",
  );
} else {
  console.log(
    "    • Claude Code — not synced; run `cf dev on .` then this script again",
  );
}
console.log("");
