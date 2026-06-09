import assert from "node:assert/strict";
import test from "node:test";

import {
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
