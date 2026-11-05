/**
 * Contract tests for the coding-friend-mods signal helpers (plan M task 4.1):
 * the single `Review status:` line of /cf-review, the main reviewer agent type,
 * and the phase commit subject written by /cf-plan autopilot.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isMainReviewer,
  parsePhaseCommit,
  parseReviewStatus,
} from "../../plugin-mods/hooks/lib/signals.mjs";

test("parseReviewStatus reads the last Review status line and never guesses", () => {
  const cases = [
    [
      "## Summary\nAll good.\nReview status: COMPLETE\r\n",
      { status: "COMPLETE" },
    ],
    [
      `Review status: PARTIAL — ${"x".repeat(200)}`,
      { status: "PARTIAL", detail: `${"x".repeat(79)}…` },
    ],
    [
      "Review status: PARTIAL — old\nReview status: FAILED — time\u009b\u202e\u200e\u{e0041}out\x07",
      { status: "FAILED", detail: "timeout" },
    ],
    ["No status here.\nreview status: COMPLETE\nReview status: DONE", null],
    [undefined, null],
  ];
  for (const [text, expected] of cases) {
    assert.deepEqual(parseReviewStatus(text), expected, String(text));
  }
});

test("isMainReviewer accepts only the main cf-reviewer agent", () => {
  assert.equal(isMainReviewer("cf-reviewer"), true);
  assert.equal(isMainReviewer("coding-friend:cf-reviewer"), true);
  assert.equal(isMainReviewer("coding-friend:cf-reviewer-security"), false);
  assert.equal(isMainReviewer("my-cf-reviewer"), false);
});

test("parsePhaseCommit accepts phase commits only", () => {
  const out = (subject) =>
    `[cf-upgrade-m 1a2b3c4] ${subject}\n 2 files changed, 10 insertions(+)\n`;
  assert.deepEqual(parsePhaseCommit(out("feat(cli): phase 2/6 add x")), {
    n: 2,
    m: 6,
    name: "add x",
  });
  assert.equal(
    parsePhaseCommit(out(`fix!: phase 1/1 ${"y".repeat(100)}`)).name.length,
    60,
  );
  // Pre-commit hooks print before git's own `[branch sha] subject` line.
  assert.deepEqual(
    parsePhaseCommit(
      `Regenerating plugin-codex from staged source changes...\n\n> coding-friend@1.0.0 build:codex\n[warn] something\n${out("feat(cli): phase 3/6 wire it")}`,
    ),
    { n: 3, m: 6, name: "wire it" },
  );
  const rejected = [
    out("feat(ui): phase 3/4 task 1/5 add toggle"),
    out("chore(plan): phase 3/4 bookkeeping"),
    out("feat(ui): phase 3/4 review fixes"),
    out("feat(ui): phase 5/4 too far"),
    out("feat(ui): phase 0/4 zero"),
    "feat(cli): phase 2/6 add x",
    "nothing to commit, working tree clean",
    "",
  ];
  for (const text of rejected) {
    assert.equal(parsePhaseCommit(text), null, text);
  }
});
