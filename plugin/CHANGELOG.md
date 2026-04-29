# Changelog (Plugin)

> CLI changelog: `[cli/CHANGELOG.md](../cli/CHANGELOG.md)`

## v0.31.0 (2026-04-29)

- Improve `cf-remember`: add four concrete auto-trigger signals — non-obvious bug fixes (post `cf-fix`/`cf-sys-debug` with root cause or multiple failed attempts), explicit architecture decisions ("we chose X over Y"), new project-wide conventions established during implementation, and substantial sessions ending with undocumented gotchas; register `cf-remember` as an auto-invoked skill in `cf-help` [#dfdd159](https://github.com/dinhanhthi/coding-friend/commit/dfdd159)

## v0.30.0 (2026-04-29)

- Add `/cf-review-codex` skill — dispatches code review jobs to Codex (GPT) via the `codex:codex-rescue` plugin; mirrors `/cf-review` workflow with Codex-specific routing, effort knob, and config-layered `codex.enabled`/`codex.modes`/`codex.effort` settings [#099105b](https://github.com/dinhanhthi/coding-friend/commit/099105b)
- Fix `cf-reviewer`: extract Codex availability check into `plugin/skills/cf-review/scripts/check-codex.sh` — resolves silent Codex skip during `/cf-review` when `config.codex.enabled` was `true`; script now prints `KEY=value` lines readable across Bash tool invocations; hardens `jq` config parsing to distinguish `false` from absent keys [#f000115](https://github.com/dinhanhthi/coding-friend/commit/f000115)
- Improve `cf-sys-debug` description with concrete auto-invoke trigger signals (recurring bugs, flaky/race conditions, regressions, CI-only failures) and explicit boundary with `cf-fix` [#65db098](https://github.com/dinhanhthi/coding-friend/commit/65db098)

## v0.29.1 (2026-04-29)

- Fix `auto-approve`: allow `xargs` with safe read-only subcommands (`grep`, `rg`, `wc`, `head`, `tail`, `ls`, `cat`, `stat`, `diff`, `echo`, `sort`, `uniq`, `cut`, `tr`, `jq`, `file`) — `xargs` with destructive subcommands (`rm`, `sh`, `bash`, `curl`, `find`) still requires confirmation [#f861c1e](https://github.com/dinhanhthi/coding-friend/commit/f861c1e)
- Fix `auto-approve`: allow `rm` targeting project files in compound commands (`rm docs/f.json && echo done` auto-approves when rm path is inside the project directory) [#f861c1e](https://github.com/dinhanhthi/coding-friend/commit/f861c1e)
- Fix `cf-reviewer` and `cf-reviewer-codex` agent prompts to reflect correct heading structure and review format [#f861c1e](https://github.com/dinhanhthi/coding-friend/commit/f861c1e)

## v0.29.0 (2026-04-28)

- Add Codex cross-engine review to `/cf-review` (opt-in) — when `codex.enabled = true` in config and the `codex` CLI is installed, `cf-reviewer` dispatches a 6th parallel specialist via `codex:codex-rescue`; cross-engine agreement (Claude + Codex flagging the same `file:line`) bumps severity one tier in the reducer [auto-approve + config]
- Add `codex` config block to `.coding-friend/config.json` schema: `enabled` (boolean), `modes` (array of QUICK/STANDARD/DEEP), `effort` (minimal/low/medium/high/xhigh) — validated with Zod, deep-merged with defaults, typo suggestions for unknown keys including nested fields
- Improve `auto-approve`: allow `xargs` with safe read-only subcommands (grep, rg, wc, head, tail, ls, cat, stat, diff, echo, sort, uniq, cut, tr, jq, file) — xargs with destructive subcommands (rm, sh, bash, curl, find) still require confirmation
- Improve `auto-approve`: allow `rm` targeting project files in compound commands (`rm docs/f.json && echo done` auto-approves when rm path is inside the project directory)

## v0.28.1 (2026-04-27)

- Improve `auto-approve`: support semicolon-separated command chains — each `;`-separated clause is now evaluated independently (same as `&&` chains), allowing commands like `grep ... | head; echo "---"; grep ...` to auto-approve when all segments are safe [#f208e3d](https://github.com/dinhanhthi/coding-friend/commit/f208e3d)
- Improve `auto-approve`: allow `2>/dev/null` stderr suppression in compound commands — `find ... 2>/dev/null && find ... | head` now auto-approves without confirmation [#f208e3d](https://github.com/dinhanhthi/coding-friend/commit/f208e3d)
- Improve `cf-ask`: add Mermaid flow diagram for lifecycle/flow questions — architecture questions that describe a process or sequence now include a visual diagram alongside the prose explanation [#480f652](https://github.com/dinhanhthi/coding-friend/commit/480f652)

## v0.28.0 (2026-04-24)

- Add modes (Deep Research / Quick Reference / Write to Understand), Digest phase with triangulation filter, Refine step (strip AI writing patterns), Gotchas table, and Specification Writing Mode to `cf-research` — research now targets primary sources, filters contradictions, and enforces a linear self-review gate before presenting results [#670b678](https://github.com/dinhanhthi/coding-friend/commit/670b678)
- Add `cf-research` templates: Contradictions section and Quick Reference Notes template [#670b678](https://github.com/dinhanhthi/coding-friend/commit/670b678)
- Add attack angles brainstorm, official solution check, no-placeholders rule, and not-building scope guard to `cf-plan` [#098cd0c](https://github.com/dinhanhthi/coding-friend/commit/098cd0c)
- Improve `cf-fix` and `cf-sys-debug` with cognitive guardrails: rationalization watch tables, progress signals, bisect mode, structured output formats, and regression guard — debugging now follows evidence, not intuition [#4b768a5](https://github.com/dinhanhthi/coding-friend/commit/4b768a5)

## v0.27 (2026-04-23)

- Add chunked plan support to `cf-plan`: large plans (8+ tasks or 3+ phases) are now split into a subfolder with `README.md` + per-phase chunk files; small plans remain as a single file — includes progress tracking table (TODO/IN PROGRESS/DONE icons) in all plan files [#6fc506e](https://github.com/dinhanhthi/coding-friend/commit/6fc506e) [#bfa17d6](https://github.com/dinhanhthi/coding-friend/commit/bfa17d6)
- Fix `auto-approve` hook: allow CF plugin scripts (`.claude-plugin/`, `.claude/`) in compound `&&`/`;` commands with safe redirects (`>`, `>>`) — prevents false classifier hits when hook scripts write to log files [#e8e96e4](https://github.com/dinhanhthi/coding-friend/commit/e8e96e4)

## v0.26 (2026-04-18)

- Expand `auto-approve` allow list with commonly used read-only commands: `cd`, `tr`, `ps`, `env`, `printenv`, `npm --version`/`-v`/`list`/`ls`, `rustc --version`/`-V`, `rustup show`/`--version`, `go version`, `git shortlog`, `git worktree list`, `git config --list`/`-l` — these frequently appear as segments in compound commands and were previously sent to the LLM classifier or prompted [#40fe1ff](https://github.com/dinhanhthi/coding-friend/commit/40fe1ff)

## v0.25 (2026-04-17)

- Add `autoApproveIgnore` config — specify Bash command prefixes the `auto-approve` hook should skip classifying, deferring to Claude Code's native `permissions.allow` patterns (DENY rules still enforced) [#6621b61](https://github.com/dinhanhthi/coding-friend/commit/6621b61)
- Downgrade `cf-implementer` agent from Opus to Sonnet — implementation is a structured, well-defined task; Opus is reserved for planning and complex reviews [#6f3bed3](https://github.com/dinhanhthi/coding-friend/commit/6f3bed3)
- Fix inconsistent heading hierarchy in skill workflow sections — all skills now use `## Workflow` + `### Step N:` pattern consistently (`cf-help`, `cf-learn`, `cf-teach`, `cf-review`, `cf-review-in`, `cf-review-out`) [#71a01dc](https://github.com/dinhanhthi/coding-friend/commit/71a01dc)
- Fix `auto-approve` hook to allow `rm` commands when all targets resolve within the project directory — previously blocked even project-scoped paths, requiring manual approvals for temp file cleanup [#bfd6a9c](https://github.com/dinhanhthi/coding-friend/commit/bfd6a9c)
- Add `mkdir` to the `auto-approve` hook default allow list — safe and idempotent; no longer requires manual approval when creating context/docs directories [#f5f9b59](https://github.com/dinhanhthi/coding-friend/commit/f5f9b59)
- Fix `/cf-review` skill running in a forked subagent — activation signal now shows immediately and the review report correctly uses the 🚨/⚠️/💡/📋 format instead of the layer-based structure [#51320e4](https://github.com/dinhanhthi/coding-friend/commit/51320e4)
- Fix `auto-approve` LLM classifier timeout increased from 30s to 45s — reduces transient "LLM classification unavailable" fallbacks on slow networks or during cold starts [#4b24c8e](https://github.com/dinhanhthi/coding-friend/commit/4b24c8e)
- Document `autoApprove`, `autoApproveAllowExtra`, `autoApproveIgnore` config keys and `CF_AUTO_APPROVE_*` env vars in `docs/config-schema.md` [#4b24c8e](https://github.com/dinhanhthi/coding-friend/commit/4b24c8e)
- Fix `auto-approve` hook: implement quote-aware tokenization so shell metacharacters inside quoted strings (e.g. `grep "foo|bar"`, `grep "=>"`) are no longer mistaken for real operators — prevents false positives that triggered unnecessary confirmation prompts [#c83a1fc](https://github.com/dinhanhthi/coding-friend/commit/c83a1fc)
- Fix `auto-approve` hook: `&&` chains are now auto-approved when all segments match the allow list — e.g. `git status && git log` no longer triggers the LLM classifier; single `&` (background operator) correctly blocked to prevent bypass [#2aa65ed](https://github.com/dinhanhthi/coding-friend/commit/2aa65ed)
- Fix `cf-review`: remove redundant built-in security-review step that generated a separate non-formatted output, breaking the unified 🚨/⚠️/💡/📋 report [#ec565f7](https://github.com/dinhanhthi/coding-friend/commit/ec565f7)
- Skills now show a 2-line memory save summary in confirm steps: the markdown file path and the MCP database indexing status (success or unavailable) — affects `cf-ask`, `cf-remember`, `cf-fix`, `cf-scan`, `cf-warm`, `cf-sys-debug` [#66318a5](https://github.com/dinhanhthi/coding-friend/commit/66318a5)

## v0.24 (2026-04-06)

- Add per-account alias support to statusline — users can assign custom display names for each login account via `cf statusline`, `cf config`, or `cf init`; aliases are stored as an email-keyed map in `statusline.accountAliases` and replace the default name/email display [#126c11c](https://github.com/dinhanhthi/coding-friend/commit/126c11c)
- Auto-approve `cargo fmt` as a safe formatter in the `auto-approve` hook [#1b79b39](https://github.com/dinhanhthi/coding-friend/commit/1b79b39)

## v0.23 (2026-04-06)

- Move test runners and build tools (`npm test`, `npm run`, `npx jest`, `npx vitest`, `npx tsx`, `npx eslint`) from auto-approve allow list to ask list — these execute arbitrary code from repo files and could be exploited via prompt injection [#16c51cc](https://github.com/dinhanhthi/coding-friend/commit/16c51cc)
- Add Cargo support to `auto-approve` hook — read-only subcommands (`cargo --version`, `cargo tree`, `cargo metadata`, `cargo search`, `cargo help`) auto-approve; all others (`cargo check`, `cargo build`, `cargo test`, etc.) require confirmation due to `build.rs` and proc-macro execution [#16c51cc](https://github.com/dinhanhthi/coding-friend/commit/16c51cc)
- Add `autoApproveAllowExtra` config field — users can extend the auto-approve allow list per-project in `.coding-friend/config.json` to reduce prompts in trusted repos (DENY patterns and safety checks still apply) [#16c51cc](https://github.com/dinhanhthi/coding-friend/commit/16c51cc)

## v0.22 (2026-04-05)

- Refactor `/cf-review` into multi-agent orchestrator that dispatches 5 specialist agents (`cf-reviewer-plan`, `cf-reviewer-security`, `cf-reviewer-quality`, `cf-reviewer-tests`, `cf-reviewer-rules`) in parallel and merges results via `cf-reviewer-reducer` [#e9c1d22](https://github.com/dinhanhthi/coding-friend/commit/e9c1d22)
- Add structured context handoff and auto-retry for `cf-implementer` agent (context files, result signals, retry on failure) [#1d58b79](https://github.com/dinhanhthi/coding-friend/commit/1d58b79)
- Add parallel execution for `cf-plan` task phases with agent-tracker locking fix [#8643c9c](https://github.com/dinhanhthi/coding-friend/commit/8643c9c)
- Add task/agent tracking and LLM decision caching hooks, rename `dev-rules-reminder` → `rules-reminder` [#2d6c789](https://github.com/dinhanhthi/coding-friend/commit/2d6c789) [#777d172](https://github.com/dinhanhthi/coding-friend/commit/777d172)
- Phase 6 skills UX improvements — activation signals, TDD escapes, `/cf-ship` dry-run flag, `/cf-optimize` profiling, `/cf-commit` review check, `cf guide` CLI [#d68bfa0](https://github.com/dinhanhthi/coding-friend/commit/d68bfa0)
- Fix `auto-approve` hook security issues — `stripStderrRedirect` bypass and deduplication [#6b0e90e](https://github.com/dinhanhthi/coding-friend/commit/6b0e90e)
- Fix `/cf-review-out` and `/cf-review` to guide external agents to use embedded diff only [#7b673f6](https://github.com/dinhanhthi/coding-friend/commit/7b673f6)
- Fix skill frontmatter to use `allowed-tools` instead of `tools` [#81ed469](https://github.com/dinhanhthi/coding-friend/commit/81ed469)
- Use actual emojis instead of escape codes in skill output [#c743ebb](https://github.com/dinhanhthi/coding-friend/commit/c743ebb)
- Refactor statusline to move model to first line and dedicate a row to account info [#a93e975](https://github.com/dinhanhthi/coding-friend/commit/a93e975)
- Add troubleshooting reference and enhance auto-approve documentation [#5871858](https://github.com/dinhanhthi/coding-friend/commit/5871858)

## v0.21 (2026-04-01)

- Add `/cf-warm` skill — catch up after absence by summarizing git history for a specific user, with dry-run safety, topic clustering, and memory indexing [#a507a96](https://github.com/dinhanhthi/coding-friend/commit/a507a96)
- Expand CLAUDE.md sync to all memory categories with opt-in `sync_to_claude_md` parameter [#a0b2a5b](https://github.com/dinhanhthi/coding-friend/commit/a0b2a5b)
- Use label-based folder names instead of UUIDs in `/cf-session` [#674bec8](https://github.com/dinhanhthi/coding-friend/commit/674bec8)
- Add stats count verification and `StatsSection` update rules to `cf-plan-custom` guide [#bfc7a4e](https://github.com/dinhanhthi/coding-friend/commit/bfc7a4e)

## v0.20 (2026-03-31)

- Add multi-reviewer support and flatten result paths in `/cf-review-out` and `/cf-review-in` [#a149f02](https://github.com/dinhanhthi/coding-friend/commit/a149f02)
- Fix `auto-approve` hook to use `CLAUDE_PROJECT_DIR` for project root detection [#3407436](https://github.com/dinhanhthi/coding-friend/commit/3407436)

## v0.19 (2026-03-30)

- Add `/cf-teach` personal teacher skill — conversational storytelling explanations of what the AI did and why [#4eae799](https://github.com/dinhanhthi/coding-friend/commit/4eae799)
- Add `cf-plan` custom guide for skill and agent creation workflows [#f9c2861](https://github.com/dinhanhthi/coding-friend/commit/f9c2861)
- Fix `auto-approve` LLM classifier and expand allow lists, read global config [#d43a3a1](https://github.com/dinhanhthi/coding-friend/commit/d43a3a1) [#1800bac](https://github.com/dinhanhthi/coding-friend/commit/1800bac)
- Fix `cf-review-out` and `gather-diff` to include untracked files and equalize review scope [#84d7818](https://github.com/dinhanhthi/coding-friend/commit/84d7818)
- Fix `cf-reviewer` format rules to enforce emoji-grouped bullet lists [#108c53a](https://github.com/dinhanhthi/coding-friend/commit/108c53a)

## v0.18 (2026-03-30)

- Refactor `auto-approve` hook to Claude Code Auto-Mode style 3-step classification (auto-approve → LLM classify → block) [#4c57e1f](https://github.com/dinhanhthi/coding-friend/commit/4c57e1f)
- Show CLAUDE.md update status in `cf-memory` output instead of raw file path [#f2b9022](https://github.com/dinhanhthi/coding-friend/commit/f2b9022)
- Restructure code review output to unified 4-category format with consistent emoji headers [#2857066](https://github.com/dinhanhthi/coding-friend/commit/2857066) [#bf9c94e](https://github.com/dinhanhthi/coding-friend/commit/bf9c94e)
- Add critical verification step to `cf-review-in` before acting on external review findings [#8b33fc3](https://github.com/dinhanhthi/coding-friend/commit/8b33fc3)
- Add skill invocation guard to prevent false positive skill activation when discussing skills [#9eee92a](https://github.com/dinhanhthi/coding-friend/commit/9eee92a)
- Fix and standardize custom guide integration across all skills [#faf48f4](https://github.com/dinhanhthi/coding-friend/commit/faf48f4) [#dffe764](https://github.com/dinhanhthi/coding-friend/commit/dffe764)

## v0.17 (2026-03-27)

- Make `cf-help` an auto-invoked skill — activates automatically when users ask about Coding Friend [#15777a7](https://github.com/dinhanhthi/coding-friend/commit/15777a7)
- Make `/cf-optimize` auto-invoke `/cf-review` after optimization completes [#0301bbc](https://github.com/dinhanhthi/coding-friend/commit/0301bbc)
- Remove quality evaluation section from website landing page and docs sidebar [#f397e02](https://github.com/dinhanhthi/coding-friend/commit/f397e02)

## v0.16 (2026-03-27)

- Add discovery & brainstorm phase to `/cf-plan` — 3 rounds of probing questions, feasibility challenges, and alternative exploration before planning [#1d70778](https://github.com/dinhanhthi/coding-friend/commit/1d70778)
- Add `--fast` and `--hard` mode flags to `/cf-plan` with auto-detect — fast mode skips discovery for simple tasks, hard mode adds risk analysis, rollback strategy, and review gates [#fc68f25](https://github.com/dinhanhthi/coding-friend/commit/fc68f25)
- Move `token-counts.json` output from `plugin/generated/` to `website/src/generated/` — website reads tiers dynamically, eliminating hardcoded values [#4650b30](https://github.com/dinhanhthi/coding-friend/commit/4650b30)
- Fix `cf-review-out` tier badge (medium → low) [#4650b30](https://github.com/dinhanhthi/coding-friend/commit/4650b30)
- Consolidate review system into unified `cf-reviewer` agent with CLAUDE.md compliance checking, git history analysis, and universal confidence filtering [#a92f282](https://github.com/dinhanhthi/coding-friend/commit/a92f282) [#f0c6bf5](https://github.com/dinhanhthi/coding-friend/commit/f0c6bf5)

## v0.15 (2026-03-26)

- Add auto-approve `PreToolUse` hook for smart permission gating with two-tier classification: fast rule-based patterns (instant) and LLM fallback (Sonnet, ~2-5s) [#7cff393](https://github.com/dinhanhthi/coding-friend/commit/7cff393)
- Add opt-in `autoApprove` config option in `.coding-friend/config.json` [#7cff393](https://github.com/dinhanhthi/coding-friend/commit/7cff393)
- Fix `auto-approve.cjs` hook not executable — add missing execute permission [#4655722](https://github.com/dinhanhthi/coding-friend/commit/4655722)
- Add stderr error logging to `auto-approve.cjs` catch blocks with `[auto-approve]` prefix for better debuggability [#4655722](https://github.com/dinhanhthi/coding-friend/commit/4655722)
- Fix `/cf-review-out` to include all branch commits in diff and prevent false positives [#87f73c1](https://github.com/dinhanhthi/coding-friend/commit/87f73c1)
- Fix `auto-approve` hook overriding Claude Code's `allowedTools` for MCP tools and built-in tools — unknown non-Bash tools now pass through to Claude Code's own permission system instead of LLM classification [#3566f9b](https://github.com/dinhanhthi/coding-friend/commit/3566f9b)
- Expand `ALWAYS_ALLOW_TOOLS` with 14 safe built-in Claude Code tools (`Skill`, `ToolSearch`, `TaskCreate`/`TaskUpdate`/`TaskGet`/`TaskList`/`TaskOutput`/`TaskStop`, `SendMessage`, `EnterPlanMode`/`ExitPlanMode`, `ListMcpResourcesTool`, `ReadMcpResourceTool`, `AskUserQuestion`) [#3566f9b](https://github.com/dinhanhthi/coding-friend/commit/3566f9b)
- Auto-approve coding-friend plugin scripts with `fs.realpathSync()` validation — resolves symlinks and verifies script exists on disk [#3566f9b](https://github.com/dinhanhthi/coding-friend/commit/3566f9b)
- Restrict `cf` CLI auto-approval to known safe subcommands only — prevents collision with Cloud Foundry CLI and other `cf` binaries [#3566f9b](https://github.com/dinhanhthi/coding-friend/commit/3566f9b)
- Remove unused `/release` skill (already integrated into `cf-ship-custom`) [#a35d7aa](https://github.com/dinhanhthi/coding-friend/commit/a35d7aa)

## v0.14 (2026-03-26)

- Add `/cf-review-out` and `/cf-review-in` skills for cross-agent code review [#9d42044](https://github.com/dinhanhthi/coding-friend/commit/9d42044)
- Add account info component to statusline with `~/.claude.json` fallback [#fd9ee3d](https://github.com/dinhanhthi/coding-friend/commit/fd9ee3d)
- Update missing new skills in bootstrap context [#453228f](https://github.com/dinhanhthi/coding-friend/commit/453228f)
- Clarify changelog entry rules to reflect net changes per version in `cf-ship-custom` guide [#55a6135](https://github.com/dinhanhthi/coding-friend/commit/55a6135)
- Internal: consolidate independent versioning for bundled libs [#93b77cb](https://github.com/dinhanhthi/coding-friend/commit/93b77cb)

## v0.13 (2026-03-21)

- Improve skills and agents with enhanced instructions for evaluation and benchmarking [#bb1352b](https://github.com/dinhanhthi/coding-friend/commit/bb1352b)
- Add `index_only` option to `memory_store` calls in `cf-scan`, `cf-ask`, `cf-remember`, `cf-fix`, `cf-sys-debug` to prevent duplicate file creation [#7f56711](https://github.com/dinhanhthi/coding-friend/commit/7f56711)
- Add emoji to heading in reports of `cf-review` and `cf-code-reviewer` [#48fda77](https://github.com/dinhanhthi/coding-friend/commit/48fda77)
- Add `cf-explorer` agent integration to `cf-research` for codebase context gathering [#51aeba9](https://github.com/dinhanhthi/coding-friend/commit/51aeba9)

## v0.12 (2026-03-20)

- Add token usage visibility across UI with tier icons and documentation [#4227860](https://github.com/dinhanhthi/coding-friend/commit/4227860)
- Extract hardcoded bash commands into scripts for skills [#4338b91](https://github.com/dinhanhthi/coding-friend/commit/4338b91)
- Add detailed agent descriptions and enhance `cf-tdd` trigger phrases [#c9e9164](https://github.com/dinhanhthi/coding-friend/commit/c9e9164)
- Update bootstrap context to include `cf memory config` command [#783dbb6](https://github.com/dinhanhthi/coding-friend/commit/783dbb6)

## v0.11 (2026-03-17)

- Add CF Memory priority to skills and agents — memory-aware skills now prioritize recall before task execution [#2f5724e](https://github.com/dinhanhthi/coding-friend/commit/2f5724e)
- Add built-in security-review skill to `cf-review` workflow [#812794a](https://github.com/dinhanhthi/coding-friend/commit/812794a)
- Force `cf-planner` agent to always use opus model [#79a94b8](https://github.com/dinhanhthi/coding-friend/commit/79a94b8)
- Compact statusline layout with brighter green levels [#1d7bef1](https://github.com/dinhanhthi/coding-friend/commit/1d7bef1)
- Make `memory_store` MCP calls mandatory and explicit in `cf-remember`, `cf-ask`, `cf-fix`, `cf-sys-debug` — split into separate MANDATORY steps to prevent skipping [#1220ad0](https://github.com/dinhanhthi/coding-friend/commit/1220ad0)
- Add `cf-remember` to smart capture list in bootstrap context [#1220ad0](https://github.com/dinhanhthi/coding-friend/commit/1220ad0)

## v0.10 (2026-03-17)

- Rename `/cf-onboard` to `/cf-scan` — scans project and bootstraps memory with architecture, conventions, and features [#387afda](https://github.com/dinhanhthi/coding-friend/commit/387afda)
- Add `cf-memory` support to release and ship skills [#c73b14e](https://github.com/dinhanhthi/coding-friend/commit/c73b14e)

## v0.9 (2026-03-16)

- Add `/cf-onboard` skill for project memory bootstrap — scans project and populates memory with architecture, conventions, and features ([#0ed475e](https://github.com/dinhanhthi/coding-friend/commit/0ed475e))
- Migrate /cf-remember and Frontmatter Recall to use memory_search MCP tool

## v0.8 (2026-03-10)

- Add `rate_limit` statusline component with current and weekly API usage, color-coded gradient, reset times, and Anthropic OAuth API integration ([#b8c1cdc](https://github.com/dinhanhthi/coding-friend/commit/b8c1cdc))
- Improve skill descriptions with explicit trigger phrases and auto-invoke conditions ([#3bfdfe9](https://github.com/dinhanhthi/coding-friend/commit/3bfdfe9), [#021739b](https://github.com/dinhanhthi/coding-friend/commit/021739b))
- Clarify `cf-remember` (AI recall) vs `cf-learn` (human learning) distinction ([#021739b](https://github.com/dinhanhthi/coding-friend/commit/021739b))
- Add `user-invocable: true` to `cf-review` and `user-invocable: false` to `cf-tdd`/`cf-sys-debug` ([#021739b](https://github.com/dinhanhthi/coding-friend/commit/021739b), [#ca86338](https://github.com/dinhanhthi/coding-friend/commit/ca86338))
- Add refactoring triggers to `cf-tdd`, Common Workflows to `cf-help`, PR title guidance to `cf-ship` ([#021739b](https://github.com/dinhanhthi/coding-friend/commit/021739b))
- Extract `cf-research` templates and `cf-session` scripts to separate files ([#021739b](https://github.com/dinhanhthi/coding-friend/commit/021739b), [#3bfdfe9](https://github.com/dinhanhthi/coding-friend/commit/3bfdfe9))
- Fix `cf-sys-debug` heading: "5-Phase Process" → "4-Phase Process + Documentation" ([#3bfdfe9](https://github.com/dinhanhthi/coding-friend/commit/3bfdfe9))
- Add `model: haiku` to `cf-session` for cost efficiency ([#021739b](https://github.com/dinhanhthi/coding-friend/commit/021739b))

## v0.7 (2026-03-08)

- Add `cf-session` skill for cross-machine session continuity ([#d0c58cd](https://github.com/dinhanhthi/coding-friend/commit/d0c58cd), [#6158bb7](https://github.com/dinhanhthi/coding-friend/commit/6158bb7))
- Auto-trigger `/cf-review` after implementation and fix workflows ([#ff666ba](https://github.com/dinhanhthi/coding-friend/commit/ff666ba))
- Make `cf-optimize` auto-invocable on performance-related signals ([#ca86338](https://github.com/dinhanhthi/coding-friend/commit/ca86338))
- Add performance suggestion sections to `cf-fix`, `cf-plan`, and `cf-code-reviewer` ([#ca86338](https://github.com/dinhanhthi/coding-friend/commit/ca86338))
- Update bootstrap context to list CLI commands: `cf disable`, `cf enable`, `cf install`, `cf uninstall`, `cf update`, `cf permission` ([#32325db](https://github.com/dinhanhthi/coding-friend/commit/32325db), [#16ece26](https://github.com/dinhanhthi/coding-friend/commit/16ece26), [#8033ef4](https://github.com/dinhanhthi/coding-friend/commit/8033ef4))
- Remove manual-only trigger for `cf-optimize`, `cf-remember`, `cf-review` ([#a2ea10f](https://github.com/dinhanhthi/coding-friend/commit/a2ea10f))
- Add folder and brain icons to statusline ([#dab4d0b](https://github.com/dinhanhthi/coding-friend/commit/dab4d0b))
- Fix `$CWD` path resolution, activation signal scoping, and `compact-marker.sh` hookEventName ([#5b59571](https://github.com/dinhanhthi/coding-friend/commit/5b59571), [#d567bed](https://github.com/dinhanhthi/coding-friend/commit/d567bed), [#7cc4161](https://github.com/dinhanhthi/coding-friend/commit/7cc4161))
- Remove non-functional `PreCompact` hook ([#687a38c](https://github.com/dinhanhthi/coding-friend/commit/687a38c))

## v0.6 (2026-03-05)

- Add frontmatter-based recall and memory documentation to skills ([#37af8ee](https://github.com/dinhanhthi/coding-friend/commit/37af8ee))
- Add separate language settings for docs and `cf-learn` ([#1bbaae1](https://github.com/dinhanhthi/coding-friend/commit/1bbaae1))
- Consolidate `bump-version` into `cf-ship-custom` ([#287fddc](https://github.com/dinhanhthi/coding-friend/commit/287fddc))
- Add tag push ordering rule to release docs ([#7ebf80d](https://github.com/dinhanhthi/coding-friend/commit/7ebf80d))

## v0.5 (2026-03-04)

- Migrate custom skill guides to on-demand, directory-based format ([#f3fcd69](https://github.com/dinhanhthi/coding-friend/commit/f3fcd69), [#f28e1af](https://github.com/dinhanhthi/coding-friend/commit/f28e1af))
- Track skills `bump-version` and `release` for this project only ([#8c88658](https://github.com/dinhanhthi/coding-friend/commit/8c88658))
- Specify explicit model for `cf-code-reviewer` and `cf-implementer` agents ([#76bb8f2](https://github.com/dinhanhthi/coding-friend/commit/76bb8f2))
- Add `cf-` prefix to all agent names ([#ce59871](https://github.com/dinhanhthi/coding-friend/commit/ce59871))
- Expand `cf-plan` and `cf-fix` trigger keywords for better auto-invocation ([#9486160](https://github.com/dinhanhthi/coding-friend/commit/9486160))
- Clarify `cf-*` signal rules with explicit criteria ([#5191081](https://github.com/dinhanhthi/coding-friend/commit/5191081))

## v0.4 (2026-03-03)

- Add customizable statusline component selection ([#3714a2b](https://github.com/dinhanhthi/coding-friend/commit/3714a2b))
- Add context window usage percentage display to statusline ([#89d3c95](https://github.com/dinhanhthi/coding-friend/commit/89d3c95))
- Refactor custom skill guides to use `-custom.md` suffix ([#99648a7](https://github.com/dinhanhthi/coding-friend/commit/99648a7))
- Refactor bootstrap context and split from `cf-help` skill ([#de47b9a](https://github.com/dinhanhthi/coding-friend/commit/de47b9a))
- Add in-skill reminders and remove `review-gate` Stop hook ([#1c9f8c3](https://github.com/dinhanhthi/coding-friend/commit/1c9f8c3))
- Optimize verification workflow to avoid duplicate test runs ([#00b9304](https://github.com/dinhanhthi/coding-friend/commit/00b9304))
- Fix activation signal scoping and tool naming in agent docs ([#41c5e43](https://github.com/dinhanhthi/coding-friend/commit/41c5e43), [#24487d7](https://github.com/dinhanhthi/coding-friend/commit/24487d7))
- Improve documentation link and inline code styling on website ([#96a1071](https://github.com/dinhanhthi/coding-friend/commit/96a1071))

## v0.3 (2026-03-03)

- Add `explorer` agent for reusable codebase exploration ([#af2a926](https://github.com/dinhanhthi/coding-friend/commit/af2a926))
- Add `implementer` agent wired into `cf-plan`, `cf-fix`, `cf-tdd`, `cf-optimize` ([#cc5b0c4](https://github.com/dinhanhthi/coding-friend/commit/cc5b0c4))
- Add `cf-plan` codebase exploration delegation to `planner` agent ([#24b1560](https://github.com/dinhanhthi/coding-friend/commit/24b1560))
- Fix: don't auto commit after implementation ([#a5d6750](https://github.com/dinhanhthi/coding-friend/commit/a5d6750))
- Fix code review findings in plugin ([#f3d7f53](https://github.com/dinhanhthi/coding-friend/commit/f3d7f53))
- Fix statusline credential hygiene in OAuth token handling ([#003993e](https://github.com/dinhanhthi/coding-friend/commit/003993e))
- Fix statusline: use Anthropic OAuth API instead of third-party Swift script ([#56335f7](https://github.com/dinhanhthi/coding-friend/commit/56335f7))
- Fix statusline: properly validate utilization is numeric before display ([#952bd62](https://github.com/dinhanhthi/coding-friend/commit/952bd62))
- Fix stop hook JSON schema in `review-gate.sh` ([#741fc6e](https://github.com/dinhanhthi/coding-friend/commit/741fc6e))
- Make `cf-auto-review` single source of truth for review methodology ([#b92f9a9](https://github.com/dinhanhthi/coding-friend/commit/b92f9a9))

## v0.2 (2026-03-02)

- Add `/cf-review` reminder to `/cf-plan` and `/cf-fix` workflows to prevent skipping code review before commit — [#16d608c](https://github.com/dinhanhthi/coding-friend/commit/16d608c)
- Add activation signal display for coding-friend skills and agents — [#2dd1668](https://github.com/dinhanhthi/coding-friend/commit/2dd1668)
- Enhance `/cf-review` documentation with proportional review depth, security analysis, and cross-links — [#2220098](https://github.com/dinhanhthi/coding-friend/commit/2220098)
- Enhance security review with proportional depth, auto-triggers, and defense-in-depth strategy — [#53994ce](https://github.com/dinhanhthi/coding-friend/commit/53994ce)
- Rewrite `scout-block` hook as Node.js with default patterns and negation support — [#2364935](https://github.com/dinhanhthi/coding-friend/commit/2364935)
- Add detailed descriptions to all hook files — [#c6fadbc](https://github.com/dinhanhthi/coding-friend/commit/c6fadbc)
- Add `review-gate` hook documentation and update hook count from 7 to 8 — [#19a1775](https://github.com/dinhanhthi/coding-friend/commit/19a1775)
- Reduce the number of colors on homepage — [#0c2f3a2](https://github.com/dinhanhthi/coding-friend/commit/0c2f3a2)

## v0.1 (2026-03-01)

- Add custom skill guides: extend built-in skills with user-defined `Before`/`Rules`/`After` sections in `.coding-friend/skills/<skill-name>.md`
- Add validation for custom guides: warn on wrong skill names, format errors, with "did you mean?" suggestions
- Show guide warnings prominently at session start via `<guide-warnings>` block
- Redesign website homepage to showcase full ecosystem (Plugin, CLI, Learn Host, Learn MCP)
- Add `EcosystemSection` and `DifferentiatorSection` to landing page
- Clarify `/cf-remember` category selection: add `bugs/` and `infrastructure/` categories
- Enhance `/cf-commit` workflow: add Step 2 to identify conversation-related changes vs unrelated work
- Move plugin changelog to `plugin/`, `marketplace.json` to `.claude-plugin/`
- Simplify README, move development guides to component READMEs, consolidate gitignore files
- Fix: exclude code blocks when extracting headings for Table of Contents
- Fix `UserPromptSubmit` hook error on new session
- Merge `/changelog` into `/bump-version` skill

## v0.0.1

- Add 15 skills: `/cf-plan`, `/cf-fix`, `/cf-ask`, `/cf-optimize`, `/cf-review`, `/cf-commit`, `/cf-ship`, `/cf-remember`, `/cf-learn`, `/cf-research` + 5 auto-invoked (`cf-tdd`, `cf-sys-debug`, `cf-auto-review`, `cf-verification`, `cf-learn`)
- Add 7 hooks: session init, dev rules reminder, privacy block, scout block, statusline, compact marker, context tracker
- Add 5 agents: `code-reviewer`, `implementer`, `planner`, `writer` (`haiku`), `writer-deep` (`sonnet`)
- Add CLI companion (`coding-friend-cli` on npm): `cf init`, `cf host`, `cf mcp`, `cf statusline`, `cf update`
- Add learning docs host (`cf host`) with ISR, Pagefind full-text search, and modern UI with command palette
- Add MCP server (`cf mcp`) for LLM integration with learning docs
- Add layered config: global (`~/.coding-friend/`) + local (`.coding-friend/`), local wins
- Add prompt injection defense across all skills, agents, and hooks
- Add project website with docs, changelog, and landing page
