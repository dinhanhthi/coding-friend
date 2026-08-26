# Coding Friend or `CF`

_A lean, opinionated toolkit that makes your AI coding agent work like a disciplined engineer._

Coding Friend adds skills, agents, and hooks to the tools you already use. You get plan → implement → review → commit, with project knowledge in `docs/` and learning notes in `~/.coding-friend/learn/`. A memory system runs underneath, along with useful hooks and mechanisms to protect your privacy and security.

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

> 🚫 **Without CF**: You can only rely on the harness and default settings of the tool you’re using, or sometimes no harness at all. Even small tool changes can affect your usual workflow without you noticing..
>
> ✅ **With CF**: Besides the harness for the tool you’re using, CF suggests best-practice standards for daily workflows—from planning and code reviews to bug fixes, research, and optimization. CF also includes a memory system that helps agents avoid spending too many tokens on topics they’ve worked on before. You can also build a learning hub for readers as you work with CF; the system will help summarize everything and turn it into a polished website.

## 🤝 Supported Tools

Coding Friend installs on the host you already use.

| Host                                                  | Support | Command                    | Notes                                                    |
| ----------------------------------------------------- | ------- | -------------------------- | -------------------------------------------------------- |
| [Claude Code](https://claude.com/product/claude-code) | 100%    | `cf install`               | Default.                                                 |
| [oh-my-pi](https://github.com/can1357/oh-my-pi)       | 95%     | `cf install --agent omp`   | Beta. Skills come from the Claude plugin cache.          |
| [Codex](https://openai.com/codex/)                    | 77%     | `cf install --agent codex` | Beta. Invoke as `$cf-*`. Partial hooks and auto-approve. |
| [Antigravity](https://antigravity.google/)            | 73%     | `cf install --agent agy`   | Beta. Requires agy >= 1.1.0. No memory auto-capture.     |
| [Cursor](https://cursor.com/)                         | 100%    | comes with Claude          | Runs Claude Code / Codex underneath.                     |
| [Grok Build](https://x.ai/build)                      | 100%    | comes with Claude          | Same as Cursor.                                          |

% = share of the 11 host-agnostic features (skills, auto-invoked skills, agents, hooks, memory MCP, memory auto-capture, auto-approve, learn host/MCP, cross-agent review, custom guides, CLI lifecycle). Partial = ½.

**Claude only**: statusline, session save/restore (`/cf-session`), and task tracking. Other hosts ship their own equivalents, so they are not counted.

## 📦 Install

You need Node 20+ and a supported host.

```bash
npm i -g coding-friend-cli
cf install            # Claude Code (default)  |  --agent codex | omp | agy
cf init               # per project: docs/, .coding-friend/config.json
cf update             # later: pull the newest plugin

# Need help?
cf help

# Get Started in any project
cf init
```

Scope with `--user | --project | --local`. Host aliases: `--codex` / `--omp` / `--agy`. Then use `/cf-help` inside your agent to ask anything about CF.

After `cf init` or working with CF, a folder `docs/` is created inside your project with nested folders for plans, memory, research, reviews,... and more.

## ✨ Features

### 🔁 Workflow

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

Simple to remember for a daily workflow (read more in [Skills](#skills)):

- Plan with `/cf-plan` (and then resume at anytime with `/cf-plan-resume`) or just need an advice with `/cf-advise` (no code writing);
- Fix bugs with `/cf-fix`;
- Let something later do with `/cf-later-do` or create a checkpoint and resume with `/cf-checkpoint` and `/cf-checkpoint-from`;
- Review code with `/cf-review` then commit with `/cf-commit`;
- Ask about codebase with `/cf-ask` or scan the project with `/cf-scan`;
- Research about some topics with `/cf-research`;
- Learn what you did with `/cf-learn` or ask LLM to teach you with `/cf-teach` and then host the learning notes with `cf learn host`;
- Ship with `/cf-ship`;
- Optimize codes with `/cf-optimize` and more.
- To quickly remind after a long vacation, use `/cf-warm`.

Or you can add your additional custom guide for any CF builtin skills with `cf guide create cf-<skill-name>`.

### 🧠 Memory System

Every AI session starts from scratch — repeating mistakes, forgetting decisions. CF Memory gives your AI persistent, searchable memory across sessions with 3-tier graceful degradation. The markdown files in `docs/memory/` are the source of truth.

You can use CF Memory with other LLM services via its MCP server, just run `cf mcp` to see.

To configure in `config.json`, run `cf config` and follow the instructions.

```text
                       ┌──────────────────┐
                       │ Claude Code      │
                       │ Session          │
                       └────────┬─────────┘
                                │
                       ┌────────▼─────────┐
                       │ MCP Server       │
                       │ stdio            │
                       └───┬────┬────┬────┘
                           │    │    │
                  direct   │    │    │   direct
          ┌────────────────┘    │    └────────────────┐
          │                     │ HTTP/UDS            │
┌─────────▼──────────┐  ┌───────▼──────────┐  ┌───────▼──────────┐
│ TIER 1  SQLite     │  │ Daemon           │  │ TIER 3  Grep     │
│ FTS5 + vectors     │  │ Hono + UDS       │  │ file scan        │
└───┬───────────┬────┘  └──┬────┬─────┬────┘  └────┬──────────┬──┘
    │           │ fallback │    │     │ fallback   │          │
    │           └──────────┘    │     └────────────┘          │
    │                 watch     │                             │
    │                  ┌────────▼─────────┐                   │
    │                  │ TIER 2           │                   │
    │                  │ MiniSearch       │                   │
    │                  │ BM25 + fuzzy     │                   │
    │                  └────────┬─────────┘                   │
    │                           │                             │
    └───────────────────────┐   │   ┌─────────────────────────┘
                            │   │   │
                     ┌──────▼───▼───▼──────┐
                     │ Markdown Files      │
                     │ docs/memory/*.md    │
                     └─────────────────────┘
```

### ✅ Auto-approve

Smart permission gate that auto-approves safe tool calls, working-dir edits, and uses an LLM classifier for everything else.

```text
┌──────────────┐   ┌─────────────┐   ┌──────────────────────────────┐
│ Rule-Based   │ → │ Working-Dir │ → │ LLM Classifier (Claude only) │
└──────────────┘   └─────────────┘   └──────────────────────────────┘
```

- **Rule-Based Gate**: Instant pattern matching — read-only tools auto-approved, destructive commands blocked.
- **Working-Dir Edits**: File edits (Write/Edit) inside your project directory are auto-approved.
- **LLM Classifier**: A LLM that is used to classify the action into a safe or unsafe category. This is only available for Claude.

> **Not 100% safe**: You can still get unsafe actions if you use the wrong command or the LLM classifier makes a mistake.

Run `cf config` to configure the auto-approve hook.

### 🛡️ Security

Layered prompt injection defense to protect your workflow. Three layers: isolation, extraction, then alert. Fetched content is data, never instructions.

```text
┌────────────┐   ┌────────────┐   ┌───────┐
│ isolation  │ → │ extraction │ → │ alert │
└────────────┘   └────────────┘   └───────┘
```

### 📚 Learn & teach

Extract notes with `/cf-learn` or `/cf-teach`. Notes default to `~/.coding-friend/learn/`. Set `learn.outputDir` if you want a different folder. Host them with `cf learn host`, or share them with `cf mcp`.

```text
┌───────────┐   ┌──────────────────────────┐   ┌───────────────┐
│ /cf-learn │   │                          │   │ cf learn host │
│     │     │ → │ ~/.coding-friend/learn/  │ → │      │        │
│ /cf-teach │   │                          │   │ cf mcp        │
└───────────┘   └──────────────────────────┘   └───────────────┘
```

Run `cf learn host` and you will get a website like this:

![Learn host](/cf-host.png)

### 🔍 Research

Run `/cf-research` for web search with parallel subagents. Output lands in `docs/research/`.

```text
┌──────────────┐   ┌────────────────────┐   ┌────────────────┐
│ /cf-research │ → │ parallel subagents │ → │ docs/research/ │
└──────────────┘   └────────────────────┘   └────────────────┘
```

### 👀 Cross-agent review

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

### 💾 Sessions & checkpoints

Claude only for `/cf-session`. `/cf-checkpoint` writes a note; `/cf-checkpoint-from` loads it in a new chat.

```text
┌─────────────┐
│ /cf-session │
└─────────────┘

┌─────────────────┐     ┌──────────────────────┐
│ /cf-checkpoint  │  →  │ /cf-checkpoint-from  │
└─────────────────┘     └──────────────────────┘
```

### 📟 Statusline

Claude only. Run `cf statusline` to install the renderer.

![Statusline](/statusline.png)

## 🛠️ Skills

Skills are slash commands (`/cf-*`) or auto-invoked when a matching situation appears.

### 🗺️ Plan & build

- `/cf-plan` — Brainstorm and write a phased implementation plan. Use when you want to build or implement something. Flags: `--auto`, `--fast`, `--hard`.
- `/cf-plan-resume` — Resume a saved plan from where execution last stopped. Use when you want to continue a plan under `docs/plans/`.
- `/cf-advise` — Structured interview, then a verdict-first recommendation with pitfalls and ranked alternatives. Use when you need to decide, not build. Advisory-only; never writes code.
- `/cf-design` — Scan existing UI patterns, design new UI, or modify UI so it stays consistent. Use when a component or page should match the rest of the project.
- `/cf-optimize` — Baseline, analyze, optimize, measure, compare. Use when something is slow or you want a measured performance change.

### 🐛 Fix & debug

- `/cf-fix` — Quick bug-fix workflow: reproduce, state a hypothesis, then fix. Use when something is broken, throws, or fails a test.
- `cf-sys-debug` — Four-phase debugging: root cause, hypothesis tests, regression-guarded fix, bug doc. Auto-invoked for hard, recurring, or unclear bugs.
- `cf-tdd` — Direct implementation by default. Auto-invoked when production code is about to be written. Pass `--add-tests` for RED → GREEN → REFACTOR.
- `cf-verification` — Run tests and show evidence before claiming work is done. Auto-invoked after code-changing work.

### 🚀 Review & ship

- `/cf-review` — Multi-layer code review in a separate subagent. Use when you want changes checked before merge.
- `/cf-review-out` — Write a self-contained review prompt for an external AI. Use when you want a second opinion you will paste elsewhere.
- `/cf-review-in` — Collect and act on that external review. Use after `/cf-review-out` when the result file is ready.
- `/cf-commit` — Conventional commit from the diff. Use when you want to save the current work.
- `/cf-ship` — Verify, commit, push, and open a PR. Use when a branch is ready. Supports `--dry-run`.

### 💡 Knowledge

- `/cf-ask` — Focused Q&A about the codebase, saved to `docs/memory`. Use when you need to know how something works.
- `/cf-scan` — Scan the project and bootstrap memory (architecture, conventions, stack). Use on a new repo or when you want to refresh project understanding.
- `/cf-remember` — Capture project knowledge for AI recall across sessions. Use when a decision, convention, or gotcha should persist.
- `/cf-learn` — Extract educational notes for you. Default output is `~/.coding-friend/learn/`. Use after a session that taught something non-trivial.
- `/cf-teach` — Conversational story of what happened and why. Use when you want a deep-dive, not a short note.
- `/cf-research` — In-depth research with web search, saved under `docs/research/`. Use before you build, not instead of planning.

### 📌 Context & session

- `/cf-session` — Save the current session to `docs/sessions/`. Claude only. Use when you will continue on another machine.
- `/cf-checkpoint` — Snapshot this conversation (decisions, breaking changes, next steps) to resume later. Use before you start a fresh chat.
- `/cf-checkpoint-from` — Load a saved checkpoint, then do what you ask next. Use to pick up that snapshot. Pass `--recap` for a summary.
- `/cf-warm` — Summarize git history after you were away. Use when you need to catch up on the project.
- `/cf-later-do` — Work through deferred items in `docs/later/`. Use when you want to clear that backlog.

### ❓ Help

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

## 🧭 Agents

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

## ⚙️ Config

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
