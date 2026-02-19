# coding-friend Architecture

## Overview

coding-friend is a lean toolkit for Claude Code that enforces disciplined engineering workflows. It solves two problems specific to vibe coding:

1. **Project knowledge loss** — After many sessions, no one remembers logic/conventions/decisions
2. **Human learning gap** — AI writes code, human approves without learning anything

---

## Directory Structure

```
coding-friend/
├── bin/cf.js                    # CLI entry point
├── CLAUDE.md                    # Claude Code instruction (~3000 tokens)
├── README.md                    # Installation guide
├── .coding-friend/              # User config
│   ├── config.json              # Settings (optional)
│   └── ignore                   # Agent ignore patterns
│
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
│
├── .claude/
│   ├── settings.json            # Hooks config (drop-in mode)
│   └── agents/
│       ├── code-reviewer.md     # Code review subagent
│       ├── implementer.md       # TDD implementation subagent
│       └── planner.md           # Exploration + task breakdown
│
├── hooks/
│   ├── hooks.json               # Plugin hooks manifest
│   ├── session-init.sh          # SessionStart: bootstrap context
│   ├── dev-rules-reminder.sh    # UserPromptSubmit: inject rules
│   ├── privacy-block.sh         # PreToolUse: block sensitive files
│   ├── scout-block.sh           # PreToolUse: respect .coding-friend/ignore
│   ├── statusline.sh            # Statusline: context tracking
│   ├── compact-marker.sh        # PreCompact: preserve context
│   └── context-tracker.sh       # PostToolUse: track files read
│
├── skills/
│   ├── cf-help/                 # Meta-skill (background)
│   ├── cf-init/                 # /cf-init — workspace setup
│   ├── cf-plan/                 # /cf-plan — brainstorm + write plans
│   ├── cf-review/               # /cf-review — dispatch code review
│   ├── cf-commit/               # /cf-commit — smart commit
│   ├── cf-ship/                 # /cf-ship — verify + commit + push + PR
│   ├── cf-fix/                  # /cf-fix — quick bug fix
│   ├── cf-remember/             # /cf-remember — project knowledge → docs/memory/
│   ├── cf-learn/                # /cf-learn — human learning (also auto-invoked)
│   ├── cf-research/             # /cf-research — web research → docs/research/
│   ├── cf-statusline/           # /cf-statusline — statusline setup
│   ├── cf-update/               # /cf-update — plugin update
│   ├── cf-tdd/                  # TDD workflow (auto-invoked)
│   ├── cf-sys-debug/            # 4-phase debugging (auto-invoked)
│   ├── cf-code-review/          # Review guide (auto-invoked)
│   └── cf-verification/         # Verify before claiming done
│
├── lib/
│   ├── core.js                  # Shared utilities
│   ├── config.js                # Config loader
│   └── cli/                     # CLI commands + helpers
│
└── docs/                        # Project docs + generated docs
    ├── architecture.md          # This file
    ├── config-schema.md         # Config schema reference
    ├── workflows.md             # Workflow guides
    ├── CHANGELOG.md             # Version history
    ├── plans/                   # Implementation plans
    ├── memory/                  # Project knowledge
    ├── learn/                   # Human learning notes
    └── research/                # In-depth research results
```

---

## Skills Architecture (16 skills)

### Reference Skills (5) — Auto-loaded when relevant

| Skill | Trigger | Core Concept |
|---|---|---|
| `cf-help` | Bootstrap (session-init hook) | Meta-skill: skill discovery, core rules |
| `cf-tdd` | Writing new code | Iron law: no code without failing test |
| `cf-sys-debug` | Debugging bugs | 4-phase: investigate → analyze → test → fix |
| `cf-code-review` | During code review | 4-layer: plan, quality, security, testing |
| `cf-verification` | Before claiming done | Gate: no claims without fresh evidence |

Note: `cf-learn` is also auto-invoked when substantial new knowledge is detected in conversation.

### Task Skills (11) — User-triggered via `/slash`

| Skill | Command | Key Feature |
|---|---|---|
| `cf-init` | `/cf-init` | Initialize workspace (folders, .gitignore, learn config, Claude permissions) |
| `cf-plan` | `/cf-plan [task]` | Brainstorm + write implementation plan |
| `cf-review` | `/cf-review [target]` | Fork context → code-reviewer agent |
| `cf-commit` | `/cf-commit [hint]` | Analyze diff → conventional commit |
| `cf-ship` | `/cf-ship [hint]` | Verify + commit + push + PR |
| `cf-fix` | `/cf-fix [bug]` | Quick bug fix, escalates to cf-sys-debug after 3 failures |
| `cf-remember` | `/cf-remember [topic]` | Extract project knowledge → docs/memory/ |
| `cf-learn` | `/cf-learn [topic]` | Extract learnings (configurable output, language, categories) |
| `cf-research` | `/cf-research [topic]` | In-depth research with web search → docs/research/ |
| `cf-statusline` | `/cf-statusline` | Setup coding-friend statusline |
| `cf-update` | `/cf-update` | Update plugin + refresh statusline |

### Frontmatter Configuration

```yaml
# Reference skill (auto-loaded by Claude)
---
name: cf-tdd
description: Use when writing new production code or adding features
---

# Task skill (user-only)
---
name: cf-commit
description: Smart conventional commit with diff analysis
disable-model-invocation: true
---

# Background skill (never user-invoked)
---
name: cf-verification
description: Verify before claiming work is complete
user-invocable: false
---

# Forked skill (runs in subagent)
---
name: cf-review
description: Dispatch code review to subagent
disable-model-invocation: true
context: fork
agent: code-reviewer
---
```

---

## Hooks System (7 hooks)

| Hook | Event | Purpose |
|---|---|---|
| `session-init.sh` | SessionStart | Bootstrap context: load meta-skill, detect project, load .coding-friend/ignore |
| `dev-rules-reminder.sh` | UserPromptSubmit | Inject core rules on every prompt (<200 tokens) |
| `privacy-block.sh` | PreToolUse | Block .env, credentials, keys. Exit 2 = block |
| `scout-block.sh` | PreToolUse | Respect .coding-friend/ignore patterns. Exit 2 = block |
| `statusline.sh` | Statusline | Show context usage, git branch, session info |
| `compact-marker.sh` | PreCompact | Mark critical context before compaction |
| `context-tracker.sh` | PostToolUse | Track files read (async: true) |

### Hook I/O Protocol

```
Input: JSON via stdin
{
  "type": "SessionStart|PreToolUse|...",
  "tool_name": "Read|Write|Bash|...",
  "tool_input": { "file_path": "/path/to/file" }
}

Output: JSON via stdout
{
  "hookSpecificOutput": {
    "additionalContext": "Context to inject...",
    "decision": "block",
    "reason": "Access to .env blocked by privacy-block"
  }
}

Exit codes:
  0 = allow (with optional context injection)
  2 = block tool execution
```

---

## Agents (3)

| Agent | Model | Purpose |
|---|---|---|
| `code-reviewer` | inherit | 4-layer review: plan alignment, quality, security, testing |
| `implementer` | inherit | TDD implementation: write test → implement → verify |
| `planner` | inherit | Codebase exploration + task decomposition |

---

## Claude Code Plugin

- `.claude-plugin/plugin.json` — plugin manifest
- `hooks/hooks.json` — plugin hooks
- `skills/` — auto-discovered by Claude Code
- `.claude/agents/` — subagent definitions

---

## /cf-remember — Project Knowledge

### Workflow
1. Analyze the current conversation
2. Identify the feature/module being worked on
3. Extract: logic flow, conventions, decisions, gotchas
4. Create/update files in `docs/memory/`

### Output Structure
```
docs/memory/
├── features/           # Feature-specific docs
│   └── auth.md         # e.g., auth flow, token handling
├── conventions/        # Project conventions
│   └── api-patterns.md # e.g., REST conventions
└── decisions/          # Architecture decisions
    └── why-postgres.md # e.g., DB choice rationale
```

---

## /cf-learn — Human Learning (Configurable)

### Config

Uses layered config (local `.coding-friend/config.json` overrides global `~/.coding-friend/config.json`):

| Setting | Default | Description |
|---|---|---|
| `language` (top-level) | `en` | Writing language for all skills (`en`, `vi`, etc.) |
| `learn.outputDir` | `{docsDir}/learn` | Where to store (relative, absolute, or `~/`) |
| `learn.categories` | 5 defaults | Customizable subdirectories |
| `learn.autoCommit` | `false` | Auto git-commit (for separate repos) |
| `learn.readmeIndex` | `false` | Index mode: `false` (none), `true` (single README), `"per-category"` (distributed) |

### Workflow
1. Load config (local > global > defaults)
2. Analyze conversation: concepts, patterns, techniques
3. Discovery: check existing files before creating new ones
4. Categorize using configured categories
5. Write docs in configured language (ELI5 style, concrete examples)
6. Update README index (if configured)
7. Auto-commit (if configured)

### Default Output Structure
```
{outputDir}/
├── concepts/           # CS concepts
├── patterns/           # Design patterns
├── languages/          # Language-specific
├── tools/              # Libraries/tools
└── debugging/          # Debugging techniques
```

### Doc Format
- **What:** 1-2 sentences explaining the concept
- **Why:** When to use it, why it matters
- **How:** Real code examples (from the project)
- **Gotchas:** Common mistakes
- **Related:** Links for further reading

---

## Shared Library (lib/core.js)

```javascript
// Parse YAML frontmatter from SKILL.md
extractFrontmatter(filePath) → { name, description, ... }

// Recursive SKILL.md discovery
findSkills(dir, maxDepth) → [{ name, path, frontmatter }]

// Resolve skill path with prefix handling
resolveSkillPath(skillName, dirs) → absolutePath

// Strip frontmatter, return content only
stripFrontmatter(content) → markdownBody
```

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| 16 skills total | 5 reference + 11 task. Enough coverage without bloat |
| Shell scripts for hooks | Portable, easy to debug, no build step |
| 3 agents only | code-reviewer, implementer, planner covers 90% of cases |
| .coding-friend/ignore (gitignore-style) | Familiar pattern, simple implementation |
| /cf-remember + /cf-learn | Unique value: project brain + human learning |
| context: fork for /cf-review | Isolate review from main context window |
| Layered config | Global `~/.coding-friend/config.json` + local per-project, local overrides |
| CLI (`cf`) for installation | Automates plugin setup, health checks, updates |
| /cf-init for setup | Re-runnable, detects previous setup, configures permissions |
