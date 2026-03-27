---
name: cf-optimize
description: >
  Structured optimization workflow — baseline, analyze, optimize, measure, compare.
  Auto-invoke this skill when the conversation involves performance optimization,
  speed improvements, or the user mentions something is slow — e.g. "this is slow",
  "make it faster", "optimize", "performance", "bottleneck", "too many queries",
  "high latency", "memory leak", "reduce load time", "speed up", "takes too long",
  "timeout", "O(n²)", "N+1". Do NOT auto-invoke for minor refactors or style changes
  that are not performance-related.
user-invocable: true
argument-hint: "[target to optimize]"
---

# /cf-optimize

Optimize: **$ARGUMENTS**

## Purpose

Structured workflow for optimizing existing features, algorithms, or performance-critical code. Ensures every optimization is measured before and after so you know it actually helped.

## Workflow

### Step 0: Load Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-optimize`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before Step 1
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

### Step 1: Understand the Target

1. Read `$ARGUMENTS` to identify what to optimize
2. If the target is vague, ask the user to clarify what "better" means:
   - Faster execution time?
   - Lower memory usage?
   - Fewer API calls / network requests?
   - Smaller bundle size?
   - Better algorithmic complexity?

### Step 2: Gather Context (conditional — based on target complexity)

Assess whether the optimization target is **simple** (single file/function, clear scope) or **complex** (cross-module, unclear bottleneck location, system-level):

- **Simple target** (e.g., "optimize this function"): Search memory only (if `memory_search` tool is available). Call `memory_search` with: `{ "query": "<optimization target keywords — e.g. performance, latency, bottleneck, caching>", "limit": 5 }`. Then read the relevant source files directly.

- **Complex target** (e.g., "API is slow", "reduce page load time", cross-module performance): Launch the **cf-explorer agent** to map the system context. Use the **Agent tool** with `subagent_type: "coding-friend:cf-explorer"`. Pass:

  > Explore the codebase to understand the performance context for: [optimization target]
  >
  > Questions to answer:
  >
  > 1. What is the call chain / data flow for this operation?
  > 2. What modules, services, or layers are involved?
  > 3. Are there existing benchmarks, caching layers, or performance-related code?
  > 4. What dependencies (DB queries, API calls, I/O) are in the critical path?

  **Note:** cf-explorer already checks memory internally — do NOT call `memory_search` separately when using cf-explorer.

Memory and explorer results are **hints** — always verify against actual code and measurements.

### Step 3: Baseline Measurement

1. Identify or create a benchmark/measurement:
   - If tests with timing exist, use those
   - If a benchmark script exists, run it
   - Otherwise, create a simple benchmark (time the operation, measure memory, count iterations)
2. Run the baseline measurement **3 times** to get stable numbers
3. Record the results clearly:
   - Metric name, value, unit
   - Environment details (if relevant)
4. Save baseline numbers — you will need them for comparison in Step 7

### Step 4: Analyze Bottlenecks

1. Profile the code path (add timing, use profiler if available)
2. Identify the actual bottleneck — do NOT guess:
   - Where is time spent?
   - What allocations are excessive?
   - What operations are redundant?
3. Rank bottlenecks by impact (fix the biggest one first)

### Step 5: Plan the Optimization

1. For the top bottleneck, propose 1-2 optimization approaches
2. For each approach, state:
   - **What changes:** specific files and functions
   - **Expected improvement:** rough estimate
   - **Risk:** what could break
3. Present the plan to the user and **wait for confirmation** before proceeding
4. Do NOT optimize multiple things at once — one change at a time

### Step 6: Implement (via cf-implementer agent)

Dispatch the **cf-implementer agent** to implement the optimization test-first. Use the **Agent tool** with `subagent_type: "coding-friend:cf-implementer"`.

**Prompt template:**

> Implement the following optimization using strict TDD:
>
> **Optimization:** [approach confirmed in Step 5]
> **Target:** [specific files and functions]
> **Bottleneck:** [from Step 4 analysis]
> **Baseline:** [measurements from Step 3]
> **Existing tests:** [test file paths]
> **Test framework:** [framework and conventions]
>
> Requirements:
>
> 1. If tests exist for the target code, verify they pass before changing anything
> 2. If no tests exist, write tests first that verify current behavior
> 3. Implement the optimization — one change at a time
> 4. Run all tests — no regressions allowed
> 5. Report: what was changed, test results, any concerns

Review the cf-implementer's report. If tests failed or the agent reported concerns, address them before proceeding. Then load the `cf-verification` skill and run the full checklist before measuring.

### Step 7: Measure After

1. Run the **exact same benchmark** from Step 3
2. Run it **3 times** for stable numbers
3. Record the results

### Step 8: Compare and Report

1. Present a before/after comparison:

| Metric   | Before  | After   | Change                 |
| -------- | ------- | ------- | ---------------------- |
| _metric_ | _value_ | _value_ | _% or absolute change_ |

2. If improvement is **< 5%**, note that it may be within noise — consider if the added complexity is worth it
3. If performance **regressed**, revert and try a different approach (go back to Step 5)
4. Summarize what was changed and why it helped

### Step 9: Auto-Review

Automatically invoke `/cf-review` — use the **Skill tool** with skill name `coding-friend:cf-review`. Do NOT ask the user first, just run it.

## Completion Protocol

- **DONE** — Optimization verified with measurements. Show: before/after comparison table, % improvement, files changed.
- **DONE_WITH_CONCERNS** — Optimization applied but improvement is marginal (< 5%) or has trade-offs. Show: numbers + trade-off analysis.
- **BLOCKED** — Cannot optimize. Show: why (can't measure, no clear bottleneck, would require architectural change). Suggest next action.

## Rules

- ALWAYS measure before AND after — no "it should be faster" claims
- One optimization at a time — never batch multiple changes
- Tests must pass throughout — the cf-implementer agent enforces TDD
- Get user confirmation before implementing (Step 5)
- If you cannot measure it, ask the user how to measure it before proceeding
- Revert if the optimization makes things worse or breaks tests
