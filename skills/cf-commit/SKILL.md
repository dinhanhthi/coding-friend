---
name: cf-commit
description: Smart conventional commit with diff analysis
disable-model-invocation: true
model: haiku
tools: [Bash, Read, Glob]
---

# /cf-commit

Create a commit for the current changes. Hint: **$ARGUMENTS**

## Workflow

### Step 1: Analyze Changes
```bash
git status
git diff
git diff --staged
git log --oneline -5
```

### Step 2: Verify Before Committing
Check `.coding-friend/config.json` for `commit.verify` setting. If `verify: false`, skip this step.

1. Run the test suite — all tests must pass
2. Run linter if configured — no new warnings
3. Run build if applicable — must succeed

If any check fails, fix the issue FIRST. Do not commit broken code.

### Step 3: Stage Files
- Stage specific files relevant to this change
- Do NOT stage unrelated changes
- Do NOT stage `.env`, credentials, or secrets
- Do NOT use `git add .` or `git add -A`

### Step 4: Write Commit Message
Follow conventional commits format:

```
<type>(<scope>): <subject>

<body - explain WHY, not WHAT>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `style`, `perf`, `ci`

Rules:
- Subject line < 72 characters
- Body explains the motivation ("why"), not the mechanics ("what")
- If `$ARGUMENTS` is provided, use it as context for the message
- Reference issue numbers if applicable

### Step 5: Commit
```bash
git commit -m "<message>"
```

Show the commit result to the user.
