import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const helpSkill = fs.readFileSync(
  path.join(repoRoot, "plugin/skills/cf-help/SKILL.md"),
  "utf8",
);
const helpTopics = fs.readFileSync(
  path.join(repoRoot, "plugin/skills/cf-help/topics.md"),
  "utf8",
);
const catalog = `${helpSkill}\n${helpTopics}`;

function listed(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`).test(
    catalog,
  );
}

test("cf-help catalog lists every skill", () => {
  const skillsDir = path.join(repoRoot, "plugin/skills");
  const skills = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("cf-"))
    .map((entry) => entry.name)
    .sort();
  assert.equal(skills.length, 27, `expected 27 skills, got ${skills.length}`);
  for (const skill of skills) {
    assert.ok(listed(skill), `cf-help catalog is missing skill ${skill}`);
  }
});

test("cf-help catalog lists every agent", () => {
  const agentsDir = path.join(repoRoot, "plugin/agents");
  const agents = fs
    .readdirSync(agentsDir)
    .filter((name) => /^cf-.*\.md$/.test(name))
    .map((name) => name.replace(/\.md$/, ""))
    .sort();
  assert.equal(agents.length, 12, `expected 12 agents, got ${agents.length}`);
  for (const agent of agents) {
    assert.ok(listed(agent), `cf-help catalog is missing agent ${agent}`);
  }
});

test("cf-help catalog lists every hook from hooks.json plus statusline", () => {
  const hooksJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "plugin/hooks/hooks.json"), "utf8"),
  );
  const names = new Set(["statusline.sh"]);
  for (const entries of Object.values(hooksJson.hooks)) {
    for (const entry of entries) {
      for (const hook of entry.hooks ?? []) {
        const command = hook.command ?? "";
        const match = command.match(/hooks\/([^/\s]+)$/);
        if (match) names.add(match[1]);
      }
    }
  }
  assert.ok(names.size >= 8, `expected many hooks, got ${names.size}`);
  for (const name of [...names].sort()) {
    assert.ok(listed(name), `cf-help catalog is missing hook ${name}`);
  }
});

/* ---------------------------------------------------------------------------
 * Topology parity (plan task 4.1)
 *
 * cf-help is copied verbatim onto both generated hosts, so a stale fanout
 * description is the answer Codex and Antigravity users get when they ask how
 * review works.
 * ------------------------------------------------------------------------ */

const RETAINED_SPECIALISTS = [
  "cf-reviewer-plan",
  "cf-reviewer-quality",
  "cf-reviewer-tests",
  "cf-reviewer-rules",
  "cf-reviewer-reducer",
];

test("cf-help no longer describes cf-reviewer as a fanout orchestrator", () => {
  assert.doesNotMatch(
    catalog,
    /cf-reviewer\*{0,2}\s*—?\s*⚡?\s*—?\s*Orchestrator/i,
    "cf-help still calls cf-reviewer an orchestrator",
  );
  for (const agent of RETAINED_SPECIALISTS) {
    const row = new RegExp(
      `\\\`${agent}\\\`\\s*\\|[^|]*\\|\\s*\\\`cf-reviewer\\\`\\s*[^|]*\\|`,
    );
    assert.doesNotMatch(
      catalog,
      row,
      `cf-help still says cf-reviewer dispatches ${agent}`,
    );
  }
});

test("cf-help states the 1 / 1 / 2 review dispatch cf-review actually uses", () => {
  assert.match(
    catalog,
    /cf-reviewer-security/,
    "the DEEP second reviewer must stay documented",
  );
  assert.match(
    catalog,
    /1 in QUICK, 1 in STANDARD, 2 in DEEP/,
    "cf-help must state the per-mode dispatch counts cf-review uses",
  );
  assert.match(
    catalog,
    /directly callable/i,
    "cf-help must say the retired specialists are still callable",
  );
});
