---
name: cf-optimize
version: 1.5.0
description: Structured optimization workflow — baseline, analyze, optimize, measure, compare
disable-model-invocation: true
---

# /cf-optimize

Optimize: **$ARGUMENTS**

## Purpose

Structured workflow for optimizing existing features, algorithms, or performance-critical code. Ensures every optimization is measured before and after so you know it actually helped.

## Workflow

### Step 1: Understand the Target
1. Read `$ARGUMENTS` to identify what to optimize
2. Find and read the relevant source files
3. Understand the current implementation — algorithm, data structures, I/O patterns
4. If the target is vague, ask the user to clarify what "better" means:
   - Faster execution time?
   - Lower memory usage?
   - Fewer API calls / network requests?
   - Smaller bundle size?
   - Better algorithmic complexity?

### Step 2: Baseline Measurement
1. Identify or create a benchmark/measurement:
   - If tests with timing exist, use those
   - If a benchmark script exists, run it
   - Otherwise, create a simple benchmark (time the operation, measure memory, count iterations)
2. Run the baseline measurement **3 times** to get stable numbers
3. Record the results clearly:
   - Metric name, value, unit
   - Environment details (if relevant)
4. Save baseline numbers — you will need them for comparison in Step 6

### Step 3: Analyze Bottlenecks
1. Profile the code path (add timing, use profiler if available)
2. Identify the actual bottleneck — do NOT guess:
   - Where is time spent?
   - What allocations are excessive?
   - What operations are redundant?
3. Rank bottlenecks by impact (fix the biggest one first)

### Step 4: Plan the Optimization
1. For the top bottleneck, propose 1-2 optimization approaches
2. For each approach, state:
   - **What changes:** specific files and functions
   - **Expected improvement:** rough estimate
   - **Risk:** what could break
3. Present the plan to the user and **wait for confirmation** before proceeding
4. Do NOT optimize multiple things at once — one change at a time

### Step 5: Implement
1. Load the `cf-tdd` skill
2. If tests exist for the target code, ensure they pass before changing anything
3. If no tests exist, write tests first that verify current behavior
4. Implement the optimization
5. Run all tests — no regressions allowed
6. Load the `cf-verification` skill — run the full checklist

### Step 6: Measure After
1. Run the **exact same benchmark** from Step 2
2. Run it **3 times** for stable numbers
3. Record the results

### Step 7: Compare and Report
1. Present a before/after comparison:

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| *metric* | *value* | *value* | *% or absolute change* |

2. If improvement is **< 5%**, note that it may be within noise — consider if the added complexity is worth it
3. If performance **regressed**, revert and try a different approach (go back to Step 4)
4. Summarize what was changed and why it helped

## Rules
- ALWAYS measure before AND after — no "it should be faster" claims
- One optimization at a time — never batch multiple changes
- Tests must pass throughout — load cf-tdd for implementation
- Get user confirmation before implementing (Step 4)
- If you cannot measure it, ask the user how to measure it before proceeding
- Revert if the optimization makes things worse or breaks tests
