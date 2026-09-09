# Ask templates

Write specs for Step 6 (create and append) and the flow-diagram layout rubric for Step 4.

## Diagram rubric

If `IS_FLOW_QUESTION`, add a plain-text ASCII diagram (box/arrow characters, no Mermaid) in a fenced block.

**Pick the right layout** based on the flow's shape:

- Discrete states with transitions → a state chart: boxed states joined by labeled arrows (e.g. `[Idle] --start--> [Running]`)
- Component-to-component interactions with messages → a sequence layout: vertical actor lanes with horizontal `--->` message arrows top-to-bottom
- Process with decisions / branching → a top-down flowchart: boxes for steps, a decision node with `yes` / `no` labeled branches

**Rubric:** identify actors/states (nodes), then transitions/messages (edges), then add alternate/error paths as labeled arrows. Label every transition with what triggers it. Keep the diagram to the minimum nodes needed to convey the big picture — omit internal implementation details that don't add clarity.

**Style:** plain text only, using box-drawing / arrow characters (`┌ ─ ┐ │ └ ┘ → ← ↑ ↓ + | -`). No Mermaid or other rendered-diagram syntax. Render it inside a plain fenced code block so alignment is preserved.

The diagram IS the concise answer for flow questions — keep surrounding prose tight.

## Write specs

> **Backward compat:** When updating existing memory files without a date prefix, preserve the existing filename — do not add a date prefix to already-created files.

Use absolute `file_path`. When appending, also update the `updated` date in the existing frontmatter.

**Frontmatter rules:**

- `description`: factual, searchable summary under 100 chars. Good: `"JWT auth flow with refresh tokens and OAuth2 integration"`. Bad: `"About auth"`.
- `tags`: 3-5 keywords as array

### Create

````
WRITE SPEC
----------
task: create
file_path: {CF_DOCS_ROOT}/memory/{category}/YYYY-MM-DD-{name}.md
language: {language from config}
content: |
  ---
  title: "<Title>"
  description: "<One-line summary for grep-based recall, under 100 chars>"
  tags: [tag1, tag2, tag3]
  created: YYYY-MM-DD
  updated: YYYY-MM-DD
  ---

  # <Title>

  ## Overview
  <1-2 sentences>

  ## Q&A: <short question summary> (YYYY-MM-DD)

  **Q:** <question>

  **A:** <concise answer>

  <!-- Include this section only when IS_FLOW_QUESTION = true -->
  ## Flow Diagram

  ```
  <diagram generated in Step 4>
  ```

  **Related files:** `path/to/file1`, `path/to/file2`
readme_update: false
auto_commit: false
existing_file_action: skip
````

### Append

````
WRITE SPEC
----------
task: update
file_path: {CF_DOCS_ROOT}/memory/{category}/YYYY-MM-DD-{name}.md
language: {language from config}
content: |

  ## Q&A: <short question summary> (YYYY-MM-DD)

  **Q:** <question>

  **A:** <concise answer>

  <!-- Include this section only when IS_FLOW_QUESTION = true -->
  ## Flow Diagram

  ```
  <diagram generated in Step 4>
  ```

  **Related files:** `path/to/file1`, `path/to/file2`
readme_update: false
auto_commit: false
existing_file_action: append
````
