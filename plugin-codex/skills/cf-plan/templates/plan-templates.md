# Plan file skeletons

Copy these when writing the plan at Step 5–6. Do not invent a different layout.

When `--auto`, copy the AUTOPILOT CONTRACT fenced block from `modes/autopilot.md` into every `## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)` section. Omit that whole section when `auto: false`.

## Small plan (1 phase — written as `README.md` inside the plan folder)

```markdown
---
slug: YYYY-MM-DD-<slug> # = plan folder name; copy this to mention or `$cf-plan-resume <slug>`
auto: false # set true when created with --auto
status: in-progress # machine-readable plan status: in-progress | done | failed. `cf clean` only sweeps `done`. Set at creation; flipped to done/failed at terminal completion (see modes/execute.md "Plan done").
---

# Plan: <title>

**Mode:** normal | fast | hard

## Context

<1-2 sentences>

## Assumptions

- <assumption> — basis: <why>

## Approach

<chosen approach and why>

## Not Building

- <explicit out-of-scope item>

## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)

<!-- only when --auto: copy the canonical "AUTOPILOT CONTRACT block" from modes/autopilot.md here verbatim; omit this whole section when auto: false -->

## Progress

<!-- small plans are always exactly 1 phase; multi-phase plans use the Big template -->

| Status  | Phase   | Task        |
| ------- | ------- | ----------- |
| ⬜ TODO | Phase 1 | Task 1 name |
| ⬜ TODO | Phase 1 | Task 2 name |

## Tasks

#### Phase 1 [sequential]

1. <task 1>
   - Files: <specific files>
   - Verify: <how to verify>
   - Rollback: <how to undo — hard mode only>
2. <task 2>
   - Files: <specific files>
   - Verify: <how to verify>

## Risks

- <risk and mitigation>

## Migration & Rollback (hard mode only)

- Overall rollback strategy: <how to revert all>
- Point of no return: <which task>
- Incremental deployment: <gradual rollout option>

## Next Steps

After implementation: `$cf-review` → `$cf-commit`
```

## Big plan (subfolder)

**README.md** (entry point):

```markdown
---
slug: YYYY-MM-DD-<slug> # = plan folder name; copy this to mention or `$cf-plan-resume <slug>`
auto: false # set true when created with --auto
status: in-progress # machine-readable plan status: in-progress | done | failed. `cf clean` only sweeps `done`. Frontmatter is the authority; the body **Status:** line mirrors it for humans (see modes/execute.md "Plan done").
---

# Plan: <title>

**Mode:** normal | fast | hard
**Created:** YYYY-MM-DD
**Status:** IN PROGRESS

## Overview

<1-2 sentences about the problem and chosen approach>

## Not Building

- <explicit out-of-scope item>

## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)

<!-- only when --auto: copy the canonical "AUTOPILOT CONTRACT block" from modes/autopilot.md here verbatim; omit this whole section when auto: false -->

## Progress

| Status  | Phase           | File                                     | Tasks   |
| ------- | --------------- | ---------------------------------------- | ------- |
| ⬜ TODO | Phase 1: <name> | [phase-1-<name>.md](./phase-1-<name>.md) | N tasks |
| ⬜ TODO | Phase 2: <name> | [phase-2-<name>.md](./phase-2-<name>.md) | N tasks |

## Assumptions

- <assumption> — basis: <why>

## Risks

- <risk and mitigation>

## Migration & Rollback (hard mode only)

- Overall rollback strategy: <how to revert all>
- Point of no return: <which task>
- Incremental deployment: <gradual rollout option>

## Next Steps

After implementation: `$cf-review` → `$cf-commit`
```

**phase-N-\<name\>.md** (one per phase):

```markdown
# Phase N: <name>

**Plan:** [README.md](./README.md)
**Type:** parallel | sequential

## AUTOPILOT (IMPORTANT — DO NOT DEVIATE EVEN IN LONG CONVERSATIONS)

<!-- only when --auto: copy the canonical "AUTOPILOT CONTRACT block" from modes/autopilot.md here verbatim; omit this whole section when auto: false -->

## Progress

| Status  | Task          |
| ------- | ------------- |
| ⬜ TODO | <task 1 name> |
| ⬜ TODO | <task 2 name> |

## Tasks

1. <task 1>
   - Files: <specific files>
   - Verify: <how to verify>
   - Rollback: <how to undo — hard mode only>
2. <task 2>
   - Files: <specific files>
   - Verify: <how to verify>
```

## Brief (brief.md — normal/hard mode only)

<!-- Write brief.md only in normal/hard mode (Step 6). Do not write it for `--fast`, `--inline`, or when fast is promoted to normal (no discovery ran). Reviewers (`$cf-plan-review` and `cf-reviewer-plan`) read brief.md as context — the user's original request and discovery — not as the task contract. -->

```markdown
---
slug: YYYY-MM-DD-<slug> # = plan folder name
created: YYYY-MM-DD
mode: normal | hard
---

# Brief: <title>

## Request

<original request verbatim after stripping flags>

Flags: <flags that were stripped, or none>

## Discovery Q&A

### Round N — <name>

**<question>**

<answer verbatim>

## Confirmed Assumptions

- <assumption> — basis: <why>

## Rejected Alternatives

- <alternative> — <reason rejected>

## Success Criteria

- <verifiable criterion>

## Constraints

- <constraint>

## Out of Scope

- <explicit out-of-scope item>
```

## Layout

Written plans live in `{docsDir}/plans/YYYY-MM-DD-<slug>/`; entry point is always `README.md`.

- **Small plan** (exactly 1 phase) → `README.md` holds the full plan (Small plan template). No separate phase files. Also `brief.md` (normal/hard only — never `--fast`, `--inline`, or fast promoted to normal).
- **Big plan** (2+ phases) → `README.md` (overview + Progress) + one `phase-N-<name>.md` per phase. Also `brief.md` (normal/hard only — never `--fast`, `--inline`, or fast promoted to normal).

Progress icons: `⬜ TODO` → `🔄 IN PROGRESS` → `✅ DONE` | `❌ FAILED` (permanent after max retries)

## Human overview doc

When humanDoc=true AND a plan file was written:

- **Output**: `{plan-folder}/overview.html` (`guiPlanFormat` = `html`, default) or `overview.md` (`md`).
- **Generator**: Dispatch `cf-writer-deep`. Give it the just-written plan (`README.md` + any `phase-N-*.md`), the matching template at `${PLUGIN_ROOT}/skills/cf-plan/templates/overview-template.{html,md}`, and the output path. Fill `<!-- FILL: … -->` markers. HTML-escape injected prose (`<`, `&`, `Foo<T>`).
- **Content**: SHORT, decision-focused — **Plan at a Glance** (Phases + Tasks counts from the plan), problem/intent, solution big picture, key decisions (one line each), ASCII diagram in `<pre>`/code fence (no Mermaid). Write Problem & Intent and Solution as bullet lists (`<ul class="bullets">` / `-`), not paragraphs. Do NOT copy the task list.
- **Point-in-time**: generated once; not updated with Progress.
- **Skip** when humanDoc=false — default, fast without `--gui`, or `--inline`.

## Step 2 explorer prompt

Use when dispatching `cf-explorer`:

> Explore the codebase for: [user request]
> Context file: [docsDir/context/<task-id>.json]
> Confirmed assumptions: [from Step 1] | Scope: [from Step 1]
> Answer: (1) structure & modules, (2) affected files/functions, (3) patterns/conventions/deps, (4) existing tests/configs/docs

> **Hard mode** — second call:
> Blast-radius for [files from first call]: (1) importers/dependents, (2) what breaks, (3) public API consumers, (4) test coverage gaps

## Step 3 planner prompt

Use when dispatching `cf-planner` (after the spawn/`model` line in SKILL.md):

> Plan: [user request]
> Context file: [docsDir/context/<task-id>.json] (cf-explorer findings already written; read it, then update with plan findings)
> Confirmed assumptions: [from Step 1] | User preferences: [from Step 1]
> Codebase context: [full cf-explorer report]
> Generate 2-3 approaches with pros, cons, effort, risk, confidence. Recommend one with rationale.

> **Hard mode**: 3–4 approaches; each needs migration path, rollback, incremental deploy. Include blast-radius findings.
