#!/usr/bin/env node

// Refresh local plugin installs after editing anything under plugin/.
// Covers four hosts (Claude Code, Codex, omp, Antigravity):
//   1.  build:codex → regenerate plugin-codex/ from plugin/
//   1b. build:agy   → regenerate plugin-antigravity/ from plugin/
//   2.  cf dev sync → copy plugin/ into the Claude Code dev cache, or
//       cf dev update (full reinstall) when the plugin version changed
//   2b. cf update --agent omp --plugin → re-deploy converted agents into ~/.omp
//       (omp reads skills from the Claude cache and hooks/extension live from the repo)
//   2c. cf update --agent agy --plugin → re-deploy plugin-antigravity/ into
//       ~/.gemini/config/plugins/coding-friend
//   3.  clear Codex cache → Codex re-copies plugin-codex/ on next launch
// Wired as: npm run ud-plugin-local

const { execFileSync } = require("node:child_process");
const { rmSync, existsSync, readFileSync } = require("node:fs");
const { homedir } = require("node:os");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const CODEX_CACHE = path.join(
  homedir(),
  ".codex/plugins/cache/coding-friend-marketplace",
);
const CLAUDE_CONFIG_DIR =
  process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(homedir(), ".claude");
const INSTALLED_PLUGINS = path.join(
  CLAUDE_CONFIG_DIR,
  "plugins/installed_plugins.json",
);

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: "inherit", cwd: REPO_ROOT });
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return null;
  }
}

/** Version in plugin/.claude-plugin/plugin.json — what we want installed. */
function repoPluginVersion() {
  return (
    readJson(path.join(REPO_ROOT, "plugin/.claude-plugin/plugin.json"))
      ?.version ?? null
  );
}

/** Version Claude Code has registered — what `cf --version` reports. */
function installedPluginVersion() {
  const plugins = readJson(INSTALLED_PLUGINS)?.plugins;
  if (!plugins) return null;
  for (const [key, value] of Object.entries(plugins)) {
    if (!key.includes("coding-friend")) continue;
    const entry = Array.isArray(value) ? value[0] : value;
    if (typeof entry?.version === "string") return entry.version;
  }
  return null;
}

console.log("\n  \u{1F4E6} Updating local plugin installs...\n");

// 1. Regenerate plugin-codex/ from plugin/ source (same as `npm run build:codex`)
console.log("  → build:codex");
run("node", [path.join(REPO_ROOT, "scripts", "build-codex-plugin.js")]);

// 1b. Regenerate plugin-antigravity/ from plugin/ source (same as `npm run build:agy`)
console.log("\n  → build:agy");
run("node", [path.join(REPO_ROOT, "scripts", "build-antigravity-plugin.js")]);

// 2. Refresh the Claude Code dev install.
//    `cf dev sync` only copies files into the already-installed version dir — it
//    never touches installed_plugins.json. So after a version bump it would
//    leave Claude Code registered at the old version (`cf --version` keeps
//    reporting it). A version change needs `cf dev update`, which reinstalls
//    from the local marketplace and re-registers.
//    Skips gracefully if dev mode is OFF or `cf` is not on PATH.
const repoVersion = repoPluginVersion();
const installedVersion = installedPluginVersion();
const needsReinstall = !installedVersion || repoVersion !== installedVersion;
const claudeArgs = needsReinstall ? ["dev", "update"] : ["dev", "sync"];

let claudeSynced = false;
console.log(`\n  → cf ${claudeArgs.join(" ")}`);
if (needsReinstall) {
  console.log(
    `  ℹ plugin version ${installedVersion ?? "unregistered"} → ${repoVersion} — reinstalling to re-register`,
  );
}
try {
  run("cf", claudeArgs);
  claudeSynced = true;
} catch {
  console.log(
    `  ⚠ cf ${claudeArgs.join(" ")} skipped — is dev mode ON (\`cf dev on .\`) and is \`cf\` on PATH?`,
  );
}

// 2b. Re-deploy converted agents into ~/.omp so omp picks up plugin/agents/ edits.
//     Skills/hooks/extension are read live (Claude cache / repo), only agents are copied.
//     Skips gracefully if omp is not installed or `cf` is not on PATH.
let ompSynced = false;
console.log("\n  → cf update --agent omp --plugin");
try {
  run("cf", ["update", "--agent", "omp", "--plugin"]);
  ompSynced = true;
} catch {
  console.log(
    "  ⚠ omp redeploy skipped — is omp installed and is `cf` on PATH?",
  );
}

// 2c. Re-deploy plugin-antigravity/ into ~/.gemini/config/plugins/coding-friend.
//     Skips gracefully if agy is not installed or `cf` is not on PATH.
let agySynced = false;
console.log("\n  → cf update --agent agy --plugin");
try {
  run("cf", ["update", "--agent", "agy", "--plugin"]);
  agySynced = true;
} catch {
  console.log("  ⚠ agy update skipped — is agy installed and is `cf` on PATH?");
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
console.log(`    • Codex   — quit and relaunch (re-copies plugin-codex/)`);
if (claudeSynced) {
  console.log(
    "    • Claude Code — restart, or run `/plugin` and reload coding-friend",
  );
} else {
  console.log(
    "    • Claude Code — not synced; run `cf dev on .` then this script again",
  );
}
if (ompSynced) {
  console.log(
    "    • oh-my-pi — restart omp (agents redeployed; hooks/extension read live from repo)",
  );
}
if (agySynced) {
  console.log(
    "    • Antigravity — quit and relaunch (reloads ~/.gemini/config/plugins/coding-friend/)",
  );
} else {
  console.log(
    "    • Antigravity — not updated; install agy and ensure `cf` is on PATH, then run this script again",
  );
}
console.log("");
