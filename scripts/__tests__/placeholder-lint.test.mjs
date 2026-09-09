import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findAntigravityArtifactLintIssues,
  findCodexArtifactLintIssues,
  findPlaceholderLintIssues,
} from "../placeholder-lint.mjs";

test("published Claude sources do not contain unresolved placeholders", async () => {
  const issues = await findPlaceholderLintIssues();
  assert.deepEqual(issues, []);
});

test("generated Codex instructions do not contain Claude-only runtime APIs", async () => {
  const issues = await findCodexArtifactLintIssues();
  assert.deepEqual(issues, []);
});

test("generated AGY instructions do not contain Claude-only runtime APIs", async () => {
  const issues = await findAntigravityArtifactLintIssues();
  assert.deepEqual(issues, []);
});

test("Codex lint reports Claude host name in skill sub-files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cf-lint-subfile-"));
  await fs.mkdir(path.join(root, "plugin-codex", "skills", "cf-x", "modes"), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, "plugin-codex", "agents"), { recursive: true });
  await fs.writeFile(
    path.join(root, "plugin-codex", "skills", "cf-x", "SKILL.md"),
    "# clean\n",
  );
  await fs.writeFile(
    path.join(root, "plugin-codex", "skills", "cf-x", "modes", "a.md"),
    "if Claude finds itself about to ask\n",
  );

  const issues = await findCodexArtifactLintIssues(root, { strict: false });
  const hit = issues.find(
    (issue) =>
      issue.file === "plugin-codex/skills/cf-x/modes/a.md" &&
      issue.value.includes("if Claude finds itself"),
  );
  assert.ok(hit, "expected Claude host name issue in skill sub-file");
  assert.equal(hit.type, "Claude host name");
});

test("Codex must-contain reports missing required host phrasing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cf-lint-must-"));
  await fs.mkdir(path.join(root, "plugin-codex", "skills"), { recursive: true });
  await fs.mkdir(path.join(root, "plugin-codex", "agents"), { recursive: true });
  await fs.mkdir(path.join(root, "plugin-codex", "context"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, "plugin-codex", "context", "bootstrap.md"),
    "# coding-friend\nNo required host phrasing.\n",
  );

  const issues = await findCodexArtifactLintIssues(root, { strict: false });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, "missing required host phrasing");
  assert.equal(issues[0].file, "plugin-codex/context/bootstrap.md");
  assert.equal(issues[0].line, 0);
});

test("AGY must-contain reports missing required host phrasing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cf-lint-agy-must-"));
  await fs.mkdir(path.join(root, "plugin-antigravity", "rules"), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, "plugin-antigravity", "skills"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, "plugin-antigravity", "rules", "AGENTS.md"),
    "# coding-friend\nNo required host phrasing.\n",
  );

  const issues = await findAntigravityArtifactLintIssues(root, {
    strict: false,
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].type, "missing required host phrasing");
  assert.equal(issues[0].file, "plugin-antigravity/rules/AGENTS.md");
  assert.equal(issues[0].line, 0);
});

test("Codex production lint fails when a must-contain file is missing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cf-lint-prod-miss-"));
  await fs.mkdir(path.join(root, "plugin-codex", "skills", "cf-plan"), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, "plugin-codex", "skills", "cf-review"), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, "plugin-codex", "agents"), { recursive: true });
  await fs.writeFile(
    path.join(root, "plugin-codex", "skills", "cf-plan", "SKILL.md"),
    "Use $cf-plan to start.\n",
  );
  await fs.writeFile(
    path.join(root, "plugin-codex", "skills", "cf-review", "SKILL.md"),
    "Codex host behavior\n",
  );

  const issues = await findCodexArtifactLintIssues(root);
  const missing = issues.find(
    (issue) => issue.file === "plugin-codex/context/bootstrap.md",
  );
  assert.ok(
    missing,
    "expected missing plugin-codex/context/bootstrap.md to fail closed",
  );
});

test("Codex must-contain reports present-but-wrong host phrasing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cf-lint-wrong-codex-"));
  await fs.mkdir(path.join(root, "plugin-codex", "context"), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, "plugin-codex", "skills", "cf-plan"), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, "plugin-codex", "skills", "cf-review"), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, "plugin-codex", "agents"), { recursive: true });
  await fs.writeFile(
    path.join(root, "plugin-codex", "context", "bootstrap.md"),
    "# coding-friend\nNo dispatch verb.\n",
  );
  await fs.writeFile(
    path.join(root, "plugin-codex", "skills", "cf-plan", "SKILL.md"),
    "# plan\nNo dollar-cf invoke.\n",
  );
  await fs.writeFile(
    path.join(root, "plugin-codex", "skills", "cf-review", "SKILL.md"),
    "# review\nNo host behavior line.\n",
  );

  const issues = await findCodexArtifactLintIssues(root);
  const phrasing = issues.filter(
    (issue) => issue.type === "missing required host phrasing",
  );
  assert.equal(phrasing.length, 3);
  assert.deepEqual(
    phrasing.map((issue) => issue.file).sort(),
    [
      "plugin-codex/context/bootstrap.md",
      "plugin-codex/skills/cf-plan/SKILL.md",
      "plugin-codex/skills/cf-review/SKILL.md",
    ],
  );
});

test("AGY must-contain reports present-but-wrong host phrasing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cf-lint-wrong-agy-"));
  await fs.mkdir(path.join(root, "plugin-antigravity", "rules"), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, "plugin-antigravity", "skills", "cf-plan"), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, "plugin-antigravity", "skills", "cf-review"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, "plugin-antigravity", "rules", "AGENTS.md"),
    "# agents\nNo subagent invoke.\n",
  );
  await fs.writeFile(
    path.join(root, "plugin-antigravity", "skills", "cf-plan", "SKILL.md"),
    "# plan\nNo model wording.\n",
  );
  await fs.writeFile(
    path.join(root, "plugin-antigravity", "skills", "cf-review", "SKILL.md"),
    "# review\nNo host behavior line.\n",
  );

  const issues = await findAntigravityArtifactLintIssues(root);
  const phrasing = issues.filter(
    (issue) => issue.type === "missing required host phrasing",
  );
  assert.equal(phrasing.length, 3);
  assert.deepEqual(
    phrasing.map((issue) => issue.file).sort(),
    [
      "plugin-antigravity/rules/AGENTS.md",
      "plugin-antigravity/skills/cf-plan/SKILL.md",
      "plugin-antigravity/skills/cf-review/SKILL.md",
    ],
  );
});

test("Codex must-contain fails on unreadable files even in fixture mode", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cf-lint-unread-"));
  await fs.mkdir(path.join(root, "plugin-codex", "skills", "cf-plan", "SKILL.md"), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, "plugin-codex", "agents"), { recursive: true });

  const issues = await findCodexArtifactLintIssues(root, { strict: false });
  const hit = issues.find(
    (issue) => issue.file === "plugin-codex/skills/cf-plan/SKILL.md",
  );
  assert.ok(hit, "expected unreadable must-contain file to fail, not skip");
});

test("Codex lint reports fenced run_in_background in skill sub-files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cf-lint-fenced-bg-"));
  await fs.mkdir(path.join(root, "plugin-codex", "skills", "cf-x", "modes"), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, "plugin-codex", "agents"), { recursive: true });
  await fs.writeFile(
    path.join(root, "plugin-codex", "skills", "cf-x", "SKILL.md"),
    "# clean\n",
  );
  await fs.writeFile(
    path.join(root, "plugin-codex", "skills", "cf-x", "modes", "a.md"),
    "```\nrun_in_background: true\nbash x\n```\n",
  );

  const issues = await findCodexArtifactLintIssues(root, { strict: false });
  const hit = issues.find(
    (issue) =>
      issue.file === "plugin-codex/skills/cf-x/modes/a.md" &&
      issue.type === "Claude background flag",
  );
  assert.ok(hit, "expected fenced run_in_background to be reported");
  assert.match(hit.value, /run_in_background/);
});
