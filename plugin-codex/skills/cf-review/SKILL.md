---
name: cf-review
description: >
  Dispatch code review to a subagent. Use when the user wants code reviewed — e.g.
  "review this", "review my changes", "check the code", "look over this", "code review",
  "any issues with this?", "is this code ok?", "review before merge", "review the diff",
  "what do you think of these changes?". Also triggers on requests to review specific files,
  commits, or branches.
created: 2026-02-17
updated: 2026-07-04
---

# $cf-review

> **CLI Requirement:** OPTIONAL — Uses the memory MCP from `coding-friend-cli` for fast indexed search and storage. Without the CLI: falls back to grep over `docs/memory/` and direct file writes. Full functionality preserved, slower memory recall. See [CLI requirements](../../../docs/cli-requirements.md).

> ✨ **CODING FRIEND** → $cf-review activated

Review the code changes for: **$ARGUMENTS**

## Auto-Triggered

This skill is automatically invoked by other skills — you don't always need to run it manually:

- **`$cf-plan`** — runs `$cf-review` after all implementation tasks complete
- **`$cf-fix`** — runs `$cf-review` after the fix is verified
- **`$cf-optimize`** — runs `$cf-review` after the optimization is measured and verified

## Workflow

### Step 0: Custom Guide

Custom guide — auto-loaded below (if the raw command shows instead of its output, run it yourself):

```!
bash "${PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-review
```

If output is not empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

### Step 1: Identify the target

- If `$ARGUMENTS` is empty, review all uncommitted changes (`git diff` + `git diff --staged`)
- If `$ARGUMENTS` is a file path, review that file
- If `$ARGUMENTS` is a commit range (e.g., `HEAD~3..HEAD`), review those commits
- If `$ARGUMENTS` is a natural language description (e.g., "the auth logic changes"), review all uncommitted changes but **focus the review** on the described area — filter findings to only report issues relevant to that description
- If `$ARGUMENTS` contains `--deep` or `--quick`, use that mode (override auto-detection)

**Codex host behavior:**

- This skill already runs inside Codex. Ignore `--with-codex`, its `--codex` alias, and `review.withCodex`; do not launch a nested `codex review` subprocess.
- Run the Coding Friend multi-agent review below.

### Step 2: Gather the diff

```bash
bash "${PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh"
```

### Step 3: Assess change size

Determine review depth. Run the bundled script (one permission prompt instead of many):

```bash
bash "${PLUGIN_ROOT}/skills/cf-review/scripts/assess-changes.sh"
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
- **DEEP mode**: Launch the **cf-explorer agent** to understand callers, dependencies, and data flows around the changed files. Spawn the `cf-explorer` custom agent. Pass:

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

### Step 6: Dispatch the cf-reviewer agent

Spawn the `cf-reviewer` custom agent. Pass the full context:

> **Review mode:** [QUICK | STANDARD | DEEP]
>
> **Diff:**
> [full diff from Step 2]
>
> **Changed files (full content):**
> [full content of each changed file from Step 5]
>
> **Context (if gathered in Step 4):**
> [memory search results or cf-explorer findings, if any]
>
> Run the review now. Return the unified report in the 🚨/⚠️/💡/📋 format.

Wait for the agent to return its report.

### Step 7: Collect the report

The result of Step 6 is the final formatted report (Critical / Important / Suggestions / Summary). Do not reformat or restructure it; use it as-is in Step 10.

### Step 8: Mark review complete and display status

```bash
bash "${PLUGIN_ROOT}/skills/cf-review/scripts/mark-reviewed.sh"
```

### Step 9: Smart capture (conditional — only if `memory_store` MCP tool is available)

If the review found **architectural insights** or **recurring patterns** worth preserving, call `memory_store` with:

- type: "fact"
- importance: 3
- source: "auto-capture"
- title/description/tags/content summarizing the insight

Skip if the review was routine with no notable findings.

### Step 10: Final output

Display the full report followed by the status banner in a **single message**.

**IMPORTANT**: The structured report from step 8 and the banner below MUST appear together in the same final response. Do NOT split them across separate messages. This ensures the complete review is visible in the last message.

Display the cf-reviewer's report first, then append the appropriate banner.

**If NO critical issues were found:**

```
╔══════════════════════════════════════════════════╗
║  ✅  Code Review Complete                        ║
╚══════════════════════════════════════════════════╝
```

> Mode: **[QUICK|STANDARD|DEEP]** · No blocking issues found.
>
> You're clear to commit. Run `$cf-commit` when ready.

**If critical issues were found** — show the banner, then wait for the user's answer:

```
╔══════════════════════════════════════════════════╗
║  ⚠️  Review Complete — Action Needed             ║
╚══════════════════════════════════════════════════╝
```

> Mode: **[QUICK|STANDARD|DEEP]** · **[N] critical issue(s)** must be resolved before committing.
>
> Resolve the critical issues listed above. Shall I help fix them now?
