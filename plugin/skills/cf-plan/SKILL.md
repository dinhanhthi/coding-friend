---
name: cf-plan
description: Brainstorm and write an implementation plan
disable-model-invocation: true
---

# /cf-plan

Create an implementation plan for: **$ARGUMENTS**

## Workflow

### Step 1: Clarify Before Exploring

BEFORE reading code or researching, identify what you don't know:

1. Read the request. List things that are **ambiguous or unclear**
2. List **assumptions** you're about to make
3. **ASK the user** to confirm or correct — do NOT proceed with unverified assumptions
4. If the request involves external tools/APIs/libraries, ask the user which ones they prefer — do NOT guess

Only proceed after the user confirms your understanding.

### Step 2: Delegate Exploration to Planner Agent

Launch the **planner agent** to explore the codebase and brainstorm approaches. This runs in a separate context to preserve the main conversation's token budget.

Use the **Agent tool** with `subagent_type: "coding-friend:planner"`. Pass a detailed prompt including:

- The user's request (`$ARGUMENTS`)
- Confirmed assumptions from Step 1
- Any user preferences or constraints gathered in Step 1
- Instruction to explore the codebase, identify affected files, and generate 2-3 approaches

**Prompt template for the agent:**

> Plan the following task: [user request]
>
> Confirmed assumptions: [list from Step 1]
> User preferences: [any constraints from Step 1]
>
> Skip the clarification step — assumptions have already been confirmed with the user.
> Focus on: exploring the codebase, identifying affected files and dependencies, and generating 2-3 possible approaches. For each approach, list pros, cons, effort (task count), risk, and confidence level. Recommend one approach with rationale.

Wait for the agent to return its findings.

### Step 3: Validate with User

Present the planner agent's findings to the user:

1. **Key findings** from the codebase exploration
2. **Approaches** with pros/cons (from the agent's analysis)
3. **Recommended approach** and why
4. **Open questions** — anything the agent flagged as uncertain
5. Wait for user approval or corrections

### Step 4: Write the Plan

Based on the approved approach and the agent's findings:

1. Break the chosen approach into small, sequential tasks
2. Each task should be completable in one focused session
3. For each task, specify:
   - What to do (specific files, functions, tests)
   - Expected outcome
   - How to verify it worked

### Step 5: Save the Plan

1. Write the plan to `{docsDir}/plans/YYYY-MM-DD-<slug>.md` (default: `docs/plans/`). Check `.coding-friend/config.json` for custom `docsDir`.
2. Use the TodoWrite tool to create a task list
3. Present the plan summary to the user

### Step 6: Offer Implementation

After the plan is saved, ask the user: **"Ready to start implementing?"**

If the user agrees, implement each task from the plan **sequentially** using the **implementer agent**:

1. For each task, dispatch the **Agent tool** with `subagent_type: "coding-friend:implementer"`. Pass:

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

2. After each task completes, review the implementer's report:
   - If tests pass and the task is verified → mark task complete, move to next
   - If issues reported → address them before proceeding (re-dispatch or fix inline)
3. After all tasks are done, remind the user: run `/cf-review` → then `/cf-commit`

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

After implementation: run `/cf-review` → then `/cf-commit`
```

## Rules

- **Plan first, implement second** — never start coding before the plan is saved and the user approves.
- **Ask first, plan second** — never proceed with unclear requirements.
- **Delegate exploration** — always use the planner agent for codebase exploration and approach brainstorming. Never do heavy codebase reading in the main conversation.
- **Delegate implementation** — always use the implementer agent for task execution. Never implement inline in the main conversation during this workflow.
- When uncertain, say so. State your confidence level and ask.
- Do NOT assume which libraries, APIs, or tools to use without asking.
- Plans should be concrete: exact file paths, function names, test commands.
