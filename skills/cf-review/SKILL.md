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

2. **Gather the diff:**
   ```bash
   git diff HEAD
   git diff --staged
   git log --oneline -10
   ```

3. **Read changed files** in full — do not review only the diff, understand the context.

4. **Apply 4-layer review** (load the `cf-code-review` skill):
   - Layer 1: Plan alignment
   - Layer 2: Code quality
   - Layer 3: Security
   - Layer 4: Testing

5. **Report findings** with severity levels:
   - **Critical**: Must fix before merge
   - **Important**: Should fix
   - **Suggestion**: Consider

6. **Format the report:**
   ```
   ## Code Review: <target>

   ### Critical Issues
   - <issue> at <file>:<line>

   ### Important Issues
   - <issue> at <file>:<line>

   ### Suggestions
   - <suggestion>

   ### Summary
   <1-2 sentence overall assessment>
   ```
