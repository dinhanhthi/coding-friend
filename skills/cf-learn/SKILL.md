---
name: cf-learn
version: 1.5.0
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

## Step 3: Write the Learning Doc

### Language Rules

Choose writing style based on top-level `language` config:

- **`en` (English):** Write everything in English.
- **`vi` (Vietnamese):** Write explanations in Vietnamese. Keep all technical terms, code, commands, library names, and variable names in English.
- **Other languages:** Write explanations in the configured language. Keep technical terms in English.

### New File Template

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

```<language>
// Real code from this session showing the concept
```

## Gotchas
- <Common mistake 1>
- <Common mistake 2>

## Read More
- <Link to official docs>
- <Link to good tutorial>
```

### When Appending to Existing Files

- Add new content under a new `## Heading` or as bullet points under an existing heading
- Update the `updated` date in frontmatter
- Add new tags to the frontmatter if the new content introduces new topics
- Keep the file focused — if it's getting too long (>300 lines), create a new file instead

## Step 4: Update README Index (if configured)

Skip this step if `readmeIndex` is `false`.

### Mode: `true` (single README)

Create or update `{outputDir}/README.md` with all categories and file listings:

```markdown
# Learning Notes

## Categories

### <category-name>/
- [file-name.md](<category>/file-name.md) - Brief description

...

---
*Last updated: YYYY-MM-DD*
```

### Mode: `"per-category"` (distributed index)

Update **two** README files:

**1. Category README** — `{outputDir}/{category}/README.md`

List all `.md` files in that category (excluding README.md itself):

```markdown
# <Category Name>

<category description from config>

## Notes

- [file-name.md](file-name.md) - Brief description (from frontmatter `title` or first heading)
- [another-file.md](another-file.md) - Brief description

---
*Last updated: YYYY-MM-DD*
```

**2. Main README** — `{outputDir}/README.md`

List only categories with their descriptions. Do NOT list individual files here — that's the category README's job. Include a short summary line under each category showing how many notes it contains.

```markdown
# Learning Notes

## Categories

### [<Category Name>](<category-folder>/)
<category description> — *N notes*

### [<Category Name>](<category-folder>/)
<category description> — *N notes*

...

---
*Last updated: YYYY-MM-DD*
```

Only include categories that have at least one note file. Count only `.md` files excluding `README.md`.

## Step 5: Auto-Commit (if configured)

If `autoCommit` is `true` AND `outputDir` is inside a git repository:

```bash
cd {outputDir} && git add -A && git commit -m "learn: <brief summary of topics added>"
```

If `outputDir` is not a git repo, skip this step silently.

## Step 6: Confirm

Show the user:
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
