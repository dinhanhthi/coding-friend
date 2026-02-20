---
name: cf-plan
description: Brainstorm and write an implementation plan
disable-model-invocation: true
---

# /cf-plan

Create an implementation plan for: **$ARGUMENTS**

## Workflow

### Step 1: Understand the Problem
1. Read relevant source files to understand current codebase
2. Identify affected modules, dependencies, and constraints
3. List unknowns and assumptions

### Step 2: Brainstorm Approaches
1. Generate 2-3 possible approaches
2. For each approach, list:
   - **Pros**: advantages
   - **Cons**: disadvantages
   - **Effort**: rough task count
   - **Risk**: what could go wrong
3. Recommend one approach with rationale

### Step 3: Write the Plan
1. Break the chosen approach into small, sequential tasks
2. Each task should be completable in one focused session
3. For each task, specify:
   - What to do (specific files, functions, tests)
   - Expected outcome
   - How to verify it worked

### Step 4: Save the Plan
1. Write the plan to `{docsDir}/plans/YYYY-MM-DD-<slug>.md` (default: `docs/plans/`). Check `.coding-friend/config.json` for custom `docsDir`.
2. Use the TodoWrite tool to create a task list
3. Present the plan summary to the user

## Plan Template

```markdown
# Plan: <title>

## Context
<1-2 sentences about the problem>

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
```

## Rules
- Do NOT start implementing. This skill is for PLANNING only.
- If the task is too vague, ask clarifying questions first.
- Plans should be concrete: exact file paths, function names, test commands.
