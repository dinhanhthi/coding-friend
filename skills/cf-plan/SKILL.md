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

### Step 2: Understand the Problem
1. Read relevant source files to understand current codebase
2. Identify affected modules, dependencies, and constraints
3. If you find information that contradicts your understanding, **stop and ask** the user

### Step 3: Brainstorm Approaches
1. Generate 2-3 possible approaches
2. For each approach, list:
   - **Pros**: advantages
   - **Cons**: disadvantages
   - **Effort**: rough task count
   - **Risk**: what could go wrong
   - **Confidence**: high/medium/low — how sure you are this will work
3. Recommend one approach with rationale

### Step 4: Validate with User
Present to the user BEFORE writing the final plan:
1. **Key assumptions** you made and their basis
2. **Chosen approach** and why
3. **Open questions** — anything you're less than confident about
4. Wait for user approval or corrections

### Step 5: Write the Plan
1. Break the chosen approach into small, sequential tasks
2. Each task should be completable in one focused session
3. For each task, specify:
   - What to do (specific files, functions, tests)
   - Expected outcome
   - How to verify it worked

### Step 6: Save the Plan
1. Write the plan to `{docsDir}/plans/YYYY-MM-DD-<slug>.md` (default: `docs/plans/`). Check `.coding-friend/config.json` for custom `docsDir`.
2. Use the TodoWrite tool to create a task list
3. Present the plan summary to the user

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
```

## Rules
- Do NOT start implementing. This skill is for PLANNING only.
- **Ask first, plan second** — never proceed with unclear requirements.
- When uncertain, say so. State your confidence level and ask.
- Do NOT assume which libraries, APIs, or tools to use without asking.
- Plans should be concrete: exact file paths, function names, test commands.
