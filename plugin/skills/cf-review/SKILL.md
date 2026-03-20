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
agent: cf-code-reviewer
---

# /cf-review

Review the code changes for: **$ARGUMENTS**

## Auto-Triggered

This skill is automatically invoked by other skills — you don't always need to run it manually:

- **`/cf-plan`** — runs `/cf-review` after all implementation tasks complete
- **`/cf-fix`** — runs `/cf-review` after the fix is verified

## Workflow

0. **Load Custom Guide:**

   Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-review`

   If output is not empty, integrate the returned sections into this workflow:
   - `## Before` → execute before step 1
   - `## Rules` → apply as additional rules throughout all steps
   - `## After` → execute after the final step

1. **Identify the target:**
   - If `$ARGUMENTS` is empty, review all uncommitted changes (`git diff` + `git diff --staged`)
   - If `$ARGUMENTS` is a file path, review that file
   - If `$ARGUMENTS` is a commit range (e.g., `HEAD~3..HEAD`), review those commits
   - If `$ARGUMENTS` is a natural language description (e.g., "the auth logic changes"), review all uncommitted changes but **focus the review** on the described area — filter findings to only report issues relevant to that description
   - If `$ARGUMENTS` contains `--deep` or `--quick`, use that mode (override auto-detection)

2. **Gather the diff:**

   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh"
   ```

3. **Assess change size** to determine review depth:

   Run the bundled script (one permission prompt instead of many):

   ```bash
   bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/assess-changes.sh"
   ```

   The script prints `KEY=value` lines: `FILES_CHANGED`, `LINES_CHANGED`, `SENSITIVE`, `CHANGED_FILES`, and `MODE`.
   Use the `MODE` value directly — no further calculation needed.

   | Mode         | Condition                                          | Behavior                                                                |
   | ------------ | -------------------------------------------------- | ----------------------------------------------------------------------- |
   | **QUICK**    | ≤3 files AND ≤50 lines AND no sensitive paths      | Layer 3: secrets + obvious injection only. Skip context research.       |
   | **STANDARD** | 4–10 files OR 51–300 lines                         | Full 4-layer review. All security phases, concise.                      |
   | **DEEP**     | >10 files OR >300 lines OR sensitive paths touched | Full 4-layer + extended security. Data flow tracing. Exploit scenarios. |

   If `SENSITIVE > 0`, always escalate to **DEEP** regardless of size.

4. **Gather context** (conditional — based on review mode):
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

5. **Read changed files** in full — do not review only the diff, understand the context.

6. **Apply 4-layer review** (load the `cf-auto-review` skill):
   - Layer 1: Plan alignment
   - Layer 2: Code quality
   - Layer 3: Security (depth scaled by mode — see `cf-auto-review` skill)
   - Layer 4: Testing

7. **Security review** (built-in):

   After the 4-layer review, invoke the `/security-review` built-in skill (from Claude Code) using the **Skill tool** with `skill: "security-review"`. This provides an additional dedicated security analysis on top of Layer 3.

   Merge any findings from `/security-review` into the report — deduplicate with Layer 3 results, keeping the higher-severity entry when both flag the same issue.

8. **Report findings** with severity levels:
   - **Critical**: Must fix before merge
   - **Important**: Should fix
   - **Suggestion**: Consider

9. **Format the report:**

   ```
   ## 🔍 Code Review: <target> (<QUICK|STANDARD|DEEP> mode)

   ### 🚨 Critical Issues
   - <issue> at <file>:<line>
     For security: **[Category]** (confidence: 0.X) — exploit scenario + recommendation

   ### ⚠️ Important Issues
   - <issue> at <file>:<line>

   ### 💡 Suggestions
   - <suggestion>

   ### 📋 Summary
   <1-2 sentence overall assessment>
   ```

10. **Mark review complete and display status:**

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/mark-reviewed.sh"
```

11. **Smart capture** (conditional — only if `memory_store` MCP tool is available):

If the review found **architectural insights** or **recurring patterns** worth preserving, call `memory_store` with:

- type: "fact"
- importance: 3
- source: "auto-capture"
- title/description/tags/content summarizing the insight

Skip if the review was routine with no notable findings.

Then display one of the following banners depending on whether **Critical Issues** were found:

**If NO critical issues were found** — show this (replace placeholders):

```
╔══════════════════════════════════════════════════╗
║  ✅  Code Review Complete                        ║
╚══════════════════════════════════════════════════╝
```

> Mode: **[QUICK|STANDARD|DEEP]** · No blocking issues found.
>
> You're clear to commit. Run `/cf-commit` when ready.

**If critical issues were found** — show this (replace placeholders), then wait for the user's answer:

```
╔══════════════════════════════════════════════════╗
║  ⚠️  Review Complete — Action Needed             ║
╚══════════════════════════════════════════════════╝
```

> Mode: **[QUICK|STANDARD|DEEP]** · **[N] critical issue(s)** must be resolved before committing.
>
> Resolve the critical issues listed above. Shall I help fix them now?
