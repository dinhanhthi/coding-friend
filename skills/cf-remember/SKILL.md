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

### Step 3: Write or Update the Doc
If the file exists, **update** it (don't overwrite). If new, create it.

Template:
```markdown
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
```

### Step 4: Confirm
Show the user what was saved and where.

## Rules
- Use `$ARGUMENTS` as topic hint if provided
- If no topic given, scan the entire conversation for key knowledge
- Be concise — bullet points over paragraphs
- Include code snippets only when they clarify the point
- Create directories as needed
