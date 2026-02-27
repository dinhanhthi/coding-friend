---
name: cf-learn
description: Extract knowledge for human learning from conversation (configurable output, language, categories). Auto-invoke this skill when the conversation contains substantial new technical knowledge, problem-solving insights, or non-trivial concepts worth preserving — such as debugging breakthroughs, architecture decisions, best practices, or explanations of complex topics. Do NOT auto-invoke for trivial tasks like simple file edits, typo fixes, or routine operations.
user-invocable: true
argument-hint: "[optional: specific topic or focus area to extract]"
---

# /cf-learn

Extract learning points for human understanding. Topic: **$ARGUMENTS**

## Purpose

In vibe coding, AI writes the code and human approves it — but the human doesn't actually learn anything. This skill extracts knowledge from the conversation and writes it as clear, educational docs so the human builds real understanding over time.

## Step 0: Load Config

Read config from two locations and merge (local overrides global):

1. **Local:** `<project-root>/.coding-friend/config.json`
2. **Global:** `~/.coding-friend/config.json`

Extract settings with these defaults:

**Top-level settings:**

| Setting | Default | Description |
|---|---|---|
| `language` | `en` | Language for writing docs (shared by all skills) |

**`learn` settings:**

| Setting | Default | Description |
|---|---|---|
| `learn.outputDir` | `{docsDir}/learn` (where `docsDir` defaults to `docs`) | Where to store learn docs |
| `learn.categories` | See Step 2 table | Subdirectories and their descriptions |
| `learn.autoCommit` | `false` | Auto git-commit after writing |
| `learn.readmeIndex` | `false` | Index mode: `false` (none), `true` (single README), `"per-category"` (separate README per category + lightweight main README) |

**Path resolution for `outputDir`:**
- Starts with `/` → absolute path, use as-is
- Starts with `~/` → expand `~` to home directory
- Otherwise → relative to project root

If `outputDir` directory doesn't exist, create it.

## Step 1: Identify Knowledge Points

Scan the conversation for things the human might not fully understand:
- **New concepts**: Design patterns, algorithms, architecture principles
- **Language features**: Syntax, idioms, type system features
- **Library/tool usage**: API patterns, configuration, best practices
- **Debugging techniques**: How a bug was found and fixed
- **Best practices**: Why something was done a certain way

## Step 2: Categorize

Use categories from config. Default categories:

| Category | Folder name | Examples |
|---|---|---|
| Concepts | `concepts` | Dependency injection, event sourcing |
| Patterns | `patterns` | Repository pattern, observer pattern |
| Languages | `languages` | TypeScript generics, Python decorators |
| Tools | `tools` | Prisma migrations, Docker compose |
| Debugging | `debugging` | Race condition fix, memory leak hunt |

File path: `{outputDir}/{category}/{name}.md`

### Discovery: Check Existing Files

Before creating a new file, check if a relevant file already exists in the target category:

```bash
find {outputDir} -name "*.md" -not -name "README.md" | sort
```

For each potentially relevant file, read its first 20 lines to understand what it covers. If the new knowledge fits an existing file, **append** to it instead of creating a new one.

## Step 3: Assess Complexity

Before delegating to the writer agent, assess the complexity of the content to write:

**Use `writer` agent (haiku)** when:
- Simple, factual concepts (e.g., "how to use X tool", "naming convention for Y")
- Straightforward tool/library usage notes
- Short content with clear structure
- Single-concept explanations

**Use `writer-deep` agent (sonnet)** when:
- Content requires deep reasoning about nuanced technical concepts (e.g., explaining race conditions, distributed system trade-offs, complex type system features)
- Very long context needs to be synthesized into a coherent doc
- Multi-concept synthesis is needed (connecting several ideas into one explanation)
- Advanced architecture explanations or subtle debugging insights

## Step 4: Delegate to Writer Agent

Construct a write spec and invoke the appropriate writer agent via the `Task` tool.

### Determine Task Type

- If an existing file was found in Step 2 (Discovery) that matches → `task: append`
- Otherwise → `task: create`

### Build the Write Spec

Include ALL of these in your delegation prompt to the writer agent:

```
WRITE SPEC
----------
task: create | append
file_path: {outputDir}/{category}/{name}.md
language: {language from config}
content: |
  <The full markdown content to write, including frontmatter for new files>
readme_update: {readmeIndex from config: false | true | per-category}
readme_path: {outputDir}/README.md (and {outputDir}/{category}/README.md for per-category)
auto_commit: {autoCommit from config}
commit_message: learn: <brief summary of topics added>
existing_file_action: append
category_description: {description of the category from config}
```

### Content to Include in the Write Spec

**For new files (`task: create`)**, include full content with frontmatter:

```markdown
---
title: "<Concept Name>"
category: "<category-name>"
tags: [tag1, tag2, tag3]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# <Concept Name>

## What
<1-2 sentences: what is this concept?>

## Why
<When would you use it? Why does it matter?>

## How
<Code example from the actual project — not a generic tutorial>

## Gotchas
- <Common mistake 1>
- <Common mistake 2>

## Read More
- <Link to official docs>
- <Link to good tutorial>
```

**For appending (`task: append`)**, include only the new content to add:
- New section under a `## Heading`
- Note to update `updated` date in frontmatter
- Note to add new tags if applicable
- If file is getting long (>300 lines), switch to `task: create` with a new file name

### Language Rules (include in write spec)

- `en`: Write everything in English
- `vi`: Write explanations in Vietnamese. Keep all technical terms, code, commands, library names, and variable names in English
- Other: Write explanations in the configured language. Keep technical terms in English

### README Index Formats (include if readme_update is not false)

**Mode `true` (single README)** — `{outputDir}/README.md`:
```markdown
# Learning Notes

## Categories

### <category-name>/
- [file-name.md](<category>/file-name.md) - Brief description

---
*Last updated: YYYY-MM-DD*
```

**Mode `"per-category"`** — two files:

1. Category README at `{outputDir}/{category}/README.md`:
```markdown
# <Category Name>

<category description>

## Notes
- [file-name.md](file-name.md) - Brief description
---
*Last updated: YYYY-MM-DD*
```

2. Main README at `{outputDir}/README.md`:
```markdown
# Learning Notes

## Categories

### [<Category Name>](<category-folder>/)
<category description> — *N notes*
---
*Last updated: YYYY-MM-DD*
```

Only include categories with at least one note file (excluding README.md).

### Invoke the Agent

Use the `Task` tool to invoke `writer` or `writer-deep` (based on Step 3 assessment) with the complete write spec as the prompt.

## Step 5: Confirm

Read back the writer agent's output and show the user:
1. What was learned and where the doc was saved (full path)
2. Whether the file was created new or appended to
3. If auto-committed, show the commit message

## Rules
- Write for a human who can read code but might not understand WHY it works
- Use examples from the ACTUAL conversation/project, not generic textbook examples
- ELI5 style — explain like the reader is smart but unfamiliar with this specific topic
- One concept per file — keep it focused (unless appending a closely related point)
- If `$ARGUMENTS` is provided, focus on that topic
- If no topic given, pick the most interesting/valuable learnings from the session
- Create directories as needed
- NEVER delete or overwrite existing content — only append or create new
