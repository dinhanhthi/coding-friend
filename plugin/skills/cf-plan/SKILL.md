---
name: cf-plan
description: >
  Brainstorm and write an implementation plan. Use when the user wants to plan, build, create,
  or implement something — e.g. "let's build", "let's create", "I want to create", "create for me",
  "build for me", "add feature", "implement", "make a", "set up", "I need a", "can you build",
  "help me build", "how should we implement", "design a solution", "architect", "scaffold",
  "plan out", "figure out how to", "what's the best way to build". Also triggers on task
  descriptions that imply multi-step implementation work requiring upfront planning.
---

# /cf-plan

Create an implementation plan for: **$ARGUMENTS**

## Modes

`/cf-plan` supports three modes that control the depth of the planning workflow:

| Mode       | Flag     | Steps skipped/added                                          | When to use                                          |
| ---------- | -------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| **Normal** | (none)   | Full workflow                                                | Default — most tasks                                 |
| **Fast**   | `--fast` | Skip discovery, inline exploration, skip planner agent       | Task is clear, single-module, additive               |
| **Hard**   | `--hard` | Extra discovery round, deeper exploration, rollback planning | Breaking changes, migrations, multi-module refactors |

Flags are parsed from `$ARGUMENTS`. Remove the flag before using the remaining text as the task description.

## Workflow

### Step 0: Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-plan`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before the first step
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

### Step 0.5: Determine Mode

1. **Explicit flag** — If `$ARGUMENTS` contains `--fast` or `--hard`, use that mode. Strip the flag from the task description.
2. **Auto-detect** — If no flag is given, scan the task for signals:

**Fast signals** (need 2+ to trigger):

- Task matches an existing pattern in the codebase (e.g. "add another command like X")
- Single module or file affected
- No external dependencies or APIs involved
- User language implies simplicity: "just", "simple", "quick", "same as", "like we did for"
- Task is purely additive (new file/function), not modifying existing logic

**Hard signals** (need 2+ to trigger):

- Multiple modules or packages affected
- Involves breaking changes, migrations, or data schema changes
- Touches security, auth, payments, or data integrity
- User language implies complexity: "refactor", "migrate", "rewrite", "across all", "breaking"
- Has external system dependencies (DB, APIs, third-party services)
- Affects public API or shared contracts

3. **Confirm auto-detected mode** — If auto-detect triggers a non-default mode:
   - If **3+ signals** match → apply automatically, announce the mode and reasons
   - If **2 signals** match → propose the mode and ask user to confirm before proceeding
   - If signals are mixed or unclear → use **normal** mode

### Step 0.7: Check Memory

Before exploring the codebase, check if project memory already has relevant context:

1. If `memory_search` tool is available, search for keywords related to the task (e.g., architecture, conventions, prior plans, related features)
2. If memory returns relevant results, use them as **starting context** for the exploration — this avoids redundant exploration
3. If no memory is available or no relevant results, skip this step

### Step 1: Discovery & Brainstorm

> **Fast mode**: Skip this step entirely — assume the request is clear and proceed to Step 2.

BEFORE reading code or researching, run a focused discovery session. The goal is to deeply understand the problem, challenge assumptions, and ensure we build the right thing — not just build something.

Use the `AskUserQuestion` tool for each interaction below. Do NOT batch all questions into one message — ask in focused rounds.

**Round 1 — Understand the problem:**

1. Read the request. List things that are **ambiguous or unclear**
2. List **assumptions** you're about to make
3. Ask probing questions to fully understand the user's true objectives, constraints, and success criteria — don't just accept the surface-level request
4. If the request involves external tools/APIs/libraries, ask which ones they prefer — do NOT guess

**Round 2 — Challenge & explore alternatives:**

5. Once you understand the goal, **challenge the initial approach**. Question whether the proposed solution is the best path. Often the best solution differs from what was originally envisioned
6. Consider multiple angles: impact on end users, developer experience, operations, and business objectives
7. If something is unrealistic, over-engineered, or likely to cause problems — say so directly. Be brutally honest about feasibility and trade-offs. Your job is to prevent costly mistakes
8. Apply **YAGNI**, **KISS**, and **DRY** — push back on unnecessary complexity

**Round 3 — Converge (if needed):**

9. If the discovery rounds surfaced new alternatives or concerns, present 2-3 viable approaches with brief pros/cons and ask the user which direction to pursue
10. If the original request was clear and straightforward, skip this round

> **Hard mode** — add **Round 4: Risk & Rollback** after Round 3:
>
> 11. What could go wrong? List failure modes and blast radius
> 12. What's the rollback plan if this breaks production?
> 13. Are there feature flags or gradual rollout options?
> 14. Can the change be deployed incrementally, or is it all-or-nothing?

Only proceed after the user confirms your understanding and direction. If the user wants to skip brainstorming (e.g., "just plan it", "I already know what I want"), respect that and move on.

### Step 2: Explore Codebase

> **Fast mode**: Do NOT launch the cf-explorer agent. Instead, do a quick inline search using Glob and Grep directly in the main conversation. Focus only on the files immediately relevant to the task. Keep it brief — no deep exploration.

> **Normal mode**: Launch the **cf-explorer agent** (default behavior below).

> **Hard mode**: Launch the cf-explorer agent **twice** — first for standard exploration, then a second call for dependency and blast-radius analysis (see below).

Launch the **cf-explorer agent** to gather codebase context. This runs in a separate context to preserve the main conversation's token budget.

Use the **Agent tool** with `subagent_type: "coding-friend:cf-explorer"`. Pass a detailed prompt:

> Explore the codebase to gather context for the following task: [user request]
>
> Confirmed assumptions: [list from Step 1]
> Scope: [any constraints from Step 1]
>
> Questions to answer:
>
> 1. What is the project structure and relevant modules?
> 2. Which files and functions are affected by this task?
> 3. What patterns, conventions, and dependencies exist in the affected areas?
> 4. Are there existing tests, configs, or docs relevant to this change?

Wait for the cf-explorer to return its findings.

> **Hard mode** — launch a second cf-explorer call for blast-radius analysis:
>
> > Analyze the blast radius for changes to: [files/modules identified in first exploration]
> >
> > Questions to answer:
> >
> > 1. What other modules import or depend on the code we're changing?
> > 2. What breaks if we get this wrong?
> > 3. Are there consumers of public APIs or shared contracts affected?
> > 4. What test suites cover the affected areas — are there gaps?

### Step 3: Brainstorm Approaches (via cf-planner agent)

> **Fast mode**: Skip this step — pick the most straightforward approach based on codebase patterns found in Step 2. Proceed directly to Step 4.

Launch the **cf-planner agent** with the cf-explorer's findings to brainstorm approaches.

Use the **Agent tool** with `subagent_type: "coding-friend:cf-planner"`. Pass:

> Plan the following task: [user request]
>
> Confirmed assumptions: [list from Step 1]
> User preferences: [any constraints from Step 1]
>
> Codebase context (from explorer):
> [include the full exploration report returned by the cf-explorer agent]
>
> Skip the clarification and exploration steps — assumptions are confirmed and codebase has been explored.
> Focus on: generating 2-3 possible approaches based on the codebase context. For each approach, list pros, cons, effort (task count), risk, and confidence level. Recommend one approach with rationale.

> **Hard mode** — add to the cf-planner prompt:
>
> > Generate 3-4 approaches (not 2-3). Each approach MUST include:
> >
> > - Migration path (how to get from current state to target state)
> > - Rollback strategy (what if we need to revert midway?)
> > - Incremental deployment option (can this be rolled out gradually?)
> >
> > Blast-radius analysis: [include findings from second cf-explorer call]

Wait for the cf-planner to return its approaches.

### Step 4: Validate with User

> **Fast mode**: Skip this step — go straight to Step 5 (Write the Plan).

Present the findings to the user:

1. **Key findings** from the codebase exploration (from cf-explorer)
2. **Approaches** with pros/cons (from cf-planner)
3. **Recommended approach** and why
4. **Open questions** — anything flagged as uncertain
5. Wait for user approval or corrections

### Step 5: Write the Plan

Based on the approved approach and the agent's findings:

1. Break the chosen approach into small, sequential tasks
2. Each task should be completable in one focused session
3. For each task, specify:
   - What to do (specific files, functions, tests)
   - Expected outcome
   - How to verify it worked

> **Hard mode** — enhanced task format:
>
> 4. Group tasks into **phases** with verification checkpoints between phases
> 5. Each task must include an additional **Rollback** field: how to undo this specific task if needed
> 6. Add a `## Migration & Rollback` section to the plan with the overall rollback strategy

### Step 6: Save the Plan

1. Write the plan to `{docsDir}/plans/YYYY-MM-DD-<slug>.md` (default: `docs/plans/`). Check `.coding-friend/config.json` for custom `docsDir`.
2. Use the TaskCreate tool to create a task list
3. Present the plan summary to the user

### Step 7: Offer Implementation

After the plan is saved, ask the user: **"Ready to start implementing?"**

If the user agrees, implement each task from the plan **sequentially** using the **cf-implementer agent**:

1. For each task, dispatch the **Agent tool** with `subagent_type: "coding-friend:cf-implementer"`. Pass:

   > Implement the following task using strict TDD:
   >
   > **Task:** [task description from plan]
   > **Context:** [overall plan context — what we're building and why]
   > **Files:** [specific files listed in the task]
   > **Verify:** [verification criteria from the task]
   > **Test patterns:** [framework, conventions, test file locations]
   > **Constraints:** [any risks or edge cases from the plan]
   >
   > Follow RED → GREEN → REFACTOR. Report results when done.

2. After each task completes, review the cf-implementer's report:
   - If tests pass and the task is verified → mark task complete, move to next
   - If issues reported → address them before proceeding (re-dispatch or fix inline)
3. **Hard mode** — run `/cf-review` after every phase checkpoint (every 2-3 tasks), not just at the end. Only continue to the next phase if review passes.
4. After all tasks are done, automatically invoke `/cf-review` — use the **Skill tool** with skill name `coding-friend:cf-review`. Do NOT ask the user first, just run it.
5. After review completes, if the implemented plan involved **performance-critical features** — e.g. data processing pipelines, API endpoints handling high traffic, database-heavy operations, algorithms on large datasets, or real-time processing — suggest running `/cf-optimize` on the critical code paths. Present it as an optional next step, do NOT auto-run.

## Plan Template

```markdown
# Plan: <title>

**Mode:** normal | fast | hard

## Context

<1-2 sentences about the problem>

## Assumptions

- <assumption 1> — basis: <why you believe this>
- <assumption 2> — basis: <why you believe this>

## Approach

<chosen approach and why>

## Tasks

1. <task 1>
   - Files: <specific files>
   - Verify: <how to verify>
   - Rollback: <how to undo — hard mode only>
2. <task 2>
   ...

## Risks

- <risk 1 and mitigation>

## Migration & Rollback (hard mode only)

- Overall rollback strategy: <how to revert all changes>
- Point of no return: <at which task is rollback no longer trivial?>
- Incremental deployment: <can this be rolled out gradually?>

## Next Steps

After implementation: consider running `/cf-review` → then `/cf-commit`
```

## Completion Protocol

After the plan is saved (or after implementation if the user chose to implement):

- **DONE** — Plan created and saved. Show: task count, risk summary, recommended next step.
- **DONE_WITH_CONCERNS** — Plan created but has open questions or high-risk items. Show: what needs user decision before proceeding.
- **BLOCKED** — Cannot create a meaningful plan. Show: what information is missing, what assumptions couldn't be verified.

## Rules

- **Plan first, implement second** — never start coding before the plan is saved and the user approves.
- **Brainstorm first, plan second** — question everything, challenge assumptions, explore alternatives before committing to an approach. Use `AskUserQuestion` to probe — never assume. (Relaxed in fast mode.)
- **Delegate exploration** — always use the cf-explorer agent for codebase exploration, then the cf-planner agent for approach brainstorming. Never do heavy codebase reading in the main conversation. (Fast mode: inline search instead of agents.)
- **Delegate implementation** — use the cf-implementer agent for task execution. If the agent fails after a reasonable attempt, fall back to implementing inline following TDD discipline (load cf-tdd).
- **Respect the mode** — do not escalate fast to normal or normal to hard without user consent. If you detect the mode is wrong mid-workflow, pause and ask.
- When uncertain, say so. State your confidence level and ask.
- Do NOT assume which libraries, APIs, or tools to use without asking.
- Plans should be concrete: exact file paths, function names, test commands.
