/**
 * Regression tests for the cf-commit staged-diff scanner
 * (plugin/skills/cf-commit/scripts/scan-*.sh).
 *
 * `grep -c` prints "0" AND exits 1 when nothing matches, so a `|| echo 0`
 * fallback produced "0\n0" and the `-gt 0` test failed with
 * "integer expected". The count must be a single integer on stdout.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const scriptsDir = path.join(repoRoot, "plugin/skills/cf-commit/scripts");
const scanScript = path.join(
  scriptsDir,
  fs.readdirSync(scriptsDir).find((f) => f.startsWith("scan-")),
);

// Isolate fixtures from the developer's global/system git config.
const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-commit-scan-"));
  const git = (...args) =>
    spawnSync("git", args, { cwd: dir, env: gitEnv, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  return { dir, git };
}

function scan(dir) {
  return spawnSync("bash", [scanScript], {
    cwd: dir,
    env: gitEnv,
    encoding: "utf8",
  });
}

test("no matches: prints a single count of 0 and no shell error", () => {
  const { dir, git } = makeRepo();
  fs.writeFileSync(path.join(dir, "a.txt"), "hello world\n");
  git("add", "a.txt");

  const res = scan(dir);

  assert.equal(res.status, 0);
  assert.match(res.stdout, /^[A-Z]+=0\n$/);
  assert.equal(res.stderr, "");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("matches: prints the count and the matching lines", () => {
  const { dir, git } = makeRepo();
  fs.writeFileSync(path.join(dir, "b.txt"), "api_key = abc\nplain\n");
  git("add", "b.txt");

  const res = scan(dir);

  assert.equal(res.status, 0);
  assert.match(res.stdout, /^[A-Z]+=1\n/);
  assert.match(res.stdout, /=== Matches \(with context\) ===/);
  assert.match(res.stdout, /api_key = abc/);
  assert.equal(res.stderr, "");
  fs.rmSync(dir, { recursive: true, force: true });
});
