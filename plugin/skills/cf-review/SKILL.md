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
   git diff HEAD
   git diff --staged
   git log --oneline -10
   ```

3. **Assess change size** to determine review depth:

   ```bash
   FILES_CHANGED=$(git diff --name-only HEAD | wc -l | tr -d ' ')
   LINES_CHANGED=$(git diff --stat HEAD | tail -1 | grep -oE '[0-9]+ insertion|[0-9]+ deletion' | grep -oE '[0-9]+' | paste -sd+ - | bc)
   SENSITIVE=$(git diff --name-only HEAD | grep -ciE "(auth|security|crypto|token|session|middleware|api/|login|password|secret|\.env)" || echo 0)
   ```

   | Mode         | Condition                                          | Behavior                                                                |
   | ------------ | -------------------------------------------------- | ----------------------------------------------------------------------- |
   | **QUICK**    | ≤3 files AND ≤50 lines AND no sensitive paths      | Layer 3: secrets + obvious injection only. Skip context research.       |
   | **STANDARD** | 4–10 files OR 51–300 lines                         | Full 4-layer review. All security phases, concise.                      |
   | **DEEP**     | >10 files OR >300 lines OR sensitive paths touched | Full 4-layer + extended security. Data flow tracing. Exploit scenarios. |

   If `SENSITIVE > 0`, always escalate to **DEEP** regardless of size.

4. **Read changed files** in full — do not review only the diff, understand the context.

5. **Apply 4-layer review** (load the `cf-auto-review` skill):
   - Layer 1: Plan alignment
   - Layer 2: Code quality
   - Layer 3: Security (depth scaled by mode — see `cf-auto-review` skill)
   - Layer 4: Testing

6. **Report findings** with severity levels:
   - **Critical**: Must fix before merge
   - **Important**: Should fix
   - **Suggestion**: Consider

7. **Format the report:**

   ```
   ## Code Review: <target> (<QUICK|STANDARD|DEEP> mode)

   ### Critical Issues
   - <issue> at <file>:<line>
     For security: **[Category]** (confidence: 0.X) — exploit scenario + recommendation

   ### Important Issues
   - <issue> at <file>:<line>

   ### Suggestions
   - <suggestion>

   ### Summary
   <1-2 sentence overall assessment>
   ```

8. **Mark review complete and display status:**

   ```bash
   mkdir -p /tmp/coding-friend && touch /tmp/coding-friend/reviewed
   ```

9. **Smart capture** (conditional — only if `memory_store` MCP tool is available):

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
