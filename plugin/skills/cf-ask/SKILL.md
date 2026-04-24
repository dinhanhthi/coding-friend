---
name: cf-ask
description: >
  Quick Q&A about codebase — explores code to answer, saves to docs/memory. Use when the user
  asks a focused question about the project — e.g. "how does X work?", "where is Y defined?",
  "what's the flow for Z?", "explain this module", "how are these connected?", "what pattern
  does this use?", "why is this done this way?". Unlike /cf-research (deep multi-doc output),
  this gives a single focused answer.
disable-model-invocation: true
---

# /cf-ask

Answer the question: **$ARGUMENTS**

## Purpose

Quick, focused Q&A about the codebase. Proactively explores code to find the answer, then saves the Q&A to project memory so it can be referenced later.

- Unlike `/cf-research`: single focused answer, no multi-doc output
- Unlike `/cf-remember`: proactively explores the codebase to answer vs extracting knowledge already in conversation

## Folder

Output goes to `{docsDir}/memory/` (default: `docs/memory/`). Check `.coding-friend/config.json` for custom `docsDir` if it exists.

**IMPORTANT — path resolution:**

- Run `pwd` to get the current working directory — substitute its actual output wherever `$CWD` appears below (do NOT pass `$CWD` as a literal string)
- Only check `$CWD/.coding-friend/config.json` for `docsDir` — do NOT search sub-folders
- Always resolve `file_path` as an **absolute path**: `$CWD/{docsDir}/memory/{category}/{name}.md`
- Never use relative paths in write specs — they may resolve incorrectly when the working directory contains nested git repos

## Workflow

### Step 0: Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-ask`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before the first step
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

### Step 1: Parse the Question

1. Read `$ARGUMENTS` as the question
2. If no question provided, ask the user what they want to know
3. Identify keywords and likely relevant areas (modules, features, patterns)
4. **Classify the question type** — check if the question is a *flow question*. A flow question asks about how something works end-to-end, how components interact, or what happens when a process runs. Trigger words: "how does X work", "flow of", "lifecycle", "sequence", "process", "when X happens", "walk me through", "how are X connected", "what triggers", "what happens when", "pipeline", "chain". Non-flow questions (lookup/definition/pattern/why) do NOT trigger this path.

   Set `IS_FLOW_QUESTION = true/false` for use in Steps 3, 4, 5, and 6.

### Step 2: Check Existing Memory (Memory Recall)

Before exploring the codebase, search existing memory docs. Extract 2-3 keywords from the question.

**Primary method — Memory MCP tool** (if `memory_search` tool is available):

Call the `memory_search` MCP tool with: `{ "query": "<keywords from question>", "limit": 5 }`

If the tool call fails (MCP not configured), fall back to the grep method below.

**Fallback — 3-tier grep** (if memory MCP unavailable):

Check `{docsDir}` from `.coding-friend/config.json` (default: `docs`).

1. Grep `^description:` lines across `{docsDir}/memory/**/*.md` — match against question keywords
2. If no match, grep `^tags:` lines across `{docsDir}/memory/**/*.md`
3. If no match, grep file content for the keywords (`output_mode: "files_with_matches"`)

**After finding matches:**

1. Read the top 2-3 most relevant matched files
2. If a **direct match** is found (same or very similar question already answered):
   - Present the existing answer to the user (cite the memory file)
   - Ask if they want a fresh exploration or if the existing answer is sufficient
   - If sufficient → skip to Step 7 (no save needed)
3. If **related context** is found (useful background, not a direct answer):
   - Collect it as supplementary context to pass along to Step 3
4. If **no relevant memory** is found → proceed to Step 3

### Step 3: Explore the Codebase (via cf-explorer agent)

Launch the **cf-explorer agent** to gather codebase context for the question.

Use the **Agent tool** with `subagent_type: "coding-friend:cf-explorer"`. Pass:

> Explore the codebase to answer the following question: [question from Step 1]
>
> Questions to answer:
>
> 1. [rephrase the user's question as specific search targets]
> 2. What files, functions, or patterns are relevant?
> 3. What are the key code snippets that answer the question?
>
> Scope: [keywords and likely relevant areas from Step 1]

**If `IS_FLOW_QUESTION = true`**, add the following to the agent prompt:

> Flow mapping required — also identify and report:
>
> - **Entry points**: where does the flow start? (user action, event, API call, CLI command…)
> - **Actors / components**: what modules, classes, functions, or services are involved?
> - **States / stages**: what are the distinct states or phases the system moves through?
> - **Transitions**: what triggers movement from one state/stage to the next?
> - **Exit points / outcomes**: what are the final states or outputs?
> - **Error / alternate paths**: are there branches, retries, or failure modes?
>
> Organize findings as a list of states and transitions — not just a list of files.

If related memory context was found in Step 2, include it:

> Existing memory context (use as supplementary info, verify against current code):
>
> [summary of related memory findings]

Wait for the cf-explorer to return its findings.

### Step 4: Form the Answer

1. Synthesize findings into a clear, structured answer
2. Incorporate any related memory context from Step 2
3. Reference specific files and line ranges where relevant
4. Use code snippets only when they clarify the answer
5. Keep it concise — this is a focused answer, not a research paper

**If `IS_FLOW_QUESTION = true`**, also generate a Mermaid diagram as part of the answer:

- **Pick the right diagram type** based on the flow's shape:
  - Discrete states with transitions → `stateDiagram-v2`
  - Component-to-component interactions with messages → `sequenceDiagram`
  - Process with decisions / branching → `flowchart TD`
- **Rubric**: identify actors/states (nodes), then transitions/messages (edges), then add alternate/error paths as dotted or labeled edges. Label every transition with what triggers it. Keep the diagram to the minimum nodes needed to convey the big picture — omit internal implementation details that don't add clarity.
- The diagram IS the concise answer for flow questions — keep surrounding prose tight.

### Step 5: Present to User

1. Show the answer directly in the conversation
2. **If `IS_FLOW_QUESTION = true`**, display the Mermaid diagram inline (inside a `mermaid` fenced code block) before or after the prose — whichever gives the clearest reading order
3. List the key files that were consulted

### Step 6: Save to Memory (via cf-writer agent)

1. Read `language` config (local `.coding-friend/config.json` overrides global `~/.coding-friend/config.json`, default: `en`)
2. Search existing memory files in `{docsDir}/memory/` — if an existing file covers the same topic, use `task: update` (append). Otherwise, use `task: create`.
3. Choose the appropriate category:
   - `features/<name>.md` — for feature-specific logic, flows, APIs
   - `conventions/<name>.md` — for project-wide patterns and rules
   - `decisions/<name>.md` — for architecture/design decisions
4. Use kebab-case for file names

Construct a write spec and delegate to **cf-writer agent** via the **Agent tool** with `subagent_type: "coding-friend:cf-writer"`.

**When creating** a new file (use absolute path for `file_path`):

```
WRITE SPEC
----------
task: create
file_path: $CWD/{docsDir}/memory/{category}/{name}.md
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

  ```mermaid
  <diagram generated in Step 4>
  ```

  **Related files:** `path/to/file1`, `path/to/file2`
readme_update: false
auto_commit: false
existing_file_action: skip
```

**When appending** to an existing file (use absolute path for `file_path`):

```
WRITE SPEC
----------
task: update
file_path: $CWD/{docsDir}/memory/{category}/{name}.md
language: {language from config}
content: |
  ## Q&A: <short question summary> (YYYY-MM-DD)

  **Q:** <question>

  **A:** <concise answer>

  <!-- Include this section only when IS_FLOW_QUESTION = true -->
  ## Flow Diagram

  ```mermaid
  <diagram generated in Step 4>
  ```

  **Related files:** `path/to/file1`, `path/to/file2`
readme_update: false
auto_commit: false
existing_file_action: append
```

When appending, also instruct cf-writer to update the `updated` date in the existing frontmatter.

**Frontmatter rules:**

- `description`: factual, searchable summary under 100 chars. Good: `"JWT auth flow with refresh tokens and OAuth2 integration"`. Bad: `"About auth"`.
- `tags`: 3-5 keywords as array

### Step 7: Index in CF Memory (MANDATORY)

**This step is REQUIRED — do NOT skip it.**

After the cf-writer agent completes and the file is saved, you MUST call the `memory_store` MCP tool to index the memory in the database. This is a separate action from writing the file — the cf-writer agent does NOT do this.

**If creating a new memory** — call `memory_store` with:

- `title`: from the frontmatter title
- `description`: from the frontmatter description
- `type`: `fact`
- `tags`: from the frontmatter tags
- `content`: the full markdown content (including frontmatter)
- `importance`: 3 (default)
- `source`: "conversation"
- `index_only`: true

**If updating an existing memory** — call `memory_update` with:

- `id`: the memory ID (e.g., `features/auth-module` — derived from `{category}/{name}`)
- `content`: the updated full markdown content
- `tags`: updated tags array (if changed)

If the MCP tools are unavailable, log a warning to the user but do NOT fail silently — the user should know the memory was saved as a file but NOT indexed.

### Step 8: Confirm

Show the user a 2-line summary:

- **Markdown file:** `path/to/file.md` (created or appended)
- **Memory DB:** indexed ✓ — or: MCP unavailable, file only

## Rules

- Delegate exploration to the cf-explorer agent — keep the main context lean
- Stay lightweight — no multi-doc output
- Always save to `{docsDir}/memory/` — saving is mandatory, not optional
- Search existing memory files before creating new ones
- NEVER overwrite existing content — only append
- Respect `.coding-friend/ignore` patterns
- Use `language` config for answer language
- Create directories as needed
