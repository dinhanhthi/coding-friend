/**
 * Core tests for the coding-friend-mods pure plan helpers (plan M task 4.5):
 * frontmatter status, Progress tables of a big plan (README phase table +
 * phase task table) and a small one-table plan, and the active plan choice.
 * Fixtures are trimmed inline copies of real plans (docs/ is gitignored).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseFrontmatter,
  parseProgress,
  pickActivePlan,
  summarize,
} from "../../plugin-mods/hooks/lib/plan.mjs";

const BIG_README = `---
slug: 2026-11-05-decision-layer-a # = plan folder name; copy this to mention or \`/cf-plan-resume <slug>\`
auto: true
commitPerTask: false
status: in-progress # in-progress | done | failed
---

# Plan: A: decision layer

**Mode:** hard
**Status:** IN PROGRESS

## AUTOPILOT

1. Before each dispatch flip the task \`⬜ TODO\` → \`🔄 IN PROGRESS\`; on success flip to \`✅ DONE\`.

\`\`\`markdown
| Status  | Task      |
| ------- | --------- |
| ⬜ TODO | in a code fence |
\`\`\`

## Progress

| Status  | Phase                                                         | File                                                     | Tasks   |
| ------- | ------------------------------------------------------------- | -------------------------------------------------------- | ------- |
| ✅ DONE | Phase 1: nền tảng (shape API, config, client, doctor, app)    | [phase-1-foundation.md](./phase-1-foundation.md)         | 6 tasks |
| 🔄 IN PROGRESS | Phase 2: bộ lọc export \`--redact-model\` / \`--summary\`         | [phase-2-export-filter.md](./phase-2-export-filter.md)   | 4 tasks |
| ⬜ TODO | Phase 3: [\`cf decide\`](./phase-3.md) và golden set          | [phase-3-decide-command.md](./phase-3-decide-command.md) | 5 tasks |
| ❌ FAILED | Phase 4: plugin, shadow D3 trong \`/cf-review\`              | [phase-4-plugin-shadow.md](./phase-4-plugin-shadow.md)   | 5 tasks |
| ⬜ TODO | Phase 5: docs, cf-help, chạy thử plugin + CLI, roadmap        | [phase-5-docs.md](./phase-5-docs.md)                     | 5 tasks |

| Phase | File |
| ----- | ---- |
| ✅ DONE | not a Status table |
`;

const BIG_PHASE = `# Phase 2: bộ lọc export

**Plan:** [README.md](./README.md)

## Progress

| Status  | Task                                                    |
| ------- | ------------------------------------------------------- |
| ✅ DONE | 2.1 Bộ lọc model cắm vào \`ExtraFilter\`                  |
| ✅ DONE | 2.2 Cờ \`--redact-model\`                                 |
| 🔄 IN PROGRESS | 2.3 Cờ \`--summary\`                              |
| ⬜ TODO | 2.4 Living doc                                          |
| maybe   | 2.5 unknown status is skipped                           |
`;

test("big plan: frontmatter, README phase table and a phase task table", () => {
  assert.deepEqual(parseFrontmatter(BIG_README), {
    slug: "2026-11-05-decision-layer-a",
    status: "in-progress",
    auto: true,
  });
  assert.deepEqual(parseFrontmatter("# no frontmatter\nstatus: done\n"), {});

  const phases = parseProgress(BIG_README);
  assert.deepEqual(phases, [
    {
      status: "done",
      label: "Phase 1: nền tảng (shape API, config, client, doctor, app)",
    },
    {
      status: "in_progress",
      label: "Phase 2: bộ lọc export --redact-model / --summary",
    },
    { status: "todo", label: "Phase 3: cf decide và golden set" },
    { status: "failed", label: "Phase 4: plugin, shadow D3 trong /cf-review" },
    {
      status: "todo",
      label: "Phase 5: docs, cf-help, chạy thử plugin + CLI, roadmap",
    },
  ]);
  assert.deepEqual(summarize(phases), {
    todo: 2,
    in_progress: 1,
    done: 1,
    failed: 1,
    current: "Phase 2: bộ lọc export --redact-model / --summary",
  });

  assert.deepEqual(summarize(parseProgress(BIG_PHASE)), {
    todo: 1,
    in_progress: 1,
    done: 2,
    failed: 0,
    current: "2.3 Cờ --summary",
  });
});

test("small plan: one table, current falls back to the first todo, labels are cleaned", () => {
  const long = "x".repeat(120);
  const small = `---
status: DONE
---

| Status  | Task |
| ------- | ---- |
| ✅ DONE | first |
| ⬜ TODO | second\u0007 \u001b[31m\u009b\u202e\u2028\u00adred |
| ⬜ TODO | ${long} |
`;
  assert.deepEqual(parseFrontmatter(small), { status: "done" });
  const rows = parseProgress(small);
  assert.equal(rows[1].label, "second [31mred");
  assert.equal(Array.from(rows[2].label).length, 80);
  assert.deepEqual(summarize(rows), {
    todo: 2,
    in_progress: 0,
    done: 1,
    failed: 0,
    current: "second [31mred",
  });
  assert.deepEqual(summarize([]), {
    todo: 0,
    in_progress: 0,
    done: 0,
    failed: 0,
    current: null,
  });
});

test("pickActivePlan prefers an in-progress plan over a newer done one", () => {
  const done = { slug: "done", frontmatter: { status: "done" }, mtimeMs: 300 };
  const oldRun = {
    slug: "old-run",
    frontmatter: { status: "in-progress" },
    mtimeMs: 100,
  };
  const newRun = {
    slug: "new-run",
    frontmatter: { status: "in-progress" },
    mtimeMs: 200,
  };
  const bare = { slug: "bare", frontmatter: null, mtimeMs: 400 };

  assert.equal(pickActivePlan([done, oldRun, newRun, bare]), newRun);
  assert.equal(pickActivePlan([done, bare]), bare);
  assert.equal(pickActivePlan([]), null);
});
