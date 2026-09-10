import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findAgentFrontmatterIssues,
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
  await fs.mkdir(path.join(root, "plugin-codex", "agents"), {
    recursive: true,
  });
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
  await fs.mkdir(path.join(root, "plugin-codex", "skills"), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, "plugin-codex", "agents"), {
    recursive: true,
  });
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
  await fs.mkdir(path.join(root, "plugin-codex", "agents"), {
    recursive: true,
  });
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
  await fs.mkdir(path.join(root, "plugin-codex", "agents"), {
    recursive: true,
  });
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
  assert.deepEqual(phrasing.map((issue) => issue.file).sort(), [
    "plugin-codex/context/bootstrap.md",
    "plugin-codex/skills/cf-plan/SKILL.md",
    "plugin-codex/skills/cf-review/SKILL.md",
  ]);
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
  assert.deepEqual(phrasing.map((issue) => issue.file).sort(), [
    "plugin-antigravity/rules/AGENTS.md",
    "plugin-antigravity/skills/cf-plan/SKILL.md",
    "plugin-antigravity/skills/cf-review/SKILL.md",
  ]);
});

test("Codex must-contain fails on unreadable files even in fixture mode", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cf-lint-unread-"));
  await fs.mkdir(
    path.join(root, "plugin-codex", "skills", "cf-plan", "SKILL.md"),
    {
      recursive: true,
    },
  );
  await fs.mkdir(path.join(root, "plugin-codex", "agents"), {
    recursive: true,
  });

  const issues = await findCodexArtifactLintIssues(root, { strict: false });
  const hit = issues.find(
    (issue) => issue.file === "plugin-codex/skills/cf-plan/SKILL.md",
  );
  assert.ok(hit, "expected unreadable must-contain file to fail, not skip");
});

test("Codex lint reports leftover subagent_type", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cf-lint-subagent-"));
  await fs.mkdir(path.join(root, "plugin-codex", "skills", "cf-x"), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, "plugin-codex", "agents"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, "plugin-codex", "skills", "cf-x", "SKILL.md"),
    "Dispatch mentions subagent_type leftover.\n",
  );

  const issues = await findCodexArtifactLintIssues(root, { strict: false });
  const hit = issues.find(
    (issue) =>
      issue.file === "plugin-codex/skills/cf-x/SKILL.md" &&
      issue.type === "Claude subagent type",
  );
  assert.ok(hit, "expected bare subagent_type to be reported");
  assert.match(hit.value, /subagent_type/);
});

test("Codex lint reports fenced run_in_background in skill sub-files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cf-lint-fenced-bg-"));
  await fs.mkdir(path.join(root, "plugin-codex", "skills", "cf-x", "modes"), {
    recursive: true,
  });
  await fs.mkdir(path.join(root, "plugin-codex", "agents"), {
    recursive: true,
  });
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

async function writeSourceLintFixture(root, files) {
  await fs.writeFile(path.join(root, "README.md"), "# fixture\n");
  await fs.mkdir(path.join(root, "plugin", "agents"), { recursive: true });
  await fs.mkdir(path.join(root, "plugin", "lib"), { recursive: true });
  await fs.mkdir(path.join(root, "plugin", "context"), { recursive: true });
  if (!("plugin/context/bootstrap.md" in files)) {
    await fs.writeFile(
      path.join(root, "plugin", "context", "bootstrap.md"),
      "# bootstrap\n",
    );
  }
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content);
  }
}

test("source lint reports leftover Claude tool names in plugin skills", async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), "cf-lint-source-tools-"),
  );
  await writeSourceLintFixture(root, {
    "plugin/skills/cf-x/SKILL.md": [
      "Use the Agent tool",
      "AskUserQuestion",
      "run_in_background",
      "Skill tool",
      "if Claude finds itself",
      "Claude does NOT need",
      "Claude's own review",
      "",
    ].join("\n"),
  });

  const issues = await findPlaceholderLintIssues(root);
  const values = issues.map((issue) => issue.value);
  for (const expected of [
    "Agent tool",
    "AskUserQuestion",
    "run_in_background",
    "Skill tool",
    "if Claude finds itself",
    "Claude does NOT need",
    "Claude's own review",
  ]) {
    assert.ok(
      values.includes(expected),
      `expected source lint to report ${expected}, got ${JSON.stringify(values)}`,
    );
  }
});

test("source lint reports leftovers in cf-plan/cf-review and still skips bootstrap", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cf-lint-source-skip-"));
  await writeSourceLintFixture(root, {
    "plugin/skills/cf-plan/SKILL.md":
      "{{cf:slash cf-review}}\nUse the Agent tool here.\n",
    "plugin/skills/cf-review/SKILL.md":
      "{{cf:slash cf-review}}\nUse the Agent tool here.\n",
    "plugin/context/bootstrap.md":
      "{{cf:slash cf-review}}\nUse the Agent tool here.\n",
    "plugin/skills/cf-x/SKILL.md": "Use the Agent tool here.\n",
  });

  const issues = await findPlaceholderLintIssues(root);
  const leftoverFiles = issues
    .filter((issue) => issue.type === "Claude agent tool")
    .map((issue) => issue.file);
  const placeholderFiles = issues
    .filter((issue) => issue.type === "unresolved host placeholder")
    .map((issue) => issue.file);

  assert.ok(
    leftoverFiles.includes("plugin/skills/cf-x/SKILL.md"),
    "expected in-scope skill to be reported for Agent tool",
  );
  assert.ok(
    leftoverFiles.includes("plugin/skills/cf-plan/SKILL.md"),
    "expected cf-plan leftovers to be reported",
  );
  assert.ok(
    leftoverFiles.includes("plugin/skills/cf-review/SKILL.md"),
    "expected cf-review leftovers to be reported",
  );
  assert.equal(leftoverFiles.includes("plugin/context/bootstrap.md"), false);

  for (const excluded of [
    "plugin/skills/cf-plan/SKILL.md",
    "plugin/skills/cf-review/SKILL.md",
    "plugin/context/bootstrap.md",
  ]) {
    assert.ok(
      placeholderFiles.includes(excluded),
      `expected unresolved host placeholder in ${excluded}, got ${JSON.stringify(placeholderFiles)}`,
    );
  }
});

test("agent lint reports agents without a tools allow-list", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cf-lint-agent-tools-"));
  await fs.mkdir(path.join(root, "plugin", "agents"), { recursive: true });
  await fs.writeFile(
    path.join(root, "plugin", "agents", "cf-open.md"),
    "---\nname: cf-open\nmodel: haiku\n---\n# open\n",
  );
  await fs.writeFile(
    path.join(root, "plugin", "agents", "cf-closed.md"),
    "---\nname: cf-closed\ntools: Read, Grep\nmodel: haiku\n---\n# closed\n",
  );

  const issues = await findAgentFrontmatterIssues(root);
  assert.deepEqual(issues, [
    {
      file: "plugin/agents/cf-open.md",
      line: 1,
      type: "missing agent tools allow-list",
      value: "tools:",
    },
  ]);
});
