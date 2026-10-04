# Scan templates

Write spec (same format as `/cf-remember`) and frontmatter for Step 4c. Print the summary table at Step 5.

## Write spec

> **Backward compat:** When updating existing memory files without a date prefix, preserve the existing filename. Only new files use the `YYYY-MM-DD-<name>.md` format.

```
WRITE SPEC
----------
task: create | update
file_path: {CF_DOCS_ROOT}/memory/{category}/YYYY-MM-DD-{name}.md
language: {language from config}
content: |
  ---
  title: "<Title>"
  description: "<One-line summary for grep-based recall, under 100 chars>"
  tags: [tag1, tag2, tag3]
  created: YYYY-MM-DD
  updated: YYYY-MM-DD
  type: "<type based on category>"
  importance: 3
  source: scan
  ---

  # <Title>

  ## Overview
  <1-2 sentences>

  ## Key Points
  - <point>

  ## State Machine
  <If applicable: states, transitions, triggers, side effects>

  ## Details
  <Longer explanation>

  ## Related
  - <key files>
readme_update: false
auto_commit: false
existing_file_action: overwrite
```

**Frontmatter rules:**

- `source: scan` (not "conversation") — this distinguishes scanned memories from manually captured ones
- `description` must be factual, searchable, under 100 chars
- When updating: set `task: update`, update `updated` date, do NOT change `created`
- `existing_file_action: overwrite` — scan always replaces full content (not append)

## Summary table

```
## Scan Complete

| # | Category | Title | Action | Description |
|---|----------|-------|--------|-------------|
| 1 | features | Auth Module | created | JWT auth with httpOnly cookies and RS256 |
| 2 | conventions | Naming Patterns | updated | PascalCase components, camelCase utils |
| ... | | | | |

Total: X memories (Y created, Z updated)
Memory DB: indexed ✓ — or: MCP unavailable, files only
```
