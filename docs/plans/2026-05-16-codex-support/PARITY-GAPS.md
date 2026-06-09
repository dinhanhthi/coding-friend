# Parity Gaps: What CF Features Can't Be Fully Ported to Codex

Companion to [README.md](./README.md) and [HOW-IT-WORKS.md](./HOW-IT-WORKS.md). This is the honest list of where Codex's runtime model cannot match Claude's, ranked by severity.

**Severity legend:**

- 🔴 **BLOCKING** — no workaround in Codex 0.130.0; feature is unavailable or fundamentally different
- 🟡 **DEGRADED** — feature works but with worse UX, reliability, or performance
- 🟢 **WORKAROUND** — different mechanism, parity achievable with engineering effort

---

## 1. Parallel agent dispatch (the one you asked about)

### How Claude does it today

Claude's orchestrator emits **N `Agent` tool_use blocks in a single assistant message** → harness fires them all concurrently → all results return together in the next user turn. CF uses this in:

| Skill / Agent                 | Parallel dispatch pattern                                                                                        | Depth                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **cf-reviewer**               | Dispatches 5 specialists (`cf-reviewer-plan`, `-security`, `-quality`, `-tests`, `-rules`) in parallel + reducer | 2 (cf-reviewer is itself dispatched by user → specialists are nested below) |
| **cf-plan** (parallel phases) | Multiple `cf-implementer` agents in one message when phase is `[parallel]`                                       | 1                                                                           |
| **cf-fix**                    | Mostly sequential; uses `cf-explorer` then implementation — low parallel usage                                   | 1                                                                           |
| **cf-implementer** (rare)     | Sometimes spawns `cf-explorer` mid-implementation                                                                | 2                                                                           |

### What Codex actually offers

Per [official multi-agent docs](https://developers.openai.com/codex/multi-agent):

- **No native "N different prompts in one call" tool.** Orchestration is via natural-language prompt ("Spawn one agent per X, wait for all, summarize"). Codex decides how to parallelize internally — no API guarantee.
- **`spawn_agents_on_csv`** exists but: same instruction template across all rows, different DATA per row (`{column}` placeholders). It is row-driven batch, not N-distinct-prompts dispatch.
- **`agents.max_depth = 1`** by default. A subagent CANNOT spawn its own subagents.
- **`agents.max_threads = 6`** by default. Concurrent thread cap.
- **Synchronous wait only** — no fire-and-forget. "Codex waits until all requested results are available, then returns a consolidated response."
- **No documented ordering guarantee** for parallel result collection.
- **`spawn_agents_on_csv` is experimental** ("may change").

### Concrete impact on CF

| CF feature                                                             | Codex behavior                                                                                                                                    | Severity                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **cf-reviewer's 5-specialist fan-out**                                 | Blocks on default `max_depth=1`. If cf-reviewer is itself dispatched as a subagent, its child specialists would be depth 2 → **doesn't execute**. | 🔴 BLOCKING with default config |
| **cf-plan's parallel phases** (e.g. 3 implementers concurrently)       | Natural-language request to spawn 3; Codex decides whether to actually parallelize. May serialize internally.                                     | 🟡 DEGRADED                     |
| **cf-implementer + nested cf-explorer**                                | Depth-2 → blocked by default.                                                                                                                     | 🔴 BLOCKING with default config |
| **Background-mode tool dispatch** (Claude's `run_in_background: true`) | Codex has no equivalent. All dispatches block.                                                                                                    | 🔴 BLOCKING                     |
| **N distinct prompts in one go**                                       | Must serialize or use natural-language framing; no atomic guarantee.                                                                              | 🟡 DEGRADED                     |

### Mitigation (Phase 6 / Phase 4 in the plan)

1. **`cf init --agent codex` raises `agents.max_depth = 2`** in `~/.codex/config.toml`. Documented trade-off: higher token use, but cf-reviewer + nested cf-explorer become possible. Anything deeper than 2 still blocks (and CF doesn't need deeper).
2. **`agents.max_threads` left at 6.** Enough for cf-reviewer's 5 specialists + reducer (sequential after specialists finish).
3. **Parallel-phase enforcement on Codex** is best-effort. The `{{cf:dispatch}}` placeholder for parallel phases on Codex renders to: `"Please spawn the following agents in parallel and wait for all results before continuing: [list]"`. If Codex serializes anyway, the plan still completes — just slower. **Document this as a known limitation**, not a bug.
4. **No fire-and-forget.** Skills that intentionally use `run_in_background: true` (rare in CF — mostly long-running probes) fall back to synchronous on Codex. Document per-skill.

---

## 2. Hook events with no Codex counterpart

| Claude hook event                | Used by CF                                                    | Codex equivalent                                                                                        | Severity                                                              |
| -------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `PreCompact`                     | `memory-capture.sh` (autocapture before context compaction)   | Current Codex docs support `PreCompact` and `transcript_path`; parser still differs. | 🟢 WORKAROUND — comparable trigger with Codex parser                    |
| `TaskCreated` / `TaskCompleted`  | `task-tracker.sh` (tracks TodoWrite tasks)                    | None. Codex's task surface differs.                                                                     | 🔴 BLOCKING for tracker; feature simply not registered on Codex       |
| `SubagentStart` / `SubagentStop` | `agent-tracker.sh` (tracks subagent lifecycle for statusline) | Current Codex docs support both events.                                                                                        | 🟢 WORKAROUND — payload parser differs |

---

## 3. Hook payload fields missing on Codex

Per the Codex agent's cross-review and [Codex hooks docs](https://developers.openai.com/codex/hooks):

| Claude hook field                                                      | Used by CF                                                                   | Codex status                                                                                 | Workaround                                                                                                                       |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `transcript_path` (PreCompact, Stop)                                   | `memory-capture.sh` reads transcript JSONL directly via this path            | Current Codex docs expose `transcript_path`, but warn transcript format is not stable.                                                      | Prefer `transcript_path`, fall back to scanning `~/.codex/sessions/YYYY/MM/DD/*.jsonl` by `session_id`. 🟢 |
| `session_id` (most events)                                             | Memory capture, session-log                                                  | Current Codex docs expose `session_id` as a common hook input. | Use directly; fall back to transcript search only if missing. 🟢                         |
| `async: true` hook flag                                                | `session-log.sh`, `agent-tracker.sh`, `task-tracker.sh`, `memory-capture.sh` | **No async hooks on Codex.** All hooks block the model.                                      | Keep payload tiny (write-then-exit); accept the per-turn latency. For Codex, drop `async: true` from generated hooks.json. 🟡    |
| Tool matchers like `Read\|Write\|Edit\|Glob\|Grep` (Claude tool names) | `privacy-block.sh`, `scout-block.cjs`                                        | Codex tool names differ. File edits = `apply_patch`. Read may be `read_file` or similar.     | Build script translates matchers per host. Verify exact Codex tool names in Phase 0. 🟢                                          |

---

## 4. Auto-approve: deliberately not at parity

| Claude auto-approve                          | Codex equivalent                              | Severity              |
| -------------------------------------------- | --------------------------------------------- | --------------------- |
| LLM classifier (Sonnet) for unknown patterns | **Not ported in v1** (deliberate safety call) | 🟡 DEGRADED by design |
| Block destructive patterns (deterministic)   | Ported as deterministic-only allowlist        | 🟢 parity             |
| Allow read-only / working-dir edits          | Ported deterministic                          | 🟢 parity             |

**Why not port the classifier:**

1. PermissionRequest schema differs → bug surface area
2. Calling `claude --print` from Codex hook is wrong; would need a separate LLM call setup
3. Risk of false-allows on Codex is higher than convenience gain in v1
4. User can defer to Codex's native sandbox/approval UI for unknowns

**Upgrade path (post-v1):** add an opt-in `autoApprove.codex.classifier: true` that uses Codex's own `[model]` for classification. Out of scope for the current plan.

---

## 5. Built-in tools CF skills assume exist

| Claude built-in tool                                        | Used by CF skill                                                        | Codex equivalent                                                                                          | Severity                                                                                                                                                     |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AskUserQuestion` (interactive multi-choice)                | cf-plan Round 1/2 discovery, cf-fix clarifications, cf-design questions | **No equivalent documented.** Codex skills can't pause and ask the user mid-task with structured options. | 🔴 BLOCKING for the structured-question UX. **Workaround:** skill body uses natural-language prompts ("Reply with A, B, or C") — works but no UI affordance. |
| `TodoWrite` (task list tool)                                | cf-plan, cf-fix, cf-sys-debug for progress tracking                     | No documented equivalent.                                                                                 | 🟡 DEGRADED — skill body must inline-print task lists instead.                                                                                               |
| `ScheduleWakeup` / `CronCreate` (timed re-entry)            | `/loop` skill (third-party but used in CF ecosystem)                    | None.                                                                                                     | 🔴 BLOCKING — `/loop` doesn't work on Codex.                                                                                                                 |
| `ExitPlanMode` (Claude plan-mode acceptance)                | cf-plan terminal state                                                  | No plan mode in Codex.                                                                                    | 🟡 DEGRADED — cf-plan still produces the plan file (durable artifact) and asks user to confirm via natural language. No visual "Accept plan" gate.           |
| `WebFetch` / `WebSearch`                                    | cf-research, cf-plan discovery rounds                                   | Codex has a web tool (varies by version) — may or may not be exposed to skills.                           | 🟡 verify in Phase 0                                                                                                                                         |
| `EnterWorktree` / `ExitWorktree` (git worktree integration) | cf-implementer with `isolation: "worktree"`                             | No documented equivalent.                                                                                 | 🟡 DEGRADED — Codex skills cannot run inside isolated worktree. cf-implementer's isolation feature doesn't work on Codex.                                    |

---

## 6. Plan mode UX

Claude has an explicit Plan mode triggered by `EnterPlanMode` / `ExitPlanMode` — the user sees the plan in a special UI block and explicitly accepts before code runs. CF's cf-plan workflow expects this.

Codex doesn't have a built-in plan mode. Workaround: cf-plan writes the plan file as durable artifact (already does this) and asks via natural-language confirm. No visual differentiation. Functionally equivalent for written plans; subjectively less crisp.

**Severity:** 🟡 DEGRADED

---

## 7. Statusline mid-session updates

Claude's `statusline.sh` is invoked by the harness on certain events and updates the prompt's status indicator dynamically (subagent count, memory state, last action). Codex's `[tui.status_line]` is **static config** — it picks items from a list (model, project, etc.) but does not run a per-event shell hook.

**Severity:** 🟡 DEGRADED — Codex statusline shows session-static info only. Live counters (e.g. "3 subagents running") not possible without a Codex-side feature CF can't implement.

---

## 8. Slash-command discoverability UX

Claude lists all `/cf-*` commands in its slash menu with descriptions. Codex's `$cf-*` mentions don't appear in a menu the same way — user must remember or grep `~/.codex/plugins/cache/.../skills/`. Tab completion exists but UX differs.

**Severity:** 🟡 DEGRADED — functional parity but less discoverable.

---

## 9. Plugin auto-update

Claude's `marketplaces.<m>.autoUpdate = true` flag in `~/.claude/settings.json` causes the plugin to refresh on session start. Codex CLI 0.130.0 does not expose this — user must run `codex plugin marketplace upgrade` manually (or via `cf update --agent codex`).

**Severity:** 🟡 DEGRADED — `cf install --agent codex` prints "manual upgrade via `cf update --agent codex`" instruction; session-init hook adds a "new version available" banner when out of date.

---

## 10. Summary cheat-sheet

| Feature                                   | Codex severity                                   |
| ----------------------------------------- | ------------------------------------------------ |
| cf-reviewer 5-specialist parallel fan-out | 🔴 with default config, 🟢 after `max_depth = 2` |
| cf-implementer + nested cf-explorer       | 🔴 with default config, 🟢 after `max_depth = 2` |
| Atomic N-different-prompts dispatch       | 🔴 (no native tool; natural-language only)       |
| Fire-and-forget background subagents      | 🔴 (no equivalent)                               |
| `PreCompact`-triggered memory capture     | 🟢 (Codex supports PreCompact; parser differs)   |
| `TaskCreated`/`TaskCompleted` tracker     | 🔴 (no events; tracker disabled on Codex)        |
| `SubagentStart`/`SubagentStop` tracker    | 🟢 (Codex supports events; parser differs)       |
| `transcript_path` in hooks                | 🟢 (documented; scan sessions dir fallback)       |
| `async: true` hooks                       | 🟡 (synchronous on Codex; keep payloads tiny)    |
| Auto-approve LLM classifier               | 🟡 (deliberate; deterministic-only v1)           |
| `AskUserQuestion` interactive tool        | 🔴 (no UI affordance; natural-language fallback) |
| `TodoWrite`                               | 🟡 (inline-print fallback)                       |
| `/loop` skill (`ScheduleWakeup`)          | 🔴 (no scheduler)                                |
| Plan mode UX                              | 🟡 (file artifact + natural-language confirm)    |
| Statusline live counters                  | 🟡 (static config only)                          |
| Slash menu discoverability                | 🟡 (no menu)                                     |
| Plugin auto-update                        | 🟡 (manual upgrade only)                         |

**Net after Phase 0 verification: ~4 features 🔴 partially or fully blocked on Codex; ~8 features 🟡 work with degraded UX; everything else 🟢 ports cleanly or with straightforward parser/config work.**

---

## 11. Reflection on the user's specific question

> "I wanna know about the parallel running agents in cf-fix or cf-implementer."

**Short answer:**

- **cf-fix** itself doesn't fan-out heavily — works fine on Codex.
- **cf-implementer** doesn't fan-out from itself; it's the orchestrator (cf-plan) that fans out multiple implementers. This works on Codex with quality caveats (no atomic guarantee, Codex decides actual parallelism).
- **cf-reviewer is the real concern.** 5 specialists in parallel + reducer + dispatched as a subagent itself = depth 2 + 5-wide fan-out. Default Codex config blocks depth 2. **Mitigation: `cf init --agent codex` bumps `agents.max_depth = 2`.**
- **No fire-and-forget on Codex** — every spawn blocks. Skills don't currently rely on background mode (CF uses `run_in_background` mostly in advisor / probe situations), so impact is minor.

If Codex tightens the depth limit further in a future version, cf-reviewer would need to be re-architected to dispatch the 5 specialists from the main session rather than from inside cf-reviewer — a non-trivial restructuring. **Not planned for v1**, but documented here as a known fragility.
