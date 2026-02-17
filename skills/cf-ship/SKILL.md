---
name: cf-ship
description: Verify, commit, push, and create PR
disable-model-invocation: true
---

# /cf-ship

Ship the current work. Hint: **$ARGUMENTS**

## Workflow

### Step 1: Verify
Load the `cf-verification` skill and run the full checklist:
- [ ] Tests pass
- [ ] Build succeeds
- [ ] Linter clean
- [ ] No console errors

If ANY check fails, stop and fix before proceeding.

### Step 2: Commit
If there are uncommitted changes:
1. Run the `/cf-commit` workflow (load the `cf-commit` skill)
2. Use `$ARGUMENTS` as commit hint if provided

### Step 3: Push
```bash
git push -u origin <current-branch>
```

If push fails (e.g., remote ahead), pull first:
```bash
git pull --rebase origin <current-branch>
git push
```

### Step 4: Create PR (if on a feature branch)
Only if current branch is NOT `main` or `master`:

```bash
gh pr create --title "<title>" --body "<body>"
```

PR body template:
```
## Summary
<1-3 bullet points describing the changes>

## Test plan
- [ ] Tests pass
- [ ] Manual verification done
```

### Step 5: Report
Show the user:
- Commit SHA
- Push result
- PR URL (if created)

## Rules
- NEVER force push unless explicitly asked
- NEVER push to main/master directly
- ALWAYS verify before pushing
- Ask user before pushing if there are concerns
