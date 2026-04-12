---
name: cf-review
description: >
  Dispatch code review to a subagent. Use when the user wants code reviewed — e.g.
  "review this", "review my changes", "check the code", "look over this", "code review",
  "any issues with this?", "is this code ok?", "review before merge", "review the diff",
  "what do you think of these changes?". Also triggers on requests to review specific files,
  commits, or branches.
user-invocable: true
context: fork
agent: cf-reviewer
---

# /cf-review

> ✨ **CODING FRIEND** → /cf-review activated

Review the code changes for: **$ARGUMENTS**

## Auto-Triggered

This skill is automatically invoked by other skills — you don't always need to run it manually:

- **`/cf-plan`** — runs `/cf-review` after all implementation tasks complete
- **`/cf-fix`** — runs `/cf-review` after the fix is verified
- **`/cf-optimize`** — runs `/cf-review` after the optimization is measured and verified

## Workflow

### Step 0: Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-review`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before the first step
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

### Step 1: Identify the target

- If `$ARGUMENTS` is empty, review all uncommitted changes (`git diff` + `git diff --staged`)
- If `$ARGUMENTS` is a file path, review that file
- If `$ARGUMENTS` is a commit range (e.g., `HEAD~3..HEAD`), review those commits
- If `$ARGUMENTS` is a natural language description (e.g., "the auth logic changes"), review all uncommitted changes but **focus the review** on the described area — filter findings to only report issues relevant to that description
- If `$ARGUMENTS` contains `--deep` or `--quick`, use that mode (override auto-detection)

### Step 2: Gather the diff

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh"
```

### Step 3: Assess change size

Determine review depth. Run the bundled script (one permission prompt instead of many):

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/assess-changes.sh"
```

The script prints `KEY=value` lines: `FILES_CHANGED`, `LINES_CHANGED`, `SENSITIVE`, `CHANGED_FILES`, and `MODE`.
Use the `MODE` value directly — no further calculation needed.

| Mode         | Condition                                          | Behavior                                                                |
| ------------ | -------------------------------------------------- | ----------------------------------------------------------------------- |
| **QUICK**    | ≤3 files AND ≤50 lines AND no sensitive paths      | Layer 3: secrets + obvious injection only. Skip context research.       |
| **STANDARD** | 4–10 files OR 51–300 lines                         | Full 5-layer review. All security phases, concise.                      |
| **DEEP**     | >10 files OR >300 lines OR sensitive paths touched | Full 5-layer + extended security. Data flow tracing. Exploit scenarios. |

If `SENSITIVE > 0`, always escalate to **DEEP** regardless of size.

### Step 4: Gather context (conditional — based on review mode)

- **QUICK mode**: Skip this step entirely.
- **STANDARD mode**: Search memory only (if `memory_search` tool is available). Call `memory_search` with: `{ "query": "<area being reviewed — e.g. auth, API, database>", "limit": 5 }`. Use results as context hints for the review.
- **DEEP mode**: Launch the **cf-explorer agent** to understand callers, dependencies, and data flows around the changed files. Use the **Agent tool** with `subagent_type: "coding-friend:cf-explorer"`. Pass:

  > Explore the codebase context around these changed files: [list changed files]
  >
  > Questions to answer:
  >
  > 1. What calls these files/functions? (callers, entry points)
  > 2. What do these files depend on? (downstream effects)
  > 3. What conventions and patterns exist in the surrounding code?
  > 4. Are there related tests that should be checked?

  **Note:** cf-explorer already checks memory internally — do NOT call `memory_search` separately when using cf-explorer.

Memory and explorer results are **hints** — always verify against actual code.

### Step 5: Read changed files

Read changed files in full — do not review only the diff, understand the context.

### Step 6: Apply 5-layer review

The cf-reviewer orchestrator dispatches specialist agents in parallel — plan, security, quality, tests, rules — then merges results via a reducer:

- Layer 0: Project rules compliance (CLAUDE.md)
- Layer 1: Plan alignment
- Layer 2: Code quality
- Layer 3: Security (depth scaled by mode)
- Layer 4: Testing

### Step 7: Security review (built-in)

After the 5-layer review, invoke the `/security-review` built-in skill (from Claude Code) using the **Skill tool** with `skill: "security-review"`. This provides an additional dedicated security analysis on top of Layer 3.

Merge any findings from `/security-review` into the report — deduplicate with Layer 3 results, keeping the higher-severity entry when both flag the same issue.

### Step 8: Report findings

The cf-reviewer agent produces the formatted report using its built-in Reporting format (Critical/Important/Suggestion with file:line references and confidence scores). Do NOT redefine the format here.

### Step 9: Mark review complete and display status

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/mark-reviewed.sh"
```

### Step 10: Smart capture (conditional — only if `memory_store` MCP tool is available)

If the review found **architectural insights** or **recurring patterns** worth preserving, call `memory_store` with:

- type: "fact"
- importance: 3
- source: "auto-capture"
- title/description/tags/content summarizing the insight

Skip if the review was routine with no notable findings.

### Step 11: Final output

Display the full report followed by the status banner in a **single message**.

**IMPORTANT**: The structured report from step 9 and the banner below MUST appear together in the same final response. Do NOT split them across separate messages. This ensures the complete review is visible in the last message.

Display the cf-reviewer's report first, then append the appropriate banner:

**If NO critical issues were found:**

```
╔══════════════════════════════════════════════════╗
║  ✅  Code Review Complete                        ║
╚══════════════════════════════════════════════════╝
```

> Mode: **[QUICK|STANDARD|DEEP]** · No blocking issues found.
>
> You're clear to commit. Run `/cf-commit` when ready.

**If critical issues were found** — show the banner, then wait for the user's answer:

```
╔══════════════════════════════════════════════════╗
║  ⚠️  Review Complete — Action Needed             ║
╚══════════════════════════════════════════════════╝
```

> Mode: **[QUICK|STANDARD|DEEP]** · **[N] critical issue(s)** must be resolved before committing.
>
> Resolve the critical issues listed above. Shall I help fix them now?
