import assert from "node:assert/strict";
import test from "node:test";

import { findPlaceholderLintIssues } from "../placeholder-lint.mjs";

test("canonical markdown sources do not contain raw host-specific references", async () => {
  const issues = await findPlaceholderLintIssues();
  assert.deepEqual(issues, []);
});
