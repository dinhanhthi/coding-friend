---
name: cf-learn
description: Extract knowledge for human learning from conversation to docs/learn
disable-model-invocation: true
---

# /cf-learn

Extract learning points for human understanding. Topic: **$ARGUMENTS**

## Purpose

In vibe coding, AI writes the code and human approves it — but the human doesn't actually learn anything. This skill extracts knowledge from the conversation and writes it as clear, educational docs so the human builds real understanding over time.

## Folder

Output goes to `{docsDir}/learn/` (default: `docs/learn/`). Check `.coding-friend/config.json` for custom `docsDir` if it exists.

## Workflow

### Step 1: Identify Knowledge Points
Scan the conversation for things the human might not fully understand:
- **New concepts**: Design patterns, algorithms, architecture principles
- **Language features**: Syntax, idioms, type system features
- **Library/tool usage**: API patterns, configuration, best practices
- **Debugging techniques**: How a bug was found and fixed
- **Best practices**: Why something was done a certain way

### Step 2: Categorize
Choose the right location:

| Category | Location | Examples |
|---|---|---|
| Concepts | `{docsDir}/learn/concepts/<name>.md` | Dependency injection, event sourcing |
| Patterns | `{docsDir}/learn/patterns/<name>.md` | Repository pattern, observer pattern |
| Languages | `{docsDir}/learn/languages/<name>.md` | TypeScript generics, Python decorators |
| Tools | `{docsDir}/learn/tools/<name>.md` | Prisma migrations, Docker compose |
| Debugging | `{docsDir}/learn/debugging/<name>.md` | Race condition fix, memory leak hunt |

### Step 3: Write the Learning Doc
Each doc follows this structure:

```markdown
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

### Step 4: Confirm
Show the user what was learned and where the doc was saved.

## Rules
- Write for a human who can read code but might not understand WHY it works
- Use examples from the ACTUAL conversation/project, not generic textbook examples
- ELI5 style — explain like the reader is smart but unfamiliar with this specific topic
- One concept per file — keep it focused
- If `$ARGUMENTS` is provided, focus on that topic
- If no topic given, pick the most interesting/valuable learnings from the session
- Create directories as needed
