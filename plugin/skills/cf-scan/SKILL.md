---
name: cf-scan
description: >
  Scan project and populate memory with knowledge — architecture, conventions, tech stack,
  key features, infrastructure. Use when a project has no memories yet, or when the user wants to
  refresh/rebuild project understanding — e.g. "scan the project", "scan the codebase",
  "bootstrap memory", "initialize memory with project knowledge", "populate memory",
  "build project understanding", "scan this aspect", "analyze the project".
  This is a token-heavy operation — always warn the user before proceeding.
user-invocable: true
argument-hint: "[project description]"
---

# /cf-scan

Scan the project and bootstrap the memory system. User input: **$ARGUMENTS**

## Purpose

New projects start with empty memory. This skill scans the codebase, extracts structured knowledge (architecture, conventions, tech stack, features, infrastructure), and stores it as memories. Safe to run multiple times — existing memories are updated, not duplicated.

## Folder

Output goes to `{docsDir}/memory/` (default: `docs/memory/`). Check `.coding-friend/config.json` for custom `docsDir` if it exists.

**IMPORTANT — path resolution:**

- Run `pwd` to get the current working directory — substitute its actual output wherever `$CWD` appears below (do NOT pass `$CWD` as a literal string)
- Only check `$CWD/.coding-friend/config.json` for `docsDir` — do NOT search sub-folders
- Always resolve `file_path` as an **absolute path**: `$CWD/{docsDir}/memory/{category}/{name}.md`
- Never use relative paths in write specs — they may resolve incorrectly when the working directory contains nested git repos

## Workflow

### Step 0: Load Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-scan`

If output is not empty, integrate the returned sections into this workflow:

- `## Before` → execute before Step 1
- `## Rules` → apply as additional rules throughout all steps
- `## After` → execute after the final step

### Step 1: Warn and Confirm

**This step is mandatory — do NOT skip.**

Tell the user:

> **This skill scans your project and populates memory. It uses significant tokens** (multiple explorer calls + memory writes). Estimated: 3-5 minutes depending on project size.
>
> - Existing memories will be **updated**, not duplicated
> - New memories will be **created** for discovered knowledge
> - Target: ~10-15 memories covering architecture, conventions, features, infrastructure

If `$ARGUMENTS` is provided, show it back: "I'll use your description to guide the scan: _{$ARGUMENTS}_"

**Ask the user to confirm before proceeding.** If they decline, stop.

Read config:

- Check `$CWD/.coding-friend/config.json` for `docsDir` (default: `docs`) and `language` (default: `en`)
- Store the project description from `$ARGUMENTS` (if any) for use in explorer prompts

### Step 2: Structural Scan (Phase 1 — Main Agent)

**Goal:** Build a "project profile" without using any agent calls. This is cheap (Glob + Read only).

**2a. Detect key files:**

Use Glob to check for these files (read whichever exist):

| Category         | Files to check                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Package/language | `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `pom.xml`, `build.gradle`, `composer.json`, `mix.exs` |
| Config           | `tsconfig.json`, `.eslintrc*`, `prettier.config*`, `biome.json`, `.editorconfig`                                           |
| Infrastructure   | `Dockerfile`, `docker-compose.yml`, `.github/workflows/*.yml`, `.gitlab-ci.yml`, `Makefile`, `Justfile`                    |
| Documentation    | `README.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `docs/`                                                    |
| Test             | `jest.config*`, `vitest.config*`, `pytest.ini`, `setup.cfg`, `.mocharc*`, `cypress.config*`                                |

**2b. Read and extract:**

Read the detected files (top-level only, not nested). Extract:

- **Primary language(s)** and framework(s)
- **Package manager** (npm/yarn/pnpm/pip/cargo/go/etc.)
- **Monorepo vs single project** (check for workspaces, multiple package.json, etc.)
- **Test framework** and test patterns
- **CI/CD system** (GitHub Actions, GitLab CI, etc.)
- **Key directories** (src/, lib/, app/, etc.)

**2c. Build project profile:**

Summarize findings as a short "project profile" (keep in your working memory, do not write a file). Example:

```
Language: TypeScript
Framework: Next.js 14 (App Router)
Package manager: pnpm
Structure: monorepo (3 packages)
Tests: Vitest + Playwright
CI: GitHub Actions
Key dirs: src/app/, src/components/, src/lib/, packages/
```

### Step 3: Deep Scan (Phase 2 — cf-explorer)

**Goal:** Send 2-4 **targeted** cf-explorer calls based on the project profile. Each call has a focused scope.

**IMPORTANT:**

- Include the project profile from Step 2 in every explorer prompt
- Include `$ARGUMENTS` (user's project description) if provided
- Each explorer must describe features/modules as **state machines** where applicable: states, transitions, triggers, side effects
- For monorepos with >10 packages, focus on root-level architecture and the 3 most recently modified packages

**Explorer calls (launch in parallel where possible):**

**(a) Architecture & Key Features** — always run this one:

> Explore this project and map its architecture. Project profile: {profile}. User description: {$ARGUMENTS or "none"}.
>
> For each major module or feature:
>
> 1. What it does (purpose, scope)
> 2. State machine: states → transitions → triggers → side effects
> 3. Key files and entry points
> 4. Dependencies (internal and external)
>
> Focus on the top 5-7 most important modules. Do NOT list every file — summarize at the module level.

**(b) Conventions & Patterns** — always run this one:

> Analyze coding conventions and patterns in this project. Project profile: {profile}.
>
> Look for:
>
> 1. Naming conventions (files, functions, variables, components)
> 2. Code organization patterns (barrel exports, index files, co-location)
> 3. Error handling patterns
> 4. API/data fetching patterns
> 5. State management approach
> 6. Import organization
>
> Be specific — cite actual examples from the code. Do NOT list generic best practices.

**(c) Infrastructure & Build** — only if CI/Docker/Makefile detected in Step 2:

> Analyze the build, deploy, and infrastructure setup. Project profile: {profile}.
>
> Cover:
>
> 1. Build pipeline: how code goes from source to production
> 2. CI/CD: what runs on push/PR, required checks
> 3. Environment setup: env vars, config files, secrets
> 4. Docker: what's containerized, multi-stage builds
> 5. Scripts: key npm scripts or Makefile targets
>
> Describe as a pipeline/state machine: trigger → stages → output.

**(d) Domain Concepts** — only for projects with rich domain logic (e-commerce, SaaS, APIs with business rules):

> Analyze the domain model and business logic. Project profile: {profile}. User description: {$ARGUMENTS or "none"}.
>
> For each core domain entity:
>
> 1. What it represents
> 2. State machine: lifecycle states → transitions → business rules
> 3. Relationships to other entities
> 4. Key invariants or validation rules
>
> Focus on domain-specific knowledge that isn't obvious from reading the code structure alone.

### Step 4: Synthesize & Store (Phase 3)

**Goal:** Convert explorer findings into memories. Deduplicate against existing memories.

**4a. Get existing memories:**

Call `memory_list` to retrieve all current memories. Build a lookup map: `{category}/{slug}` → memory object.

**4b. Plan memories:**

Based on explorer findings, plan ~10-15 memories across categories:

| Category          | Type         | Typical memories                                          |
| ----------------- | ------------ | --------------------------------------------------------- |
| `features/`       | `fact`       | One per major module/feature (3-7 memories)               |
| `conventions/`    | `preference` | Coding patterns, naming, organization (1-3 memories)      |
| `decisions/`      | `context`    | Architecture choices, tech stack rationale (1-2 memories) |
| `infrastructure/` | `procedure`  | Build, deploy, CI/CD setup (1-2 memories)                 |

**Memory cap:** Maximum 15 memories total. For large projects, merge related modules into broader memories rather than creating one per file.

**4c. For each planned memory:**

1. Check if a memory with matching `{category}/{slug}` exists in the lookup map
2. If **exists** → delegate to cf-writer with `task: update` and `existing_file_action: overwrite`, then call `memory_update` with params: `id` (e.g. "features/auth-module"), `content` (full new markdown), `tags` (updated tags array)
3. If **new** → assess complexity:
   - Simple (short, factual) → delegate to **cf-writer** agent (haiku)
   - Complex (nuanced architecture, deep trade-offs) → delegate to **cf-writer-deep** agent (sonnet)

**Write spec for cf-writer (same format as /cf-remember):**

```
WRITE SPEC
----------
task: create | update
file_path: $CWD/{docsDir}/memory/{category}/{name}.md
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

**4d. Index via MCP:**

After each cf-writer saves a file, call `memory_store` (for new) or `memory_update` (for existing) to index in SQLite:

- For `memory_store`: pass `title`, `description`, `type`, `tags`, `content`, `importance`: 3, `source`: "scan", `index_only`: true
- For `memory_update`: pass `id` (e.g. "features/auth-module"), `content` (full markdown body), `tags` (merged array if changed)

### Step 5: Summary

Print a summary table:

```
## Scan Complete

| # | Category | Title | Action | Description |
|---|----------|-------|--------|-------------|
| 1 | features | Auth Module | created | JWT auth with httpOnly cookies and RS256 |
| 2 | conventions | Naming Patterns | updated | PascalCase components, camelCase utils |
| ... | | | | |

Total: X memories (Y created, Z updated)
```

Then suggest next steps:

> - Run `/cf-scan` again anytime to refresh project knowledge
> - Use `/cf-remember` to capture specific knowledge from conversations
> - Use `/cf-ask` to query the memory system

## Interpreting `$ARGUMENTS`

`$ARGUMENTS` is an optional free-form project description. Examples:

- `/cf-scan` — scan with no additional context
- `/cf-scan This is a Next.js e-commerce app with Stripe payments and PostgreSQL` — use description to guide scan
- `/cf-scan Focus on the API layer and auth system` — narrow the scan focus

When provided, include `$ARGUMENTS` in every explorer prompt so the scan is guided by the user's context.

## Rules

- **Always warn about token cost** before starting (Step 1 is mandatory)
- **Cap at 15 memories** — merge related topics rather than creating many small memories
- **Breadth over depth** — cover all major areas rather than going deep on one
- **State machines for features** — describe features as state machines where applicable
- **Idempotent** — safe to run multiple times; existing memories are updated, not duplicated
- **Skip irrelevant categories** — no CI? skip infrastructure/ci. No tests? skip conventions/testing
- Be concise — bullet points over paragraphs
- Include code snippets only when they clarify the point
- Create directories as needed
