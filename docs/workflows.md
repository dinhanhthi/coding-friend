# Workflows

## How It Works

coding-friend installs globally (`~/.claude/plugins/coding-friend`). No files are copied into user projects. On every Claude Code session:

1. `session-init.sh` detects project type, package manager, loads ignore patterns
2. `dev-rules-reminder.sh` injects core rules on every prompt
3. `privacy-block.sh` + `scout-block.sh` block sensitive/ignored files
4. Auto-invoked skills (TDD, debugging, verification, learn) activate based on context

User only interacts via slash commands. Everything else is automatic.

---

## New Project From Scratch

**Step 0: Initialize**
```
/cf-init
```
Sets up workspace folders (`docs/plans`, `docs/memory`, `docs/research`, `docs/learn`), configures `.gitignore`, language, `/cf-learn` settings, and Claude Code permissions for external output directories.

**Step 1: Plan**
```
/cf-plan Build a REST API for task management with auth
```
Explores requirements → brainstorms 2-3 approaches → picks best one → writes plan to `docs/plans/YYYY-MM-DD-<slug>.md` → creates todo list.

**Step 2: Implement**
Ask Claude to implement tasks from the plan. `cf-tdd` skill auto-activates:
- RED: write failing test first
- GREEN: minimum code to pass
- REFACTOR: clean up, all tests must still pass

**Step 3: Review + Ship**
```
/cf-review              # 4-layer review in forked context (doesn't pollute main context)
/cf-ship Initial API    # Verify (tests, build, lint) → commit → push → create PR
```

**Step 4: Capture Knowledge**
```
/cf-remember auth flow  # Save to docs/memory/ for future sessions
/cf-learn JWT tokens    # Save learning notes (auto-invoked if substantial knowledge detected)
```

---

## Existing Project (Big Codebase)

No setup needed — coding-friend is already active globally. Optionally run `/cf-init` to configure project-specific settings.

**Understand the project:** Ask Claude naturally. Session-init already detected project type and framework.

**Research first:**
```
/cf-research React Server Components
```
Deep research with web search and parallel subagents → structured output in `docs/research/`.

**Add a feature:**
```
/cf-plan Add email notifications when task is assigned
```
Plan skill explores existing codebase, finds patterns, proposes approach that fits.

**Fix a bug:**
```
/cf-fix Login fails with 401 when token is valid
```
Workflow: reproduce → locate root cause → fix → verify → regression test. Auto-escalates to `cf-sys-debug` (4-phase) after 3 failed fix attempts.

**Review code:**
```
/cf-review                    # All uncommitted changes
/cf-review src/auth/          # Specific directory
/cf-review HEAD~3..HEAD       # Last 3 commits
```

**Per-project config** (optional): Create `.coding-friend/config.json` to customize docs folder, toggle hooks. Create `.coding-friend/ignore` to block additional directories.

---

## Daily Workflow Reference

### Adding a Feature
```
/cf-plan Add dark mode toggle
```
→ Implement (TDD auto-enforced) → `/cf-review` → `/cf-ship Dark mode feature`

### Fixing a Bug
```
/cf-fix Users can't upload files larger than 5MB
```
Quick path: reproduce → fix → test. If 3 fixes fail → auto-escalates to systematic debugging.

### Code Review
```
/cf-review
```
Runs in forked context. Reports: Critical (must fix) → Important (should fix) → Suggestions.

### Committing
```
/cf-commit Add retry logic for API calls
```
Runs tests → stages relevant files → writes conventional commit message → commits.

### Shipping
```
/cf-ship
```
Full pipeline: verify (tests, build, lint) → commit → push → create PR.

### Debugging
Just describe the bug. `cf-sys-debug` auto-loads:
1. Root cause investigation (read error, reproduce, trace backward)
2. Pattern analysis (git history, consistency check, minimal reproduction)
3. Hypothesis testing (form hypothesis, design test, verify)
4. Implementation (fix root cause, regression test, full test suite)

### Research
```
/cf-research GraphQL vs REST for mobile APIs
```
Web search + parallel subagents → structured docs in `docs/research/`.

### Saving Knowledge
```
/cf-remember              # Scan entire conversation for key knowledge
/cf-remember auth flow    # Focus on specific topic
```
Outputs to `docs/memory/features/`, `docs/memory/conventions/`, or `docs/memory/decisions/`.

### Learning
```
/cf-learn                         # Extract all learnings from session
/cf-learn dependency injection    # Focus on specific concept
```
Outputs to configured `outputDir` (default: `docs/learn/`). Also auto-invoked when substantial new knowledge is detected.

---

## What's Automatic vs Manual

| Automatic (no action needed) | Manual (slash commands) |
|---|---|
| TDD enforcement when writing code | `/cf-init` — initialize workspace |
| Systematic debugging when fixing bugs | `/cf-plan` — create implementation plan |
| Verification before claiming done | `/cf-fix` — quick bug fix |
| Privacy block (.env, credentials) | `/cf-review` — code review |
| Scout block (node_modules, dist) | `/cf-commit` — conventional commit |
| Session context bootstrap | `/cf-ship` — verify + commit + push + PR |
| Core rules injection | `/cf-remember` — save project knowledge |
| Learning extraction on substantial knowledge | `/cf-learn` — save learning notes |
| | `/cf-research` — in-depth web research |
| | `/cf-statusline` — setup statusline |
| | `/cf-update` — update plugin |
