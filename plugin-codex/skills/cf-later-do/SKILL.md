---
name: cf-later-do
description: >
  Work through deferred side-tasks captured in docs/later/. Use when the user wants to process,
  resolve, or clear the backlog of out-of-scope problems that earlier skills (cf-plan, cf-fix,
  cf-sys-debug, cf-optimize, cf-ship, cf-implementer) recorded for later — e.g. "do the later tasks", "process
  docs/later", "work through the backlog", "what did we defer", "resolve deferred items",
  "cf-later-do". Lists each deferred item, lets the user pick one, routes the fix to $cf-fix or
  $cf-plan, removes the file only after the fix is verified-done, then suggests the next item.
  Slash-only — NOT auto-invoked. Requires items under docs/later/. Does NOT capture new items
  (that is capture-later.sh, the write side) — this is the read/resolve side.
created: 2026-07-24
updated: 2026-07-24
---

# $cf-later-do

> **CLI Requirement:** NONE — Works without `coding-friend-cli`. Reads `docs/later/` files directly and dispatches existing skills; no CLI features are required. See [CLI requirements](../../../docs/cli-requirements.md) for the full matrix.

Process the deferred side-tasks in `docs/later/`: pick one, fix it (via `$cf-fix` or `$cf-plan`), remove it once verified, then move to the next.

## Background

`plugin/lib/capture-later.sh` is the **write side** — execution skills call it to record an out-of-scope problem as `docs/later/YYYY-MM-DD-<name>.md` with frontmatter (`date`, `source`, optional `slug`/`problem`, `conversation_id`). This skill is the **read/resolve side** that closes the loop.

## Workflow

### Step 0: Custom Guide

Custom guide — auto-loaded below (if the raw command shows instead of its output, run it yourself):

```!
bash "${PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-later-do
```

If output is not empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

### Step 1: Resolve the backlog directory

- `LATER_DIR = $CF_DOCS_ROOT/later` (prefer `CF_DOCS_ROOT` from the SessionStart bootstrap context; if absent, run `pwd` for `$CWD` and use `$CWD/{docsDir}/later`, where `docsDir` comes from `.coding-friend/config.json`, default `docs`).
- If `LATER_DIR` does not exist OR contains no `*.md` files → print `> No deferred items in docs/later/.` and **stop cleanly**.

### Step 2: Scan and parse

Read every `LATER_DIR/*.md`. For each file, parse the YAML frontmatter (`date`, `source`, `slug?`, `problem?`, `conversation_id`), the `# ` title line, and the body. Build an in-memory list of items.

### Step 3: Present the picker

Show a **numbered** list, sorted by `date` **oldest-first** (longest-deferred first). One line per item:

`[N] <title> — <date> · source: <source> · <problem or one-line body summary>`

Ask the user to choose: a number `N`, or `q` to quit. (Use a plain numbered list + an open question — do NOT use a direct user question, since the item count is dynamic and may exceed 4.) If the user quits → stop cleanly.

### Step 4: Classify and route the chosen item

Determine the item's nature from `source` + `problem` + body:

- **bug-like** (`source` ∈ {`cf-fix`, `cf-sys-debug`}, or the text describes an error / regression / failing test) → route to **`$cf-fix`**.
- **feature/refactor-like** (`source` ∈ {`cf-plan`, `cf-optimize`, `cf-ship`, `cf-implementer`}, or the text describes a new feature / refactor / optimization / added test) → route to **`$cf-plan`**.
- **unclear** → ask the user whether to use `$cf-fix` or `$cf-plan`.

The **task description** handed to the routed skill = the `problem` field (if present) + the full body of the item. Include one reference line for the human reader only:

`> Reference: slug=<slug> · source=<source> · conversation_id=<id>`

**Do NOT** claim to reopen or restore context from the `.jsonl` session behind `conversation_id` — surface it as a human-readable pointer only.

### Step 5: Run the routed workflow

Load the chosen skill (`$cf-fix` or `$cf-plan`) with the Step 4 task description and run it to completion. Because a loaded skill continues in the **same agent**, control returns here afterward.

### Step 6: Remove the file — ONLY on verified completion

- **Concrete completion signal:** the routed skill reached its own verified-DONE state — `$cf-fix` passing the `cf-verification` gate (tests/verify pass), or `$cf-plan` finishing all phases and verified. **Any** other outcome (failed, blocked, user aborted mid-way) → **KEEP the file, do NOT remove**, and print `> Item kept in docs/later/ (not completed).`
- **Deletion guard (required):** before removing, resolve the file path and verify it is **inside** `$CF_DOCS_ROOT/later/`. Reject any name containing `/`, `\`, or `..` (mirrors the `cf-plan-resume` path-traversal guard). Only delete when the path passes this check.
- On successful removal → print `> ✅ Resolved and removed: <title>`.

### Step 7: Suggest the next item and loop

- Re-scan `LATER_DIR`. If items remain → show the updated list (oldest-first) and **suggest** the next item to tackle (prefer one sharing the same `slug`/`source` as the item just resolved if related; otherwise the oldest). Ask whether to continue → if yes, go back to **Step 3**.
- If no items remain → print `> 🎉 docs/later/ is empty — no deferred items left.` and stop.

## Rules

- **Only ever delete files inside `$CF_DOCS_ROOT/later/`.** Never delete when the routed skill has not reached verified-DONE.
- **No context restoration from `conversation_id`** — display it as a reference only.
- **Slash-only** — this skill is never auto-invoked.
- **Read side only** — never modify `capture-later.sh` or write new `docs/later/` files.
- Respect `.coding-friend/ignore` patterns.

## Completion Protocol

- **DONE** — At least one item resolved and removed; remaining backlog reported (or empty).
- **DONE_NOTHING** — Backlog empty at start, or user quit without picking.
- **KEPT** — Item picked but the fix did not reach verified-DONE; file retained.
