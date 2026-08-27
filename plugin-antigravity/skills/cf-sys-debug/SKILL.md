---
name: cf-sys-debug
description: >
  Systematic 4-phase debugging — root cause, hypothesis testing, regression-guarded fix,
  mandatory bug doc. Auto-invoke for non-trivial or recurring bugs — signals: "still
  broken", "same error again", "came back", flaky/intermittent/race, "used to work, now
  broken", hard-to-reproduce, works locally fails in CI, "find the root cause",
  "investigate", "diagnose", "why is this happening". Prefer over cf-fix for hard bugs. Do
  NOT auto-invoke for trivial typos, one-line fixes, or obvious config errors.
created: 2026-02-17
updated: 2026-08-27
disable-slash-command: true
---

# Systematic Debugging

> **CLI Requirement:** OPTIONAL — Uses the memory MCP from `coding-friend-cli` for fast indexed search and storage. Without the CLI: falls back to grep over `docs/memory/` and direct file writes. Full functionality preserved, slower memory recall. See [CLI requirements](../../../docs/cli-requirements.md).

## Custom Guide

```!
bash "<plugin-root>/lib/load-custom-guide.sh" cf-sys-debug
```

If output is not empty: `## Before` → before first step, `## Rules` → throughout, `## After` → after final step.

## Core Constraint

**Do not touch code until you can state the root cause in one sentence:**

> "I believe the root cause is [X] because [evidence]."

Name a specific file, function, and line. Vague labels are not testable. If you cannot be that specific, you do not have a hypothesis yet.

**Same symptom after a fix = hard stop.** Recurrence or "let me just try this" means the hypothesis is unfinished. Re-read the execution path from scratch before touching code again.

**After 3 failed hypotheses, stop.** Use the Handoff Format below. Ask how to proceed.

## Rationalization Watch

Stop and re-examine when these surface:

| Thought                             | Rule                                                                |
| ----------------------------------- | ------------------------------------------------------------------- |
| "I'll just try this one thing"      | Write the hypothesis first                                          |
| "I'm confident it's X"              | Confidence is not evidence — instrument it                          |
| "Probably the same issue as before" | Re-read the execution path from scratch                             |
| "It works on my machine"            | Environment difference IS the bug — enumerate every env difference  |
| "One more restart should fix it"    | Read the last error verbatim. Max two restarts without new evidence |

## Progress Signals

Diagnosis is moving when:

- A log line matches the hypothesis → find one more independent piece of evidence
- You can predict the next error → run the prediction
- Cause is in A, symptoms in B → confirm each link in the A→B chain
- You can write a test that would fail on the old code → write it before the fix

Do not claim progress without observable evidence matching at least one signal.

## 4-Phase Process + Documentation

### Phase 1: Root Cause Investigation

**1a. Check existing bug docs** (memory recall):

Extract 2–3 keywords.

**Primary — Memory MCP** (if `memory_search` is available):
`{ "query": "<bug keywords>", "type": "episode", "limit": 3 }`

**Fallback — grep** (`{docsDir}` from `.coding-friend/config.json`, default `docs`):

1. Grep `^description:` in `{docsDir}/memory/bugs/**/*.md`
2. Else grep `^tags:`

Read the top 1–2 matches.

**1b. Investigate:**

1. **Read the actual error** — full stack, message, logs. Do not guess.
2. **Reproduce** with a reliable test or command.
3. **Trace backward** from the error to its origin.

### Phase 2: Pattern Analysis

1. **When did it start?** `git log --oneline -20`, `git diff HEAD~5`
2. **Consistent or intermittent?** Intermittent = timing/state.
3. **Minimal reproduction** — strip everything unrelated.
4. **Deflection** — an area someone dismisses is often where the problem lives.

### Bisect Mode

Activate for "used to work, now broken" or "broke after an update".

1. Anchor `last-known-good` on the most recent good tag: `git tag --sort=-version:refname | head -5`. Do not use a date or raw SHA.
2. Define a non-interactive pass/fail command with a clear exit code. Reuse it at every step.
3. `git bisect start`, `git bisect bad` (current), `git bisect good <tag>`. Let bisect drive.
4. Do not re-read large files each step — note the key function/line once.
5. When bisect names the culprit: read only that commit's diff; identify the introducing line.

### Phase 3: Hypothesis Testing

1. **One hypothesis:** "The bug is caused by [X] because [evidence]." Name file and line.
2. **One instrument:** log, assertion, or smallest test that would fail if correct. Run it.
3. **Evidence contradicts → discard completely.** Re-orient. Do not keep a disproved hypothesis.
4. **External tool/API failure:** diagnose first (server, key, config) before switching tools.
5. **Stack trace in a library?** Walk back 3 frames into your code. The bug is almost always there.

### Phase 4: Implementation

1. **Fix the root cause**, not the symptom. >5 files → pause and confirm scope.
2. **Regression Guard** — if the bug recurred or was previously "fixed":
   - A regression test that fails unfixed and passes fixed
   - Lives in the project suite (not a temp file)
   - Commit message states why it recurred and why this fix prevents it
3. **Write a regression test** that would have caught this
4. **Full test suite** — no collateral breakage
5. **Verify the original error is gone**

#### Capturing out-of-scope side-effects

Non-trivial problem **unrelated to the root cause** → do not fix inline. Record it, then continue:

```bash
bash "<plugin-root>/lib/capture-later.sh" \
  --name "<short title>" --description "<what & where — enough to act on cold>" \
  --source cf-sys-debug [--slug <bug-doc/task slug, if one exists>] [--problem "<the bug under investigation>"]
```

Writes `<docsDir>/later/YYYY-MM-DD-<name>.md` (frontmatter: slug, problem, conversation_id).

### Phase 5: Document the Bug

Hard bugs always get a doc.

1. Read `language` (local `.coding-friend/config.json` overrides global, default `en`)
2. `MAIN_REPO_ROOT` from SessionStart bootstrap (`session-init.sh`); else `pwd`. Config from `CF_CONFIG_FILE` (`$MAIN_REPO_ROOT/.coding-friend/config.json`) for `docsDir` (default `docs`) — do not search sub-folders. Docs base: `CF_DOCS_ROOT`.
3. Delegate to **cf-writer** by calling `invoke_subagent` with agent `cf-writer` (absolute `file_path`):

```
WRITE SPEC
----------
task: create
file_path: {CF_DOCS_ROOT}/memory/bugs/YYYY-MM-DD-{name}.md
language: {language from config}
content: |
  ---
  title: "<Short bug title>"
  description: "<One-line summary of the bug and fix, under 100 chars>"
  tags: [tag1, tag2, tag3]
  created: YYYY-MM-DD
  updated: YYYY-MM-DD
  type: episode
  importance: 4
  source: conversation
  ---

  # <Bug Title>

  ## Overview
  <Symptom and why it was hard to diagnose>

  ## Investigation
  <Tried and ruled out>

  ## Root Cause
  <Real cause>

  ## Fix
  <What changed>

  ## Prevention
  <How to avoid it>

  ## Related Files
  - `path/to/file`
readme_update: false
auto_commit: false
existing_file_action: skip
```

Existing bug files without a date prefix stay as-is — do not rename.

**Frontmatter:** `description` is a factual grep summary (not "Hard bug fixed"). `tags`: error type, module, root-cause category.

### Index in CF Memory (MANDATORY)

**Required — do not skip.** After cf-writer saves the file, call `memory_store` yourself (the writer does not):

- `title` / `description` / `tags` from frontmatter
- `type`: `episode`
- `content`: full markdown including frontmatter
- `importance`: 4
- `source`: "auto-capture"
- `index_only`: true

If MCP is unavailable, warn the user — do not fail silently.

2-line summary:

- **Markdown file:** `{docsDir}/memory/bugs/...md` (created or updated)
- **Memory DB:** indexed ✓ — or: MCP unavailable, file only

## Gotchas

| What happened                         | Rule                                                          |
| ------------------------------------- | ------------------------------------------------------------- |
| Patched symptom file, not origin      | Trace the path backward first                                 |
| Switched tools after MCP/API failure  | Diagnose server, key, config first                            |
| Pipeline "RUNNING" but a stage is bad | Test each stage in isolation                                  |
| Race diagnosed as stale state         | Inspect timestamps and ordering before state                  |
| Local repro, CI fail                  | Align env (runtime, vars, timezone) before chasing code       |
| Stack deep in a library               | Walk back 3 frames into your code                             |
| `try/catch` to hide the error         | Find the root cause                                           |
| Multiple changes at once              | One change at a time; test after each                         |

## Debugging Tools

`git bisect`, `git stash`, targeted logs, smallest reproduction.

## Outcome

### Success Format

```
Root cause:        [what was wrong, file:line]
Fix:               [what changed, file:line]
Confirmed:         [evidence or test that proves the fix]
Tests:             [pass/fail count, regression test location]
Regression guard:  [test file:line] or [none, reason]
```

Status: **resolved**, **resolved with caveats** (state them), or **blocked** (what is unknown).

### Handoff Format (after 3 failed hypotheses)

```
Symptom:
[Original error, one sentence]

Hypotheses Tested:
1. [Hypothesis] → [Test] → [Ruled out because...]
2. ...
3. ...

Evidence Collected:
- [Logs / stack / files]
- [Repro steps]
- [Env: versions, config, runtime]

Ruled Out:
- [Eliminated causes]

Unknowns:
- [Still unclear / missing info]

Suggested Next Steps:
1. [Next direction]
2. [Tools or permissions needed]
3. [Context the user should provide]
```

Status: **blocked**

## Review Reminder

After the fix is verified, ask whether to run `/cf-review` or `/cf-commit`. Do not auto-run.
