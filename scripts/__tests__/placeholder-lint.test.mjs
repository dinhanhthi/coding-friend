import assert from "node:assert/strict";
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
