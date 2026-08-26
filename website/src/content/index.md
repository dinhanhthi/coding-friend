# Coding Friend

_A lean, opinionated toolkit that makes your AI coding agent work like a disciplined engineer._

Coding Friend adds skills, agents, and hooks to the agent you already use. You get plan → implement → review → commit, with project knowledge in `docs/` and learn notes in `~/.coding-friend/learn/`. One install covers Claude Code; pass `--agent` for Codex, omp, or Antigravity.

```text
┌─────┐   ┌──────────────┐   ┌────────────────────────┐   ┌───────────┐
│ you │ → │ /cf-* skills │ → │ agents                 │ → │ your repo │
└─────┘   └──────────────┘   │ explorer · planner     │   └───────────┘
                  ↓          │ implementer            │         ↓
          ┌──────────────┐   │ reviewer · writer      │
          │ hooks        │   └────────────────────────┘
          │ auto-approve │   ┌─────────────────────────────────────────┐
          │ security     │   │ docs/ (memory · plans · research)       │
          │ statusline   │   └─────────────────────────────────────────┘
          └──────────────┘                        ↓
                             ┌─────────────────────────────────────────┐
                             │ CF Memory (MCP) reads and writes docs/  │
                             └─────────────────────────────────────────┘
```

## Supported agents

Coding Friend installs on the host you already use.

| Host        | Support    | Notes                                                    |
| ----------- | ---------- | -------------------------------------------------------- |
| Claude Code | 100%       | Default.                                                 |
| omp         | 95%        | Beta. Skills come from the Claude plugin cache.          |
| Codex CLI   | 77%        | Beta. Invoke as `$cf-*`. Partial hooks and auto-approve. |
| Antigravity | 73%        | Beta. Requires agy >= 1.1.0. No memory auto-capture.     |
| Cursor      | 100% / 77% | Runs Claude Code / Codex underneath.                     |
| Grok CLI    | 100% / 77% | Same as Cursor.                                          |

% = share of the 11 host-agnostic features (skills, auto-invoked skills, agents, hooks, memory MCP, memory auto-capture, auto-approve, learn host/MCP, cross-agent review, custom guides, CLI lifecycle). Partial = ½.

Claude only: statusline, session save/restore (`/cf-session`), and task tracking. Other hosts ship their own equivalents, so they are not counted.

Install for your host:

| Host        | Command                         |
| ----------- | ------------------------------- |
| Claude Code | `cf install`                    |
| Codex CLI   | `cf install --agent codex`      |
| omp         | `cf install --agent omp`        |
| Antigravity | `cf install --agent agy`        |
| Cursor      | install for the underlying host |
| Grok CLI    | install for the underlying host |

## Install

You need Node 20+ and a supported host.

```bash
npm i -g coding-friend-cli
cf install            # Claude Code (default)  |  --agent codex | omp | agy
cf init               # per project: docs/, .coding-friend/config.json
cf update             # later: pull the newest plugin
```

Scope with `--user | --project | --local`. Host aliases: `--codex` / `--omp` / `--agy`.

Then type `/cf-help` inside your agent.

## Features

Workflows, memory, and hooks you opt into after install.

### Workflow

You plan, implement, review, commit, then ship. Bugs loop through `/cf-fix` and `cf-sys-debug`.

```text
┌─────────┐   ┌─────────────────┐   ┌───────────┐
│ /cf-plan│ → │ cf-tdd/implement│ → │ /cf-review│
└─────────┘   └─────────────────┘   └───────────┘
                     ↓                     ↓
              ┌─────────────┐       ┌───────────┐
              │ /cf-fix     │       │ /cf-commit│
              │      ↓      │       └───────────┘
              │ cf-sys-debug│              ↓
              │      ↓      │       ┌───────────┐
              │ /cf-fix     │       │ /cf-ship  │
              └─────────────┘       └───────────┘
                                           ↓
                            ┌──────────────────────────┐
                            │ cf-verification          │
                            │ /cf-remember → docs/     │
                            │ /cf-learn (global notes) │
                            └──────────────────────────┘
```

### Memory

Search falls through three local tiers: SQLite (FTS5 + vectors), then MiniSearch, then grep. Markdown in `docs/memory/` is the source of truth.

```text
┌─────────────────────────┐
│ SQLite (FTS5 + vectors) │
└─────────────────────────┘
             ↓
┌─────────────────────────┐
│ MiniSearch              │
└─────────────────────────┘
             ↓
┌─────────────────────────┐
│ grep                    │
└─────────────────────────┘
```

### Auto-approve

Claude classifies in three steps. Codex, agy, and omp use deterministic rules only.

```text
┌───────┐   ┌─────────────┐   ┌──────────────────────────────┐
│ rules │ → │ working-dir │ → │ LLM classifier (Claude only) │
└───────┘   └─────────────┘   └──────────────────────────────┘
```

### Security

Three layers: isolation, extraction, then alert. Fetched content is data, never instructions.

```text
┌────────────┐   ┌────────────┐   ┌───────┐
│ isolation  │ → │ extraction │ → │ alert │
└────────────┘   └────────────┘   └───────┘
```

### Learn & teach

Extract notes with `/cf-learn` or `/cf-teach`. Notes default to `~/.coding-friend/learn/`. Set `learn.outputDir` if you want a different folder. Host them with `cf learn host`, or share them with `cf mcp`.

```text
┌───────────┐   ┌──────────────────────────┐   ┌───────────────┐
│ /cf-learn │   │                          │   │ cf learn host │
│     │     │ → │ ~/.coding-friend/learn/  │ → │      │        │
│ /cf-teach │   │                          │   │ cf mcp        │
└───────────┘   └──────────────────────────┘   └───────────────┘
```

![Learn host](/cf-host.png)

### Research

Run `/cf-research` for web search with parallel subagents. Output lands in `docs/research/`.

```text
┌──────────────┐   ┌────────────────────┐   ┌────────────────┐
│ /cf-research │ → │ parallel subagents │ → │ docs/research/ │
└──────────────┘   └────────────────────┘   └────────────────┘
```

### Cross-agent review

Pass `--codex`, `--gemini`, `--cursor`, or `--grok` on `/cf-review` to run a second review in parallel, then merge. Or export with `/cf-review-out` and collect with `/cf-review-in`.

```text
┌─────────────────────────────────────────┐
│ /cf-review                              │
│   --codex|--gemini|--cursor|--grok      │
│   parallel, then merge                  │
└─────────────────────────────────────────┘
                  ↓
┌───────────────┐   ┌────────┐   ┌──────────────┐
│ /cf-review-out│ → │ any AI │ → │ /cf-review-in│
└───────────────┘   └────────┘   └──────────────┘
```

### Sessions & checkpoints

Claude only for `/cf-session`. `/cf-checkpoint` writes a note; `/cf-checkpoint-from` loads it in a new chat.

```text
┌─────────────┐
│ /cf-session │
└─────────────┘

┌─────────────────┐     ┌──────────────────────┐
│ /cf-checkpoint  │  →  │ /cf-checkpoint-from  │
└─────────────────┘     └──────────────────────┘
```

### Statusline

Claude only. Run `cf statusline` to install the renderer.

![Statusline](/statusline.png)

## Skills

Skills are slash commands (`/cf-*`) or auto-invoked when a matching situation appears.

### Plan & build

- `/cf-plan` — Brainstorm and write a phased implementation plan. Use when you want to build or implement something. Flags: `--auto`, `--fast`, `--hard`.
- `/cf-plan-resume` — Resume a saved plan from where execution last stopped. Use when you want to continue a plan under `docs/plans/`.
- `/cf-advise` — Structured interview, then a verdict-first recommendation with pitfalls and ranked alternatives. Use when you need to decide, not build. Advisory-only; never writes code.
- `/cf-design` — Scan existing UI patterns, design new UI, or modify UI so it stays consistent. Use when a component or page should match the rest of the project.
- `/cf-optimize` — Baseline, analyze, optimize, measure, compare. Use when something is slow or you want a measured performance change.

### Fix & debug

- `/cf-fix` — Quick bug-fix workflow: reproduce, state a hypothesis, then fix. Use when something is broken, throws, or fails a test.
- `cf-sys-debug` — Four-phase debugging: root cause, hypothesis tests, regression-guarded fix, bug doc. Auto-invoked for hard, recurring, or unclear bugs.
- `cf-tdd` — Direct implementation by default. Auto-invoked when production code is about to be written. Pass `--add-tests` for RED → GREEN → REFACTOR.
- `cf-verification` — Run tests and show evidence before claiming work is done. Auto-invoked after code-changing work.

### Review & ship

- `/cf-review` — Multi-layer code review in a separate subagent. Use when you want changes checked before merge.
- `/cf-review-out` — Write a self-contained review prompt for an external AI. Use when you want a second opinion you will paste elsewhere.
- `/cf-review-in` — Collect and act on that external review. Use after `/cf-review-out` when the result file is ready.
- `/cf-commit` — Conventional commit from the diff. Use when you want to save the current work.
- `/cf-ship` — Verify, commit, push, and open a PR. Use when a branch is ready. Supports `--dry-run`.

### Knowledge

- `/cf-ask` — Focused Q&A about the codebase, saved to `docs/memory`. Use when you need to know how something works.
- `/cf-scan` — Scan the project and bootstrap memory (architecture, conventions, stack). Use on a new repo or when you want to refresh project understanding.
- `/cf-remember` — Capture project knowledge for AI recall across sessions. Use when a decision, convention, or gotcha should persist.
- `/cf-learn` — Extract educational notes for you. Default output is `~/.coding-friend/learn/`. Use after a session that taught something non-trivial.
- `/cf-teach` — Conversational story of what happened and why. Use when you want a deep-dive, not a short note.
- `/cf-research` — In-depth research with web search, saved under `docs/research/`. Use before you build, not instead of planning.

### Context & session

- `/cf-session` — Save the current session to `docs/sessions/`. Claude only. Use when you will continue on another machine.
- `/cf-checkpoint` — Snapshot this conversation (decisions, breaking changes, next steps) to resume later. Use before you start a fresh chat.
- `/cf-checkpoint-from` — Load a saved checkpoint, then do what you ask next. Use to pick up that snapshot. Pass `--recap` for a summary.
- `/cf-warm` — Summarize git history after you were away. Use when you need to catch up on the project.
- `/cf-later-do` — Work through deferred items in `docs/later/`. Use when you want to clear that backlog.

### Help

- `/cf-help` — Answers questions about Coding Friend (skills, agents, setup). Slash command, and auto-invoked when you ask about the toolkit itself.

Example outputs:

`/cf-plan`

```text
Progress

| Status         | Phase             | Tasks   |
| -------------- | ----------------- | ------- |
| ✅ DONE        | Phase 1: Teardown | 3 tasks |
| 🔄 IN PROGRESS | Phase 4: Content  | 6 tasks |
| ⬜ TODO        | Phase 5: Merge    | 1 task  |

#### Phase 1 [sequential]
```

`/cf-review`

```text
🚨 Critical
- None.

⚠️ Important
- None.

💡 Suggestions
- None.

📋 Summary
No blocking issues found. You're clear to commit.
```

`/cf-commit`

```text
feat(cli): add agy host lifecycle commands

DONE — commit created.
```

`/cf-fix`

```text
> ✨ **CODING FRIEND** → /cf-fix activated

Root cause:   [what was wrong, file:line]
Fix:          [what changed, file:line]
Confirmed:    [evidence or test that proves the fix]
Tests:        [pass/fail count, regression test location]
Status: DONE
```

## Agents

Skills dispatch agents as subagents that run in their own context.

| Agent                | Model   | Does                                           | Dispatched by                                       |
| -------------------- | ------- | ---------------------------------------------- | --------------------------------------------------- |
| cf-explorer          | haiku   | Maps the repo and writes context files         | /cf-plan, /cf-fix, /cf-ask                          |
| cf-planner           | inherit | Compares approaches and breaks work into tasks | /cf-plan                                            |
| cf-implementer       | inherit | Writes the code (TDD with --add-tests)         | /cf-plan, /cf-fix, cf-tdd                           |
| cf-reviewer          | inherit | Orchestrates the five-specialist review        | /cf-review, /cf-ship                                |
| cf-reviewer-plan     | sonnet  | Checks the diff against the plan               | cf-reviewer                                         |
| cf-reviewer-security | sonnet  | Finds security issues in the diff              | cf-reviewer                                         |
| cf-reviewer-quality  | haiku   | Names, complexity, duplication, slop           | cf-reviewer                                         |
| cf-reviewer-tests    | haiku   | Coverage and missing tests                     | cf-reviewer                                         |
| cf-reviewer-rules    | haiku   | CLAUDE.md MUST/SHOULD/ALWAYS/NEVER             | cf-reviewer                                         |
| cf-reviewer-reducer  | haiku   | Deduplicates and ranks findings                | cf-reviewer                                         |
| cf-writer            | haiku   | Writes straightforward markdown                | /cf-learn, /cf-remember, /cf-scan, /cf-fix, /cf-ask |
| cf-writer-deep       | sonnet  | Writes deep technical docs                     | /cf-learn                                           |

Review fan-out:

```text
┌─────────────┐
│ cf-reviewer │
└──────┬──────┘
       │
       ├─→ cf-reviewer-plan
       ├─→ cf-reviewer-security
       ├─→ cf-reviewer-quality    (parallel)
       ├─→ cf-reviewer-tests
       └─→ cf-reviewer-rules
                 ↓
        cf-reviewer-reducer
                 ↓
              report
```

Plan execution:

```text
┌─────────┐    ┌────────────┐    ┌───────────┐    ┌───────────────┐
│ cf-plan │───→│ cf-explorer│───→│ cf-planner│───→│ implementer(s)│
└─────────┘    └────────────┘    └───────────┘    └───────────────┘
```

Implementer result (real format):

```text
What was implemented — added the agy install path in install.ts.
Tests run — direct mode — no new tests written.
Decisions — reuse the omp host branch; no new flag.
[CF-RESULT: success]
```

## Config

You have two config files. Global is `~/.coding-friend/config.json`. Project is `.coding-friend/config.json` — local overrides global at the same top-level keys.

```json
{
  "language": "en",
  "docsDir": "docs",
  "tdd": false,
  "autoApprove": false,
  "review": {
    "withCodex": false
  },
  "memory": {
    "autoCapture": false
  },
  "learn": {
    "outputDir": "~/.coding-friend/learn"
  }
}
```

Learn notes default to `~/.coding-friend/learn/` (`learn.outputDir` is configurable). `docsDir` is for plans, memory, and research — not the default learn output.

| Key                     | Description                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `language`              | Language for docs (plans, memory, research, ask). Default: `en`.                                                       |
| `docsDir`               | Base docs directory relative to project root (plans, memory, research). Default: `docs`. Not the default learn output. |
| `autoApprove`           | Enable the auto-approve hook. Default: `false`.                                                                        |
| `privacyBlock`          | Privacy-block hook (deny `.env`, keys, credentials). Default: `true`.                                                  |
| `scoutBlock`            | Scout-block hook (deny ignored dirs). Default: `true`.                                                                 |
| `autoApproveAllowExtra` | Bash command prefixes to auto-approve (merged across global + local).                                                  |
| `autoApproveIgnore`     | Bash command prefixes to always require user review.                                                                   |
| `disableGUIPlan`        | Disable the human overview doc `/cf-plan` generates. Default: `true`.                                                  |
| `guiPlanFormat`         | Format for the GUI plan: `html` or `md`. Default: `html`.                                                              |
| `learn`                 | Learn settings: `language`, `outputDir`, `categories`. Default `outputDir`: `~/.coding-friend/learn`.                  |
| `review`                | Review settings. Nested object; `withCodex` runs a Codex second opinion.                                               |
| `tdd`                   | Boolean. Enable TDD (RED→GREEN→REFACTOR) by default.                                                                   |
| `memory`                | Object. MemoryConfig for search tier, embeddings, and capture.                                                         |

`memory` (MemoryConfig) keys:

- `tier` — `"auto"`, `"full"`, `"lite"`, or `"markdown"`.
- `embedding` — object with `provider` (`"transformers"` or `"ollama"`), `model`, and `ollamaUrl`.
- `autoCapture` — boolean. Save session context on PreCompact.
- `autoStart` — boolean. Start the memory daemon when the MCP server connects.

Extend a built-in skill with `.coding-friend/skills/<name>-custom/SKILL.md`, and list gitignore-style paths in `.coding-friend/ignore` so scout-block skips them.

## Changelog

Releases and changelogs live on GitHub: [github.com/dinhanhthi/coding-friend/releases](https://github.com/dinhanhthi/coding-friend/releases).

`cf update` upgrades the CLI and plugin.
