# coding-friend Architecture

## Overview

coding-friend is a lean toolkit for Claude Code that enforces disciplined engineering workflows. It solves two problems specific to vibe coding:

1. **Project knowledge loss** — After many sessions, no one remembers logic/conventions/decisions
2. **Human learning gap** — AI writes code, human approves without learning anything

---

## Directory Structure

```
coding-friend/
├── marketplace.json             # Marketplace manifest (points to plugin/)
├── CLAUDE.md                    # Claude Code instruction (~3000 tokens)
├── README.md                    # Installation guide
├── .coding-friend/              # User config
│   ├── config.json              # Settings (optional)
│   └── ignore                   # Agent ignore patterns
│
├── plugin/                      # ← Only this gets cached by Claude Code
│   ├── .claude-plugin/
│   │   └── plugin.json          # Plugin manifest
│   │
│   ├── hooks/
│   │   ├── hooks.json               # Plugin hooks manifest
│   │   ├── session-init.sh          # SessionStart: bootstrap context
│   │   ├── rules-reminder.sh        # UserPromptSubmit: inject rules
│   │   ├── privacy-block.sh         # PreToolUse: block sensitive files
│   │   ├── scout-block.cjs           # PreToolUse: respect .coding-friend/ignore
│   │   ├── statusline.sh            # Statusline: context tracking
│   │   ├── session-log.sh           # Stop: append turn log for memory-capture
│   │   ├── task-tracker.sh          # TaskCreated/Completed: track task progress
│   │   └── agent-tracker.sh         # SubagentStart/Stop: track active agent
│   │
│   ├── context/
│   │   └── bootstrap.md             # Bootstrap context (loaded by session-init)
│   │
│   ├── skills/
│   │   ├── cf-help/                 # /cf-help — answer questions about Coding Friend
│   │   ├── cf-plan/                 # /cf-plan — brainstorm + write plans
│   │   ├── cf-review/               # /cf-review — dispatch code review
│   │   ├── cf-commit/               # /cf-commit — smart commit
│   │   ├── cf-ship/                 # /cf-ship — verify + commit + push + PR
│   │   ├── cf-fix/                  # /cf-fix — quick bug fix
│   │   ├── cf-ask/                  # /cf-ask — quick Q&A → docs/memory/
│   │   ├── cf-optimize/             # /cf-optimize — structured optimization (also auto-invoked)
│   │   ├── cf-remember/             # /cf-remember — project knowledge → docs/memory/
│   │   ├── cf-learn/                # /cf-learn — human learning (also auto-invoked)
│   │   ├── cf-research/             # /cf-research — web research → docs/research/
│   │   ├── cf-tdd/                  # TDD workflow (auto-invoked)
│   │   ├── cf-sys-debug/            # 4-phase debugging (auto-invoked)
│   │   └── cf-verification/         # Verify before claiming done
│   │
│   └── agents/
│       ├── cf-reviewer.md           # Code review subagent (5-layer methodology)
│       ├── cf-explorer.md           # Read-only codebase explorer
│       ├── cf-implementer.md        # TDD implementation subagent
│       ├── cf-planner.md            # Exploration + task breakdown
│       ├── cf-writer.md             # Lightweight doc writer
│       └── cf-writer-deep.md        # Deep reasoning doc writer
│
├── cli/                         # CLI tool (published as coding-friend-cli)
│   ├── src/                     # CLI source code
│   └── lib/
│       ├── learn-host/          # Next.js static site for learning docs
│       │   ├── src/app/         # App Router pages
│       │   ├── src/components/  # UI components
│       │   └── src/lib/         # Build-time doc loading
│       └── learn-mcp/           # MCP server for LLM integration
│           ├── src/tools/       # 9 MCP tools (read/write/track)
│           └── src/lib/         # Shared docs/knowledge logic
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

## Skills Architecture (15 skills)

### Reference Skills (3) — Auto-loaded when relevant

| Skill             | Trigger              | Core Concept                                |
| ----------------- | -------------------- | ------------------------------------------- |
| `cf-tdd`          | Writing new code     | Iron law: no code without failing test      |
| `cf-sys-debug`    | Debugging bugs       | 4-phase: investigate → analyze → test → fix |
| `cf-verification` | Before claiming done | Gate: no claims without fresh evidence      |

Note: `cf-learn`, `cf-remember`, `cf-review`, `cf-optimize`, `cf-plan`, and `cf-fix` are also auto-invoked when relevant context is detected.

### Task Skills (12) — User-triggered via `/slash`

| Skill         | Command                 | Key Feature                                                                |
| ------------- | ----------------------- | -------------------------------------------------------------------------- |
| `cf-help`     | `/cf-help [question]`   | Answer questions about Coding Friend (also auto-invoked)                   |
| `cf-plan`     | `/cf-plan [task]`       | Brainstorm + write implementation plan                                     |
| `cf-review`   | `/cf-review [target]`   | Fork context → cf-reviewer agent (also auto-invoked)                       |
| `cf-commit`   | `/cf-commit [hint]`     | Analyze diff → conventional commit                                         |
| `cf-ship`     | `/cf-ship [hint]`       | Verify + commit + push + PR                                                |
| `cf-fix`      | `/cf-fix [bug]`         | Quick bug fix, escalates to cf-sys-debug after 3 failures                  |
| `cf-ask`      | `/cf-ask [question]`    | Quick Q&A about codebase → docs/memory/                                    |
| `cf-optimize` | `/cf-optimize [target]` | Structured optimization with before/after measurement (also auto-invoked)  |
| `cf-remember` | `/cf-remember [topic]`  | Extract project knowledge for AI recall → docs/memory/ (also auto-invoked) |
| `cf-learn`    | `/cf-learn [topic]`     | Extract learnings for human learning (configurable output, language)       |
| `cf-research` | `/cf-research [topic]`  | In-depth research with web search → docs/research/                         |
| `cf-session`  | `/cf-session [label]`   | Save session to docs/sessions/ for cross-machine resume                    |

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
# Forked skill (runs in subagent, also auto-invoked)
---
name: cf-review
description: Dispatch code review to a subagent. Use when the user wants code reviewed...
user-invocable: true
context: fork
agent: cf-reviewer
---
```

---

## Hooks System (10 hooks)

| Hook                | Event                      | Purpose                                                                          |
| ------------------- | -------------------------- | -------------------------------------------------------------------------------- |
| `session-init.sh`   | SessionStart               | Bootstrap context: load bootstrap.md, detect project, load .coding-friend/ignore |
| `rules-reminder.sh` | UserPromptSubmit           | Inject core rules every 4th prompt (reduced from every prompt)                   |
| `privacy-block.sh`  | PreToolUse                 | Block .env, credentials, keys. Exit 2 = block                                    |
| `scout-block.cjs`   | PreToolUse                 | Respect .coding-friend/ignore patterns. Exit 2 = block                           |
| `auto-approve.cjs`  | PreToolUse                 | Auto-approve safe tool calls, block destructive ones (opt-in)                    |
| `statusline.sh`     | Statusline                 | Show context usage, git branch, session info, task/agent progress                |
| `session-log.sh`    | Stop                       | Append turn log to JSONL file for memory-capture (async: true)                   |
| `task-tracker.sh`   | TaskCreated/TaskCompleted  | Track task progress for statusline (async: true)                                 |
| `agent-tracker.sh`  | SubagentStart/SubagentStop | Track active agent for statusline (async: true)                                  |
| `memory-capture.sh` | PreCompact                 | Auto-capture session memory before context compaction                            |

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

## Agents (6)

| Agent            | Model   | Purpose                                                         |
| ---------------- | ------- | --------------------------------------------------------------- |
| `cf-reviewer`    | opus    | 5-layer review: project rules, plan, quality, security, testing |
| `cf-explorer`    | haiku   | Read-only codebase exploration and context gathering            |
| `cf-implementer` | opus    | TDD implementation: write test → implement → verify             |
| `cf-planner`     | inherit | Codebase exploration + task decomposition                       |
| `cf-writer`      | haiku   | Lightweight document writing and markdown generation            |
| `cf-writer-deep` | sonnet  | Deep reasoning for nuanced technical documentation              |

---

## Claude Code Plugin

- `marketplace.json` — marketplace manifest (at repo root, points `source` to `./plugin`)
- `plugin/.claude-plugin/plugin.json` — plugin manifest
- `plugin/hooks/hooks.json` — plugin hooks
- `plugin/skills/` — auto-discovered by Claude Code
- `plugin/agents/` — subagent definitions

Only the `plugin/` directory is cached by Claude Code — `cli/`, `docs/`, `website/` are excluded.

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

| Setting                | Default           | Description                                                                        |
| ---------------------- | ----------------- | ---------------------------------------------------------------------------------- |
| `language` (top-level) | `en`              | Writing language for all skills (`en`, `vi`, etc.)                                 |
| `learn.outputDir`      | `{docsDir}/learn` | Where to store (relative, absolute, or `~/`)                                       |
| `learn.categories`     | 5 defaults        | Customizable subdirectories                                                        |
| `learn.autoCommit`     | `false`           | Auto git-commit (for separate repos)                                               |
| `learn.readmeIndex`    | `false`           | Index mode: `false` (none), `true` (single README), `"per-category"` (distributed) |

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

| Decision                                | Rationale                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 15 skills total                         | 3 reference + 12 task (host/mcp/statusline/update via CLI only). Enough coverage without bloat |
| Shell scripts for hooks                 | Portable, easy to debug, no build step                                                         |
| 6 agents                                | cf-reviewer, cf-implementer, cf-planner, cf-explorer, cf-writer, cf-writer-deep                |
| .coding-friend/ignore (gitignore-style) | Familiar pattern, simple implementation                                                        |
| /cf-remember + /cf-learn                | Unique value: project brain + human learning                                                   |
| context: fork for /cf-review            | Isolate review from main context window                                                        |
| Layered config                          | Global `~/.coding-friend/config.json` + local per-project, local overrides                     |
| CLI (`cf`) for installation             | Automates plugin setup, health checks, updates                                                 |
| `cf init` for setup                     | Re-runnable, detects previous setup, configures permissions                                    |

---

## State Machine

The project operates as 4 concurrent state machine layers.

### 1. Session Lifecycle

```
┌─────────────┐
│   IDLE       │  (Claude Code chưa chạy)
└──────┬───────┘
       │ claude session start
       ▼
┌─────────────────────┐
│  SESSION_INIT        │  SessionStart hook fires
│  ┌─────────────────┐ │
│  │ session-init.sh │ │
│  │ • Load bootstrap│ │
│  │ • Detect project│ │
│  │ • Load guides   │ │
│  │ • Inject context│ │
│  └─────────────────┘ │
└──────┬───────────────┘
       │ context injected OK
       ▼
┌─────────────────────┐
│  SESSION_ACTIVE      │◄────────────────────────────────┐
│                      │                                  │
│  Hooks active:       │   UserPromptSubmit               │
│  • rules-reminder    │◄── (every 4th prompt)            │
│  • privacy-block     │◄── PreToolUse (file access)      │
│  • scout-block       │◄── PreToolUse (file access)      │
│  • auto-approve      │◄── PreToolUse (classification)   │
│  • session-log       │◄── Stop (async turn logging)     │
│  • task-tracker      │◄── TaskCreated/Completed (async) │
│  • agent-tracker     │◄── SubagentStart/Stop (async)    │
│                      │                                  │
│  User interacts...   │──────────────────────────────────┘
└──────┬───────────────┘
       │ user stops / session ends
       ▼
┌──────────────────┐
│  SESSION_END     │
│  memory-capture  │◄── PreCompact (auto-capture)
│  (session done)  │
└──────────────────┘
```

### 2. Coding Workflow (within SESSION_ACTIVE)

```
                    ┌──────────────────┐
                    │  WAITING_INPUT   │◄─────────────────────────────┐
                    │  (user prompt)   │                               │
                    └────────┬─────────┘                               │
                             │                                         │
              ┌──────────────┼──────────────┬─────────────┐           │
              ▼              ▼              ▼             ▼           │
     ┌────────────┐  ┌────────────┐  ┌──────────┐  ┌──────────┐    │
     │ /cf-plan   │  │ CODE_TASK  │  │ /cf-fix  │  │ /cf-ask  │    │
     │            │  │            │  │          │  │          │    │
     │ Brainstorm │  │ New code   │  │ Quick    │  │ Q&A →    │    │
     │ → plan doc │  │ requested  │  │ bug fix  │  │ memory/  │    │
     └──────┬─────┘  └─────┬──────┘  └────┬─────┘  └────┬─────┘    │
            │               │              │              │          │
            │               ▼              │              │          │
            │     ┌──────────────────┐     │              │          │
            │     │  TDD_RED         │     │              │          │
            │     │  cf-tdd auto     │     │              │          │
            │     │  Write failing   │     │              │          │
            │     │  test first      │     │              │          │
            │     └────────┬─────────┘     │              │          │
            │              │               │              │          │
            │              ▼               │              │          │
            │     ┌──────────────────┐     │              │          │
            │     │  TDD_GREEN       │     │              │          │
            │     │  Implement code  │     │              │          │
            │     │  to pass test    │     │              │          │
            │     └────────┬─────────┘     │              │          │
            │              │               │              │          │
            │              ▼               │              │          │
            │     ┌──────────────────┐     │              │          │
            │     │  TDD_REFACTOR    │     │              │          │
            │     │  Clean up code   │     │              │          │
            │     │  Tests still pass│     │              │          │
            │     └────────┬─────────┘     │              │          │
            │              │               │              │          │
            │              ▼               ▼              │          │
            │     ┌──────────────────────────┐            │          │
            │     │  VERIFICATION            │            │          │
            │     │  cf-verification auto    │            │          │
            │     │  • Run tests             │            │          │
            │     │  • Show output           │            │          │
            │     │  • Prove completion      │            │          │
            │     └────────┬─────────────────┘            │          │
            │              │                              │          │
            │         PASS │         FAIL                 │          │
            │              │    ┌─────────────────┐       │          │
            │              │    │  DEBUG           │       │          │
            │              │    │  cf-sys-debug    │       │          │
            │              │    │  • Investigate   │       │          │
            │              │    │  • Analyze       │       │          │
            │              │    │  • Test fix      │       │          │
            │              │    │  • Apply fix     │       │          │
            │              │    └───────┬──────────┘       │          │
            │              │           │ (back to TDD)    │          │
            │              │           └──→ TDD_RED       │          │
            │              ▼                              │          │
            │     ┌──────────────────┐                    │          │
            │     │  CODE_COMPLETE   │                    │          │
            │     │  Ready for       │                    │          │
            │     │  review/commit   │                    │          │
            │     └────────┬─────────┘                    │          │
            │              │                              │          │
            ▼              ▼                              │          │
    ┌───────────────────────────┐                         │          │
    │     REVIEW/COMMIT ZONE    │                         │          │
    │                           │                         │          │
    │  /cf-review ──→ cf-reviewer agent (fork)                │          │
    │                 5-layer review                       │          │
    │                                                     │          │
    │  /cf-commit ──→ • Scan for secrets                  │          │
    │                 • Analyze diff                       │          │
    │                 • Generate conventional commit       │          │
    │                 • Run tests (if configured)          │          │
    │                                                     │          │
    │  /cf-ship  ──→ verify + commit + push + PR          │          │
    └───────────────────────┬───────────────┘             │          │
                            │                             │          │
                            ▼                             ▼          │
                   ┌────────────────────────────────────────┐        │
                   │  KNOWLEDGE_EXTRACTION                   │        │
                   │                                        │        │
                   │  /cf-learn  ──→ assess complexity       │        │
                   │                 ├─ simple → cf-writer      │        │
                   │                 └─ complex → cf-writer-deep│        │
                   │                 → docs/learn/{cat}/     │        │
                   │                                        │        │
                   │  /cf-remember ──→ cf-writer agent       │        │
                   │                 → docs/memory/          │        │
                   │                                        │        │
                   │  /cf-research ──→ parallel subagents    │        │
                   │                 → docs/research/        │        │
                   └────────────────────┬───────────────────┘        │
                                        │                            │
                                        └────────────────────────────┘
```

### 3. Knowledge Pipeline (/cf-learn detail)

```
┌──────────────────┐
│  TRIGGER          │
│  User: /cf-learn  │
│  OR auto-invoked  │
│  (substantial     │
│   knowledge found)│
└────────┬──────────┘
         ▼
┌──────────────────┐
│  CONFIG_LOAD      │
│  Read config:     │
│  • outputDir      │
│  • categories     │
│  • language       │
│  • autoCommit     │
│  • readmeIndex    │
└────────┬──────────┘
         ▼
┌──────────────────┐
│  IDENTIFY         │
│  Scan conversation│
│  for knowledge    │
│  points           │
└────────┬──────────┘
         ▼
┌──────────────────┐
│  CATEGORIZE       │
│  Map each point   │
│  → concepts/      │     ┌────────────────────┐
│  → patterns/      │     │  Categories:       │
│  → languages/     │────→│  concepts          │
│  → tools/         │     │  patterns          │
│  → debugging/     │     │  languages         │
│  → (custom)       │     │  tools             │
└────────┬──────────┘     │  debugging         │
         ▼               └────────────────────┘
┌──────────────────┐
│  ASSESS_COMPLEXITY│
│  Simple content?  │────── YES ──→ cf-writer agent (haiku) ──┐
│  Nuanced/deep?    │────── YES ──→ cf-writer-deep (sonnet) ──┤
└───────────────────┘                                      │
                                                           ▼
                                                  ┌────────────────┐
                                                  │  WRITE_SPEC    │
                                                  │  Build spec:   │
                                                  │  • file path   │
                                                  │  • content     │
                                                  │  • frontmatter │
                                                  │  • append mode │
                                                  └───────┬────────┘
                                                          ▼
                                                  ┌────────────────┐
                                                  │  AGENT_EXECUTE │
                                                  │  Create/append │
                                                  │  .md file      │
                                                  └───────┬────────┘
                                                          │
                                              ┌───────────┼────────────┐
                                              ▼           ▼            ▼
                                     ┌──────────┐ ┌────────────┐ ┌─────────┐
                                     │ README   │ │ AUTO_COMMIT│ │  DONE   │
                                     │ INDEX    │ │ (if config)│ │         │
                                     │ update   │ └──────┬─────┘ │         │
                                     └────┬─────┘        │       │         │
                                          └───────┬──────┘       │         │
                                                  ▼              │         │
                                         ┌────────────────┐      │         │
                                         │ CONSUMABLE     │◄─────┘         │
                                         │                │                │
                                         │ cf host ──→ website (3333)     │
                                         │ cf mcp  ──→ MCP server        │
                                         │ direct  ──→ .md files         │
                                         └────────────────┘                │
```

### 4. Security Guards (parallel on every file tool use)

```
                    ┌──────────────────────────┐
                    │  TOOL_USE_REQUESTED       │
                    │  (Read/Write/Edit/Glob/   │
                    │   Grep)                   │
                    └────────────┬──────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                         ▼
           ┌───────────────┐         ┌───────────────┐
           │ PRIVACY_CHECK │         │ SCOUT_CHECK   │
           │ privacy-block │         │ scout-block   │
           │               │         │               │
           │ .env? .pem?   │         │ node_modules? │
           │ credentials?  │         │ dist? .git?   │
           │ ssh keys?     │         │ ignore rules? │
           └───┬───────┬───┘         └──┬────────┬───┘
               │       │                │        │
            PASS    BLOCK(2)         PASS     BLOCK(2)
               │       │                │        │
               │       ▼                │        ▼
               │  ┌─────────┐           │   ┌─────────┐
               │  │ DENIED  │           │   │ DENIED  │
               │  │ Tool    │           │   │ Tool    │
               │  │ blocked │           │   │ blocked │
               │  └─────────┘           │   └─────────┘
               │                        │
               └────────┬───────────────┘
                        ▼
               ┌──────────────────┐
               │  TOOL_ALLOWED    │
               │  Execute tool    │
               └────────┬─────────┘
                        │
                        ▼
               ┌──────────────────┐
               │  CONTEXT_TRACK   │  (async)
               │  Log file path   │
               │  to /tmp/cf-*    │
               └──────────────────┘
```

### State Summary

| Layer     | States                                                        | Triggers            |
| --------- | ------------------------------------------------------------- | ------------------- |
| Session   | IDLE → INIT → ACTIVE → COMPACT → END                          | Session start/stop  |
| Coding    | WAITING → TDD (RED/GREEN/REFACTOR) → VERIFY → REVIEW → COMMIT | User commands       |
| Debug     | INVESTIGATE → ANALYZE → TEST → FIX → back to TDD              | Test failures       |
| Knowledge | TRIGGER → CONFIG → IDENTIFY → CATEGORIZE → WRITE → CONSUME    | /cf-learn, auto     |
| Security  | PRIVACY_CHECK + SCOUT_CHECK → ALLOW/BLOCK                     | Every file tool use |
