---
name: cf-remember
description: Extract project knowledge from conversation to docs/memory
disable-model-invocation: true
---

# /cf-remember

Extract and save project knowledge. Topic: **$ARGUMENTS**

## Purpose

After a coding session, key knowledge gets lost — logic flows, conventions, decisions, gotchas. This skill captures that knowledge into the project's memory folder so future sessions (and humans) can quickly understand the project.

## Folder

Output goes to `{docsDir}/memory/` (default: `docs/memory/`). Check `.coding-friend/config.json` for custom `docsDir` if it exists.

## Workflow

### Step 1: Analyze the Conversation
Review the current conversation and identify:
- **Features worked on**: What was built or modified?
- **Logic flows**: How does the feature work? Key decision points?
- **Conventions**: Patterns established (naming, structure, API design)
- **Decisions**: Why was X chosen over Y?
- **Gotchas**: Tricky parts, common mistakes, non-obvious behavior

### Step 2: Determine the Category
Choose the right location:

| Category | Location | Use For |
|---|---|---|
| Feature docs | `{docsDir}/memory/features/<name>.md` | Feature-specific logic, flows, APIs |
| Conventions | `{docsDir}/memory/conventions/<name>.md` | Project-wide patterns and rules |
| Decisions | `{docsDir}/memory/decisions/<name>.md` | Architecture/design decision records |

### Step 3: Assess Complexity

Before delegating to the writer agent, assess the complexity of the content:

**Use `writer` agent (haiku)** when:
- Simple feature docs, naming conventions, straightforward decisions
- Short content with clear structure

**Use `writer-deep` agent (sonnet)** when:
- Complex architecture decisions with nuanced trade-offs
- Deep technical explanations requiring careful reasoning
- Long context that needs synthesis

### Step 4: Delegate to Writer Agent

Construct a write spec and invoke the appropriate writer agent via the `Task` tool.

Check if the target file already exists:
- File exists → `task: update`
- File doesn't exist → `task: create`

Read the `language` setting from config (local `.coding-friend/config.json` overrides global `~/.coding-friend/config.json`, default: `en`).

Build the write spec:

```
WRITE SPEC
----------
task: create | update
file_path: {docsDir}/memory/{category}/{name}.md
language: {language from config}
content: |
  # <Title>

  ## Overview
  <1-2 sentences describing this feature/convention/decision>

  ## Key Points
  - <point 1>
  - <point 2>

  ## Details
  <Longer explanation with code examples if needed>

  ## Gotchas
  - <gotcha 1>
  - <gotcha 2>

  ## Related
  - <link to related code/docs>
readme_update: false
auto_commit: false
existing_file_action: append
```

Use the `Task` tool to invoke `writer` or `writer-deep` (based on Step 3 assessment) with the complete write spec as the prompt.

### Step 5: Confirm
Read back the writer agent's output and show the user what was saved and where.

## Rules
- Use `$ARGUMENTS` as topic hint if provided
- If no topic given, scan the entire conversation for key knowledge
- Be concise — bullet points over paragraphs
- Include code snippets only when they clarify the point
- Create directories as needed
