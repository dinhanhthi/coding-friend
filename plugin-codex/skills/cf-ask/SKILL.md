---
name: cf-ask
description: >
  Quick Q&A about the codebase → docs/memory. Use for focused project questions — e.g.
  "how does X work?", "where is Y defined?", "what's the flow for Z?", "explain this
  module", "why is this done this way?". Unlike $cf-research, one answer.
created: 2026-02-20
updated: 2026-09-09
---

# $cf-ask

Answer the question: **$ARGUMENTS**

## Purpose

Quick, focused Q&A about the codebase. Proactively explores code to find the answer, then saves the Q&A to project memory so it can be referenced later.

- Unlike `$cf-research`: single focused answer, no multi-doc output
- Unlike `$cf-remember`: proactively explores the codebase to answer vs extracting knowledge already in conversation

Output: `{CF_DOCS_ROOT}/memory/{category}/{name}.md`. Never use relative paths in write specs (nested git repos); always `{CF_DOCS_ROOT}` / absolute.

## Workflow

### Step 0: Custom Guide

```!
bash "${PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-ask
```

If the block above printed anything, apply only the `## Before`, `## Rules`, and `## After` sections; if it shows the raw command instead of output, re-run that exact `load-custom-guide.sh` fence now.

### Step 1: Parse the Question

1. Read `$ARGUMENTS` as the question
2. If no question provided, ask the user what they want to know
3. Identify keywords and likely relevant areas (modules, features, patterns)
4. **Classify the question type** — check if the question is a _flow question_. A flow question asks about how something works end-to-end, how components interact, or what happens when a process runs. Trigger words: "how does X work", "flow of", "lifecycle", "sequence", "process", "when X happens", "walk me through", "how are X connected", "what triggers", "what happens when", "pipeline", "chain". Non-flow questions (lookup/definition/pattern/why) do NOT trigger this path.

   Set `IS_FLOW_QUESTION = true/false` for use in Steps 3, 4, 5, and 6.

### Step 2: Check Existing Memory (Memory Recall)

Before exploring the codebase, search existing memory docs.

Recall memory (see Verbs) with 2–3 keywords from the question: `{ "query": "<keywords>", "limit": 5 }`; grep scope `{CF_DOCS_ROOT}/memory/**/*.md`, third tier = file content.

**After finding matches:**

Read the top 2–3 most relevant matched files before treating a hit as a direct answer.

- **Direct match** (same or very similar question already answered): present the existing answer (cite the file); ask if they want a fresh exploration or if it's sufficient. If sufficient → skip to Step 7 (no save).
- **Related** (useful background, not a direct answer): carry it to Step 3 as supplementary context.
- **None** → Step 3.

### Step 3: Explore the Codebase (via cf-explorer agent)

Launch the **cf-explorer agent** to gather codebase context for the question.

Dispatch `cf-explorer`. Pass:

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

If IS_FLOW_QUESTION: add a plain-text ASCII diagram (box/arrow characters, no Mermaid) in a fenced block — state chart, sequence lanes, or flowchart; layout rubric in `references/ask-templates.md`.

### Step 5: Present to User

1. Show the answer directly in the conversation
2. **If `IS_FLOW_QUESTION = true`**, display the ASCII diagram inline (inside a plain fenced code block) before or after the prose — whichever gives the clearest reading order
3. List the key files that were consulted

### Step 6: Save to Memory (via cf-writer agent)

1. Read `language` config (local `.coding-friend/config.json` overrides global `~/.coding-friend/config.json`, default: `en`)
2. Search existing memory files in `{docsDir}/memory/` — if an existing file covers the same topic, use `task: update` (append). Otherwise, use `task: create`.
3. Choose the appropriate category:
   - `features/YYYY-MM-DD-<name>.md` — for feature-specific logic, flows, APIs
   - `conventions/YYYY-MM-DD-<name>.md` — for project-wide patterns and rules
   - `decisions/YYYY-MM-DD-<name>.md` — for architecture/design decisions
4. Use kebab-case for file names

Dispatch `cf-writer` with the create or append spec from `references/ask-templates.md` (absolute `file_path`; append also updates `updated`).

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
