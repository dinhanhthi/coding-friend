---
name: cf-scan
description: >
  Scan the project and populate memory (architecture, conventions, stack, features).
  Triggers: "scan the project", "scan the codebase", "bootstrap memory", "populate
  memory", "analyze the project". Token-heavy — always warn before proceeding.
created: 2026-03-16
updated: 2026-09-09
---

# /cf-scan

Scan the project and bootstrap the memory system. User input: **$ARGUMENTS**

## Purpose

New projects start with empty memory. This skill scans the codebase, extracts structured knowledge (architecture, conventions, tech stack, features, infrastructure), and stores it as memories. Safe to run multiple times — existing memories are updated, not duplicated.

Output: `{CF_DOCS_ROOT}/memory/{category}/{name}.md`. Never use relative paths in write specs (nested git repos); always `{CF_DOCS_ROOT}` / absolute.

## Workflow

### Step 0: Custom Guide

```!
bash "<plugin-root>/lib/load-custom-guide.sh" cf-scan
```

If the block above printed anything, apply only the `## Before`, `## Rules`, and `## After` sections; if it shows the raw command instead of output, re-run that exact `load-custom-guide.sh` fence now.

### Step 0.5: Context Budget Check

Before proceeding, assess context budget:

- If context is above 50%, prefer **selective reads** (Read with offset/limit) over full file reads
- Limit cf-explorer exploration depth — map structure broadly but only deep-read files directly relevant to memory creation
- If context is above 70%, warn the user that scan quality may degrade and suggest running in a fresh session

### Step 1: Warn and Confirm

**This step is mandatory — do NOT skip.**

Tell the user:

> **This skill scans your project and populates memory. It uses significant tokens** (multiple explorer calls + memory writes). Estimated: 3-5 minutes depending on project size.
>
> - Existing memories will be **updated**, not duplicated
> - New memories will be **created** for discovered knowledge
> - Target: ~10-15 memories covering architecture, conventions, features, infrastructure

`$ARGUMENTS` is an optional free-form project description; when provided, show it back ("I'll use your description to guide the scan: _{$ARGUMENTS}_") and include it in every explorer prompt.

**Ask the user to confirm before proceeding.** If they decline, stop.

Read config from `CF_CONFIG_FILE` (= `$MAIN_REPO_ROOT/.coding-friend/config.json`) for `docsDir` (default: `docs`) and `language` (default: `en`).

### Step 2: Structural Scan (Phase 1 — Main Agent)

**Goal:** Build a "project profile" without using any agent calls. This is cheap (Glob + Read only).

**2a. Detect key files:**

Use Glob to check for these files (read whichever exist):

| Category         | Files to check                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Package/language | `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `pom.xml`, `build.gradle`, `composer.json`, `mix.exs` |
| Config           | `tsconfig.json`, `.eslintrc*`, `prettier.config*`, `biome.json`, `.editorconfig`                                           |
| Infrastructure   | `Dockerfile`, `docker-compose.yml`, `.github/workflows/*.yml`, `.gitlab-ci.yml`, `Makefile`, `Justfile`                    |
| Documentation    | `README.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `AGENTS.md`, `docs/`                                                    |
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
2. If **exists** → Dispatch `cf-writer` with `task: update` and `existing_file_action: overwrite`, then call `memory_update` with params: `id` (e.g. "features/auth-module"), `content` (full new markdown), `tags` (updated tags array)
3. If **new** → assess complexity:
   - Simple (short, factual) → Dispatch `cf-writer` (flash)
   - Complex (nuanced architecture, deep trade-offs) → Dispatch `cf-writer-deep` (pro)

Write spec (same format as /cf-remember) and frontmatter rules: `references/scan-templates.md` — `source: scan`, `existing_file_action: overwrite`, keep filenames of existing memories.

**4d. Index via MCP:**

After each cf-writer saves a file, call `memory_store` (for new) or `memory_update` (for existing) to index in SQLite:

- For `memory_store`: pass `title`, `description`, `type`, `tags`, `content`, `importance`: 3, `source`: "scan", `index_only`: true
- For `memory_update`: pass `id` (e.g. "features/auth-module"), `content` (full markdown body), `tags` (merged array if changed)

### Step 5: Summary

Print the summary table from `references/scan-templates.md`, then suggest `/cf-scan` again, `/cf-remember`, `/cf-ask`.

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
