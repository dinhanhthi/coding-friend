---
name: cf-teach
description: >
  Personal teacher skill — after any task, explains what happened in a conversational, storytelling
  way (like a sharp friend over coffee). Covers: approach taken, alternatives rejected, how parts
  connect, tools used, tradeoffs, mistakes made, pitfalls to watch, expert observations, and
  transferable lessons. Unlike /cf-learn (concise structured reference notes), this creates a
  narrative deep-dive for the human to truly understand what happened and why.
user-invocable: true
argument-hint: "[optional: topic or specific task to explain]"
---

# /cf-teach

You are my personal teacher. Explain what just happened: **$ARGUMENTS**

## Purpose

In any coding session, the AI does the heavy thinking — but the human often walks away with just the result, not the understanding. This skill breaks down the entire task in plain language, like a sharp friend explaining it over coffee. Not a textbook. Not documentation. A story about how and why.

## Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-teach`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before the first step
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

## Step 0: Load Config

Read config from two locations and merge (local overrides global):

1. **Local:** `<project-root>/.coding-friend/config.json`
2. **Global:** `~/.coding-friend/config.json`

Extract settings with these defaults:

| Setting            | Default                                                | Description                                                         |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------- |
| `learn.language`   | `en`                                                   | Language for output (falls back to top-level `language`, then `en`) |
| `learn.outputDir`  | `{docsDir}/learn` (where `docsDir` defaults to `docs`) | Where to save the teaching doc                                      |
| `learn.autoCommit` | `false`                                                | Auto git-commit after writing                                       |

**Language resolution:** Read `learn.language` from config. If not set, fall back to top-level `language`. If neither is set, default to `en`.

**Path resolution for `outputDir`:**

- Run `pwd` to get the current working directory — substitute its actual output wherever `$CWD` appears below
- Starts with `/` → absolute path, use as-is
- Starts with `~/` → expand `~` to home directory
- Otherwise → relative to `$CWD`
- Always pass `file_path` as an **absolute path** to the cf-writer-deep agent

If `outputDir` directory doesn't exist, create it.

## Step 1: Reconstruct the Session

Look back at the full conversation and identify:

- **The main task or problem** — what were we trying to accomplish?
- **The approach taken** — how did the AI solve it, step by step?
- **Alternatives considered** — what other approaches were mentioned, tried, or rejected?
- **Key tools, frameworks, patterns, or techniques** used
- **Any mistakes, pivots, or wrong turns** that occurred
- **Tradeoffs** — what was prioritized and what was sacrificed?
- **How the pieces connect** — how do the different parts of the solution relate?

If `$ARGUMENTS` is provided, focus the explanation on that specific topic or aspect of the session.

## Step 2: Categorize and Determine Output File

### Categorize

Use categories from config. Default categories:

| Category  | Folder name | Examples                               |
| --------- | ----------- | -------------------------------------- |
| Concepts  | `concepts`  | Dependency injection, event sourcing   |
| Patterns  | `patterns`  | Repository pattern, observer pattern   |
| Languages | `languages` | TypeScript generics, Python decorators |
| Tools     | `tools`     | Prisma migrations, Docker compose      |
| Debugging | `debugging` | Race condition fix, memory leak hunt   |

### Determine File Name

Choose a snake-case, meaningful file name that describes the story — not just the topic. **File name must start with `cf-teach-`**. Examples:

- `cf-teach-how-i-debugged-the-race-condition.md`
- `cf-teach-why-we-chose-redis-over-postgres.md`
- `cf-teach-building-the-auth-middleware-from-scratch.md`
- `cf-teach-the-refactor-that-untangled-the-api-layer.md`

File path: `{outputDir}/{category}/{name}.md`

### Check Existing Files

Before creating a new file, check if a relevant file already exists in the target category:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-learn/scripts/list-learn-files.sh" "/absolute/path/to/outputDir"
```

For each potentially relevant file, read its first 20 lines. If the new teaching narrative fits an existing file, use a different name to avoid overwriting.

## Step 3: Compose the Narrative (Show in Chat First)

**Before saving anything**, compose the full narrative and display it directly in the chat. This is the teaching moment — the human reads it here first.

The narrative must cover all 9 dimensions below. Write it as a flowing story, not a checklist. Use the actual project examples, not generic illustrations.

---

### The 9 Dimensions

**1. The Approach — and the Reasoning Behind It**

Walk through what approach was taken and why. What was the starting point? What did the AI consider first? Don't just describe what was done — explain the thought process that led there. What made this approach feel right?

**2. The Roads Not Taken**

What other approaches were considered but rejected? Why? What was wrong with them, or what made them less suitable? This is often where the deepest learning lives — understanding why _not_ to do something is as valuable as knowing why to do it.

**3. How the Pieces Fit Together**

If there was a plan, a draft, a structure — show how each piece connects to the others. Why is the order what it is? How does part A depend on or enable part B? A solution is rarely a single step; show the architecture of the thinking.

**4. The Tools, Methods, and Frameworks**

What specific tools, patterns, libraries, or techniques were used? Why those specifically, and not alternatives? What would have changed if different choices were made?

**5. The Tradeoffs**

Every decision has a cost. What was prioritized and what was sacrificed? Speed vs. correctness? Simplicity vs. flexibility? Show both sides of each key decision.

**6. The Mess — Mistakes, Dead Ends, Corrections**

What went wrong? What had to be revised or thrown out? How were those problems fixed? Don't sanitize the process — the mess is where the real learning lives.

**7. Pitfalls to Watch For**

If someone does something similar in the future, what should they watch out for? The "I wish someone told me this" advice. Specific, practical, based on what actually happened.

**8. What an Expert Would Notice**

What separates good thinking from average thinking here? What would a senior engineer or experienced practitioner immediately see in this work that a beginner would miss — about the approach, the tradeoffs, or the implementation?

**9. What Transfers to Other Projects**

What lessons from this work apply to completely different contexts? Connect the dots — what's the underlying principle that shows up across many types of problems?

---

**Tone and style rules for the narrative:**

- Write like a sharp friend explaining over coffee, not a technical author writing docs
- Use analogies, short stories, and real-world comparisons to make abstract ideas concrete
- Ground every concept in something from the actual session — no generic examples
- Make it engaging enough that the human actually wants to read it
- The human should finish and feel: "Now I actually understand what happened and why"

## Step 4: Save the Doc

After displaying the narrative in chat, delegate to the **cf-writer-deep agent** (always — never cf-writer) to save it as a file.

Use the **Agent tool** with `subagent_type: "coding-friend:cf-writer-deep"` and include this write spec:

```
WRITE SPEC
----------
task: create
file_path: {absolute path to outputDir}/{category}/{name}.md
language: {resolved language from Step 0}
content: |
  <The full narrative content — same as what was shown in chat>
auto_commit: {autoCommit from config}
commit_message: learn: <brief description of what was explained>
```

**Content format** — include frontmatter with tags, then the narrative:

```markdown
---
title: "<Meaningful Title That Describes the Story>"
category: "<category-name>"
tags: [CF Teach, tag2, tag3]
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# <Meaningful Title That Describes the Story>

<The full 9-dimension narrative — flowing prose, not a checklist>
```

**Tag rules:** Always include `"CF Teach"` as the first tag. Add 2-4 additional tags relevant to the topic.

## Step 5: Confirm

After the cf-writer-deep agent completes, show the user:

1. Where the doc was saved (full path)
2. If auto-committed, show the commit message

## Rules

- **Always show the narrative in chat first** — the human reads it here, not just from the file
- **Always use cf-writer-deep** (sonnet) — never cf-writer (haiku). The storytelling format requires nuanced tone and synthesis.
- **Include frontmatter with tags** — always include `"CF Teach"` tag plus 2-4 topic-relevant tags
- **Use category subdirectories** — output to `{outputDir}/{category}/{name}.md` (same structure as cf-learn)
- **Use actual examples** from the session — never generic illustrations
- **Conversational tone** — like explaining to a smart friend, not writing documentation
- **Never skip dimensions** — all 9 must be covered, even briefly, in every teaching doc
- **NEVER delete or overwrite existing content** — if a similar file exists, use a different name
- This is distinct from `/cf-learn`: cf-learn = concise reference notes; cf-teach = deep narrative story
