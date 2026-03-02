---
name: cf-review
description: Dispatch code review to a subagent
disable-model-invocation: true
context: fork
agent: code-reviewer
---

# /cf-review

Review the code changes for: **$ARGUMENTS**

## Workflow

1. **Identify the target:**
   - If `$ARGUMENTS` is empty, review all uncommitted changes (`git diff` + `git diff --staged`)
   - If `$ARGUMENTS` is a file path, review that file
   - If `$ARGUMENTS` is a commit range (e.g., `HEAD~3..HEAD`), review those commits
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

8. **Mark review complete:**

   ```bash
   mkdir -p /tmp/coding-friend && touch /tmp/coding-friend/reviewed
   ```
