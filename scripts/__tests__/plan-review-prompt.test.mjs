import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const script = path.join(
  repoRoot,
  "plugin/skills/cf-plan-review/scripts/build-plan-review-prompt.sh",
);

function run(entryFile, docsDir = "docs") {
  return spawnSync("bash", [script, entryFile, docsDir], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

test("embeds cf-plan-review folder files and the four output headings", () => {
  const result = run("docs/plans/2026-09-05-cf-plan-review/README.md");
  assert.equal(result.status, 0, result.stderr);
  const stdout = result.stdout;
  assert.ok(stdout.includes("## Plan Files"), "missing ## Plan Files");
  assert.ok(stdout.includes("### brief.md"), "missing ### brief.md");
  assert.ok(stdout.includes("### README.md"), "missing ### README.md");
  assert.ok(
    stdout.includes("### phase-1-cf-plan-brief.md"),
    "missing ### phase-1-cf-plan-brief.md",
  );
  assert.ok(stdout.includes("🚨 Critical Issues"), "missing Critical Issues");
  assert.ok(stdout.includes("⚠️ Important Issues"), "missing Important Issues");
  assert.ok(stdout.includes("💡 Suggestions"), "missing Suggestions");
  assert.ok(stdout.includes("📋 Summary"), "missing Summary");
  // Line-anchored: embedded plan bodies mention these strings in prose.
  assert.ok(
    !/^### overview\./m.test(stdout),
    "must skip overview.* files",
  );
  assert.ok(!/^### review\.md$/m.test(stdout), "must skip review.md");
});

test("reports missing brief.md for a folder plan without one", () => {
  const result = run(
    "docs/plans/2026-08-30-website-without-with-cf/README.md",
  );
  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    result.stdout.includes("brief.md not found"),
    "missing brief.md not found",
  );
  assert.ok(result.stdout.includes("### README.md"), "missing ### README.md");
});

test("exits nonzero when the plan entry file does not exist", () => {
  assert.ok(fs.existsSync(script), `script missing: ${script}`);
  const result = run("docs/plans/does-not-exist-zzzz/README.md");
  assert.notEqual(result.status, 0);
});
