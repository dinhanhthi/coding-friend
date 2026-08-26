# Coding Friend or `CF`

_A lean, opinionated toolkit that makes your AI coding agent work like a disciplined engineer._

> 💡 If you have problems with CF, use `/cf-help` to get help or ask in the [GitHub Discussions](https://github.com/dinhanhthi/coding-friend/discussions).

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
cf install               # Claude Code (default)
cf install --agent codex # or 'omp', 'agy'

cf init                  # per project: docs/, .coding-friend/config.json
cf update                # later: pull the newest plugin

# Need help?
cf help

# Get Started in any project
cf init
```

Scope with `--user | --project | --local`. Host aliases: `--codex` / `--omp` / `--agy`. Then use `/cf-help` inside your agent to ask anything about CF.

After `cf init` or working with CF, a folder `docs/` is created inside your project with nested folders for plans, memory, research, reviews,... and more.

### Manual install

```bash
plugin marketplace add dinhanhthi/coding-friend
plugin install coding-friend@coding-friend-marketplace
```

Or ask your agent to install it.

## ✨ Features

Skills are slash commands (`/cf-*`) or auto-invoked when a matching situation appears. Settings that live in `config.json` — run `cf config` and follow the instructions there. To extend a built-in skill, see [Custom Guides](#custom-guides).

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

### 🗺️ Plan & build

- `/cf-plan` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-plan/SKILL.md)) — Brainstorms with you, then writes a phased plan under `docs/plans/<plan-name>/`. Under the hood: `cf-explorer` maps the repo, `cf-planner` compares approaches, then `cf-implementer` runs each task. Available modes:
  - (none) — normal: full workflow, writes the plan file
  - `--fast` / `--quick` — skip discovery and the planner; plan stays in chat, no file. If the plan turns multi-phase it switches to normal and writes the file. Combined with `--auto`, the file is always written
  - `--hard` — extra discovery plus rollback planning
  - `--auto` — after approval, run every phase (review, fix Critical/Important, commit) with no prompts; combines with any mode
  - `--inline` / `--no-file` — plan in chat only, no file; cannot combine with `--auto`
  - `--model <alias>` — pin `cf-planner` (`opus` / `sonnet` / `haiku` / `fable`); ignored in fast
  - `--gui` / `--human` — also write a human overview doc (off by default). To turn that doc on for every run, use `cf config`
  - `--add-tests` / `--tdd` — not a plan mode; forwarded to every `cf-implementer` so each task uses TDD. Without it, implementers write code with no new tests

  Example output:
  ```text
  Progress

  | Status         | Phase             | Tasks   |
  | -------------- | ----------------- | ------- |
  | ✅ DONE        | Phase 1: Teardown | 3 tasks |
  | 🔄 IN PROGRESS | Phase 4: Content  | 6 tasks |
  | ⬜ TODO        | Phase 5: Merge    | 1 task  |

  #### Phase 1 [sequential]
  ```
- `/cf-plan-resume` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-plan-resume/SKILL.md)) — Reloads a saved plan and its context file, skips DONE tasks, re-runs the rest via the same execute protocol. If the plan has `auto: true` and an `AUTOPILOT` section, it continues in autopilot.
- `/cf-advise` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-advise/SKILL.md)) — Interviews one question at a time, then a verdict-first recommendation with pitfalls and ranked alternatives. Never writes code or a plan. Flags: `--quick` / `--fast` (2–3 questions), `--save` (write to `docs/memory/decisions/`).
- `/cf-design` (beta) ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-design/SKILL.md)) — Makes new or changed UI match the project's existing look. The first word of the argument picks the mode (empty → it asks which one):
  - `scan [path]` — read existing UI files, extract colors / type / spacing / components, write `docs/DESIGN.md`
  - `[description]` — implement new UI from that description, using `docs/DESIGN.md` (or a fresh scan) as the base
  - `modify [what] -- [how]` — change one element and keep it consistent with the rest of the project
- `/cf-optimize` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-optimize/SKILL.md)) — Detects available profilers, measures a baseline, changes one thing, re-measures, compares.

### 🐛 Fix & debug

- `/cf-fix` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-fix/SKILL.md)) — Reproduces the bug, searches past bug docs, explores, fixes, verifies, then reviews. Escalates hard bugs to `cf-sys-debug`. `--add-tests` (or `--tdd`) writes a failing test first when none exists.
  
  Example output:
  ```text
  > ✨ **CODING FRIEND** → /cf-fix activated

  Root cause:   [what was wrong, file:line]
  Fix:          [what changed, file:line]
  Confirmed:    [evidence or test that proves the fix]
  Tests:        [pass/fail count, regression test location]
  Status: DONE
  ```
- `cf-sys-debug` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-sys-debug/SKILL.md)) — Four phases: state a file:line hypothesis before touching code, test it, apply a regression-guarded fix, write a bug doc. Auto-invoked for recurring or unclear bugs.
- `cf-tdd` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-tdd/SKILL.md)) — Auto-loaded before production code. Direct mode (default) writes no new tests. TDD mode is `--add-tests` or `--tdd`, or `tdd: true` via `cf config`. `--auto` then reviews, fixes Critical/Important, and commits.
- `cf-verification` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-verification/SKILL.md)) — Auto-invoked after code changes. Runs tests / build / lint, shows the output, and blocks a "done" claim without evidence.

### 🚀 Review & ship

- `/cf-review` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-review/SKILL.md)) — Gathers the diff, forks `cf-reviewer` (five specialists + reducer). Depth is auto QUICK / STANDARD / DEEP from change size, or `--quick` / `--deep`. A second host in parallel: `--with-codex` / `--codex`, `--claude`, `--gemini`, `--cursor`, `--grok`, then merge. `--out` writes a `/cf-review-out` prompt with Claude's findings (cannot combine with those agent flags). Codex-as-default: `cf config`.

  Example output:
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
- `/cf-review-out` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-review-out/SKILL.md)) — Writes a self-contained prompt + diff to `docs/reviews/` for any external AI or a human.
- `/cf-review-in` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-review-in/SKILL.md)) — Reads that result file, presents findings, offers to fix.
- `/cf-commit` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-commit/SKILL.md)) — Analyzes the diff, soft-review check, conventional commit focused on why.
- `/cf-ship` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-ship/SKILL.md)) — Verify → commit → push → PR. `--dry-run` simulates and does not commit, push, or open a PR. Custom Before guides run first (for example a version bump).

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

### 💡 Knowledge

- `/cf-ask` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-ask/SKILL.md)) — Explores the codebase (`cf-explorer`), answers a focused question, saves the Q&A to `docs/memory/`.
- `/cf-scan` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-scan/SKILL.md)) — Token-heavy project scan; writes architecture, conventions, and stack into memory (updates, does not duplicate).
- `/cf-remember` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-remember/SKILL.md)) — Extracts conversation knowledge into `docs/memory/` (bugs, decisions, conventions, features) for later AI recall. Also auto-invoked.
- `/cf-learn` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-learn/SKILL.md)) — Writes educational notes for you (default `~/.coding-friend/learn/`). Host with `cf learn host` or share with `cf mcp`. Output, language, and related settings: `cf config`.
  Run `cf learn host` and you get a site like this:
  ![Learn host](/cf-host.png)
- `/cf-teach` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-teach/SKILL.md)) — Conversational story of what happened and why. Writes under `docs/learn` by default (not the same folder as `/cf-learn`). Language and output: `cf config`.
- `/cf-research` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-research/SKILL.md)) — Parallel web / subagent research → `docs/research/`. Does not plan or build.

### 📌 Context & session

- `/cf-session` (beta) ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-session/SKILL.md)) — Claude only. Saves the session to `docs/sessions/` so you can restore it on another machine.
- `/cf-checkpoint` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-checkpoint/SKILL.md)) — Writes a resume snapshot (goal, decisions, next steps) to `docs/context/checkpoints/`.
- `/cf-checkpoint-from` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-checkpoint-from/SKILL.md)) — Loads that snapshot into a fresh chat, then does the rest of the message. `--recap` also prints a short summary of the restored context.
- `/cf-warm` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-warm/SKILL.md)) — Reads git history since you were away, groups it by topic, writes `docs/warm/`. `--user <name>` (else `git config user.name`), `--n-commits <N>` (default 10).
- `/cf-later-do` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-later-do/SKILL.md)) — Lists `docs/later/` items, you pick one, routes to `/cf-fix` or `/cf-plan`, deletes the file only after the fix is verified.

### ❓ Help

- `/cf-help` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/skills/cf-help/SKILL.md)) — Ask anything about Coding Friend: skills, flags, agents, hooks, CLI, config, memory, hosts. Also auto-invoked when you ask about the toolkit itself.

### 🧠 Memory

Every session starts from scratch. CF Memory is persistent, searchable project knowledge. Markdown in `docs/memory/` is the source of truth. Three search tiers degrade gracefully (SQLite → MiniSearch → grep). Use it from other LLM tools via the MCP server (`cf mcp`). Run `cf config` for tier, embeddings, and capture.

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

Permission gate that auto-approves safe tool calls and working-dir edits, then uses an LLM classifier for everything else (Claude only). Run `cf config`.

```text
┌──────────────┐   ┌─────────────┐   ┌──────────────────────────────┐
│ Rule-Based   │ → │ Working-Dir │ → │ LLM Classifier (Claude only) │
└──────────────┘   └─────────────┘   └──────────────────────────────┘
```

- **Rule-Based Gate**: Instant pattern matching — read-only tools auto-approved, destructive commands blocked.
- **Working-Dir Edits**: File edits (Write/Edit) inside your project directory are auto-approved.
- **LLM Classifier**: Classifies the action as safe or unsafe. Claude only.

You can extend the Bash allow/deny lists in config:

```json
{
  "autoApprove": true,
  // extra command prefixes to auto-approve. Merged across global + local
  "autoApproveAllowExtra": ["cargo check", "npm test"],
  // use below setting to bypass CF auto-approve and let Claude Code handle them.
  "autoApproveIgnore": ["cargo test", "cargo build"]
}
```

> ⚠️ **Not 100% safe**: CF auto-approve is an additional layer that helps reduce prompts, but it doesn't guarantee 100% safety. You can still trigger unsafe actions if you use the wrong command or if the LLM classifier makes a mistake.

### 🛡️ Security

Layered prompt-injection defense. Three layers: isolation, extraction, then alert. Fetched content is data, never instructions.

```text
┌────────────┐   ┌────────────┐   ┌───────┐
│ isolation  │ → │ extraction │ → │ alert │
└────────────┘   └────────────┘   └───────┘
```

- **Isolation**: External content flagged as untrusted data — never treated as instructions.
- **Extraction**: Only facts and information extracted — embedded commands discarded.
- **Alert**: Suspicious content flagged to user — prompt injection attempts exposed.

### 📟 Statusline

Claude only. Run `cf statusline` to install the renderer.

![Statusline](/statusline.png)

## 🧭 Agents

Skills dispatch agents as subagents that run in their own context.

| Agent | Model | Does | Dispatched by |
| ----- | ----- | ---- | ------------- |
| `cf-explorer` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/agents/cf-explorer.md)) | haiku | Maps the repo and writes context files | `/cf-plan`, `/cf-fix`, `/cf-ask` |
| `cf-planner` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/agents/cf-planner.md)) | inherit | Compares approaches and breaks work into tasks | `/cf-plan` |
| `cf-implementer` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/agents/cf-implementer.md)) | inherit | Writes the code (TDD with `--add-tests`) | `/cf-plan`, `/cf-fix`, `cf-tdd` |
| `cf-reviewer` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/agents/cf-reviewer.md)) | inherit | Orchestrates the five-specialist review | `/cf-review`, `/cf-ship` |
| `cf-reviewer-plan` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/agents/cf-reviewer-plan.md)) | sonnet | Checks the diff against the plan | `cf-reviewer` |
| `cf-reviewer-security` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/agents/cf-reviewer-security.md)) | sonnet | Finds security issues in the diff | `cf-reviewer` |
| `cf-reviewer-quality` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/agents/cf-reviewer-quality.md)) | haiku | Names, complexity, duplication, slop | `cf-reviewer` |
| `cf-reviewer-tests` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/agents/cf-reviewer-tests.md)) | haiku | Coverage and missing tests | `cf-reviewer` |
| `cf-reviewer-rules` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/agents/cf-reviewer-rules.md)) | haiku | CLAUDE.md MUST/SHOULD/ALWAYS/NEVER | `cf-reviewer` |
| `cf-reviewer-reducer` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/agents/cf-reviewer-reducer.md)) | haiku | Deduplicates and ranks findings | `cf-reviewer` |
| `cf-writer` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/agents/cf-writer.md)) | haiku | Writes straightforward markdown | `/cf-learn`, `/cf-remember`, `/cf-scan`, `/cf-fix`, `/cf-ask` |
| `cf-writer-deep` ([source](https://github.com/dinhanhthi/coding-friend/blob/main/plugin/agents/cf-writer-deep.md)) | sonnet | Writes deep technical docs | `/cf-learn` |

## 📘 Custom Guides

Extend a built-in skill without editing the plugin. When that skill runs, CF loads your guide (if one exists) and applies its sections: `## Before` before the first step, `## Rules` throughout, `## After` after the last step. Sections are optional — include only what you need.

```bash
cf guide create cf-commit   # scaffolds the local file
cf guide list               # local guides in this project
```

`cf guide create` writes a project file. The skill name must match a built-in skill (`cf-commit`, `cf-plan`, …). It will not overwrite an existing guide.

| Scope  | Path                                                      | Who it applies to                          |
| ------ | --------------------------------------------------------- | ------------------------------------------ |
| Local  | `.coding-friend/skills/<skill-name>-custom/SKILL.md`      | This project. Wins if both exist.          |
| Global | `~/.coding-friend/skills/<skill-name>-custom/SKILL.md`    | All projects. Create this file yourself.   |

Local and global are not merged — if the local file exists, the global one is ignored. The loader resolves the path from the git project root, so it still works if your shell is in a subdirectory.

Example — `.coding-friend/skills/cf-commit-custom/SKILL.md`:

```markdown
## Before

- Check branch naming convention (must match `feat/XX-*` or `fix/XX-*`)

## Rules

- Always include the JIRA ticket from the branch name in the commit subject

## After

- Run tests if the commit type is `feat:` or `fix:`
```

The next time you run `/cf-commit`, that guide is loaded. No `/clear` needed.

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

List gitignore-style paths in `.coding-friend/ignore` so scout-block skips them.
