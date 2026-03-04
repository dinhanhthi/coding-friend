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

## Workflow

### Step 0: Load Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-plan`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before Step 1
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

### Step 1: Clarify Before Exploring

BEFORE reading code or researching, identify what you don't know:

1. Read the request. List things that are **ambiguous or unclear**
2. List **assumptions** you're about to make
3. **ASK the user** to confirm or correct — do NOT proceed with unverified assumptions
4. If the request involves external tools/APIs/libraries, ask the user which ones they prefer — do NOT guess

Only proceed after the user confirms your understanding.

### Step 2: Explore Codebase (via cf-explorer agent)

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

### Step 3: Brainstorm Approaches (via cf-planner agent)

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

Wait for the cf-planner to return its approaches.

### Step 4: Validate with User

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
3. After all tasks are done, ask the user if they want to run `/cf-review` or `/cf-commit`

## Plan Template

```markdown
# Plan: <title>

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
2. <task 2>
   ...

## Risks

- <risk 1 and mitigation>

## Next Steps

After implementation: consider running `/cf-review` → then `/cf-commit`
```

## Rules

- **Plan first, implement second** — never start coding before the plan is saved and the user approves.
- **Ask first, plan second** — never proceed with unclear requirements.
- **Delegate exploration** — always use the cf-explorer agent for codebase exploration, then the cf-planner agent for approach brainstorming. Never do heavy codebase reading in the main conversation.
- **Delegate implementation** — use the cf-implementer agent for task execution. If the agent fails after a reasonable attempt, fall back to implementing inline following TDD discipline (load cf-tdd).
- When uncertain, say so. State your confidence level and ask.
- Do NOT assume which libraries, APIs, or tools to use without asking.
- Plans should be concrete: exact file paths, function names, test commands.
