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
