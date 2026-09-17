# External reviewers

Details for `/cf-review` Codex scope, scope handoff, target-compatibility, host-match, `--out` exclusivity, background spawn, per-status collect, normalize mapping, and the `--out` build-prompt pipeline.

## Codex scope

When `codex=true`, run the in-session review (Steps 2–6) **and** Codex in parallel, then merge (Steps 6.5–7).

From cf-review the scope flag follows the Step 2 metadata, because `codex review` has no single scope that covers committed and uncommitted work at once:

| Step 2 `has_committed` | Step 2.5 passes | Codex actually reviews                                                         |
| ---------------------- | --------------- | ------------------------------------------------------------------------------ |
| `false`                | `--uncommitted` | the same working tree (staged + unstaged + untracked) as the in-session review |
| `true`                 | _(no flag)_     | the committed range only, via auto-scope `--base <base>`                       |

Exactly one of the two Codex invocations in `## Step 2.5 background` runs — the one `has_committed` in the Step 2 `metadata.txt` selects, because `--uncommitted` unconditionally would send Codex looking for a working tree the snapshot may not be about:

- `has_committed=false` → `--uncommitted`: Codex reviews exactly the working tree in the snapshot.
- `has_committed=true` → **omit the flag**: `codex review` has no single scope covering committed + uncommitted, so the runner's auto-scope takes the committed range (`--base <base>`) instead of finding nothing. Codex then covers **less** than the in-session reviewers whenever the tree is also dirty — the uncommitted and untracked hunks in the snapshot are not in its scope. Say that in the Summary next to the Codex source line.

Pinning `--uncommitted` unconditionally instead would make a committed, clean-tree branch report `CF_CODEX=empty`, so the `--with-codex` the user asked for would never run.

Auto-scope is what `run-codex-review.sh` does with **no scope flag** — from a direct invocation, and from the `has_committed=true` row above: feature branch → `codex review --base <base>`; base branch with unpushed commits → `--base <upstream>`; only uncommitted → `--uncommitted`; local-only → `--commit HEAD`. `--base`/`--commit` omit uncommitted/untracked files.

## Target compatibility

Auto-scope matches the **default target** only (empty `$ARGUMENTS`, or natural-language that still reviews the default set). File path or commit range → do NOT run Codex. Print:

> ⚠ `--with-codex` only applies to the default uncommitted-changes review; Codex does not support the target `<target>`. Running the in-session review.

Set `codex=false`; skip Steps 2.5/6.5.

Same for external agents — default target only. File path or commit range → print:

> ⚠ External reviewer flags only apply to the default uncommitted-changes review; they do not support the target `<target>`. Running the in-session review.

Clear `agents=[]`; skip agent Steps 2.5/6.5.

`--out` is default-target only; file-path/commit-range → warn, set `out=false`.

## Host-match no-op

Skip a matching flag only when a `HOST:` line exists **and** equals the flag. If `HOST:` is `claude` and `--claude` was passed, drop `claude` and print:

> ⚠ `--claude` skipped: Claude is already the in-session reviewer.

No `HOST:` line or a different value → do **NOT** skip. When in doubt, run it.

When `agents` is non-empty, run the in-session review (Steps 2–6) **and** each agent in parallel (Steps 2.5/6.5), then merge (Step 7). Each agent: `run-agent-review.sh` (read-only headless CLI) on the **exact `gather-diff.sh` diff** (same set as the in-session review, unlike Codex auto-scope).

## `--out` mutual exclusivity

`--out` + any headless-agent flag (`--claude`/`--gemini`/`--cursor`/`--grok`/`--codex`) → print:

> ⚠ `--out` (manual external review) can't combine with auto reviewer flags — ignoring the agent flags.

Clear `agents=[]`, set `codex=false`.

When `out=true`: the in-session review (Steps 2–6), then a `/cf-review-out`-style prompt (Step 6.7). Skip Steps 2.5/6.5 and Step 7. Show the in-session report, then the "📝 Review Prompt Ready" panel.

## Step 2.5 background

Docs root + label `YYYY-MM-DD-review`. Use `CF_DOCS_ROOT` (absolute, from bootstrap) — not cwd-relative `docsDir`. Fallback: `$MAIN_REPO_ROOT/<docsDir>`. Background Bash so Steps 3–6 run concurrently. Pass the scope you already captured in Step 2 — neither runner may re-derive it:

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/run-codex-review.sh" "${CF_DOCS_ROOT}/reviews/<label>-result-codex.md" --uncommitted  # only when has_committed=false
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/run-codex-review.sh" "${CF_DOCS_ROOT}/reviews/<label>-result-codex.md"  # only when has_committed=true
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/run-agent-review.sh" <agent> "${CF_DOCS_ROOT}/reviews/<label>-result-<agent>.md" --snapshot-dir /tmp/coding-friend/review/<run-id>
```

Run `run-codex-review.sh` only when `codex=true` and `out=false` (`--gemini` alone must NOT spawn Codex), and `run-agent-review.sh` only when `agents` is non-empty and `out=false` (`--with-codex` alone must NOT run `run-agent-review.sh` with literal `<agent>`).

Run exactly one Codex line — the one the `has_committed` value in `metadata.txt` selects (see **Codex scope** above for what each one actually covers, and what to say in the Summary when Codex sees less than the in-session review). `--snapshot-dir` makes the agent reuse `diff.txt` from the Step 2 snapshot, so every agent reads the same bytes as the in-session reviewers.

**If Step 2 warned that the snapshot dir was unusable**, drop `--snapshot-dir` from the `run-agent-review.sh` spawn — the runner rejects an unreadable snapshot (exit 2) rather than guessing, and the flagless call falls back to its own `gather-diff.sh` run. Note that fallback in the Summary: that agent reviewed a separately gathered scope, not the snapshot the in-session reviewers read.

**Do not inspect at spawn.** Proceed to Step 3 and collect in Step 6.5 under the bounded wait below. Each runner enforces its own deadline (`review.agentTimeout`, default 300s) on the CLI subprocess and its whole process group, so a hung external CLI cannot outlive it.

Skip agent spawn when `agents=[]` or `out=true`. Same `${CF_DOCS_ROOT}` and `<label>` as Codex.

## Step 6.5 Codex status

Collect `CF_CODEX` only when a Codex job was spawned; collect `CF_AGENT` only when agent jobs were spawned.

1. **Wait for Codex, bounded.** After Step 6 the harness has usually notified. If not, wait in steps you can bound (at most 60s each) until the runner's own deadline plus a small margin has passed; the runner kills the subprocess itself, so this wait always ends. Read the result file only after exit — never mid-run, and never a result file from an earlier run.
2. **Check Codex exit** (`CF_CODEX=...` stderr + exit code):
   - `CF_CODEX=unavailable` (exit 127) → Codex not installed. Print:

     > ⚠ Codex unavailable (not on PATH) — proceeding without it.

     Set `codex=false`; skip the rest (Step 7 uses the cf-reviewer report as-is).

   - `CF_CODEX=error` (non-zero) → print:

     > ⚠ Codex review failed (<reason from stderr>) — proceeding with the in-session review.

     Set `codex=false`; skip the rest.

   - `CF_CODEX=timeout` (exit 124) → the runner killed it at the deadline. Print:

     > ⚠ Codex review timed out (>Ns) — proceeding with the in-session review.

     (N = `review.agentTimeout`, default 300.) Set `codex=false`; skip the rest. A `CF_CODEX_PARTIAL=` file is kept for diagnosis only — never normalize or merge it.

   - `CF_CODEX=empty` (exit 0, no changes to review, or exit 0 with an empty result file) → print:

     > ⚠ Codex found no changes to review — proceeding with the in-session review.

     Set `codex=false`; skip the rest.

   - `CF_CODEX=ok <file>` (exit 0) → continue. Optional `CF_CODEX_SCOPE=...` on stderr records the scope.

Never block on Codex — failure degrades to the in-session review.

## Normalize mapping

Emits `## 🔍 Codex Review` tagged `**[Codex]**`; map `[P2]`→⚠️, `[P3]`→💡, else (incl. `[P1]`/`[P0]`)→🚨. Unparseable output goes into Summary — never drop content.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/normalize-codex-review.sh" "${CF_DOCS_ROOT}/reviews/<label>-result-codex.md"
```

Same `${CF_DOCS_ROOT}` path as Step 2.5.

## Step 6.5 agent status

Skip when `agents=[]` or `out=true`.

1. **Wait for each agent** (same bounded contract as Codex — the runner's deadline ends every wait).
2. **Check each** (`CF_AGENT=…` stderr + exit code):
   - `unavailable` (127) → `> ⚠ \<Agent\> unavailable (not on PATH) — proceeding without it.` Drop it.
   - `error` (non-zero) → `> ⚠ \<Agent\> review failed (\<reason from stderr\>) — proceeding without it.` Drop it.
   - `empty` (0) → `> ⚠ \<Agent\> found no changes to review — proceeding without it.` Drop it.
   - `timeout` (124) → `> ⚠ \<Agent\> review timed out (\>Ns) — proceeding without it.` Drop it. (N = `review.agentTimeout`, default 300.) Any `CF_AGENT_PARTIAL=` file is diagnostic only — a killed run is never merged as a review.
   - `ok <file>` (0) → keep the result file. **No normalize** — already CF-format.

An extra `CF_AGENT_SCOPE=incomplete …` line can accompany `ok`: the scope that agent reviewed was partial. Keep its findings, and carry the gap into **Uncovered scope** with a PARTIAL status — `ok` alone never means full coverage.

Never block on any external agent — failures degrade gracefully.

## Step 6.7 build-prompt pipeline

After Step 6, emit a `/cf-review-out`-style prompt with in-session findings:

1. Write the in-session Step 6 report to a temp file.
2. Build the prompt (`CF_EMBED_CONTEXT_FILE` must be set on the `build-review-prompt.sh` stage — it reads the var — **not** as a pipeline-leading prefix, which would only reach `gather-diff.sh`):

   ```bash
   mkdir -p "${CF_DOCS_ROOT}/reviews" && \
   bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/gather-diff.sh" | \
   CF_EMBED_CONTEXT_FILE="$tmp_report" \
   bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review-out/scripts/build-review-prompt.sh" \
     "<label>" "<docsDir>" \
   > "${CF_DOCS_ROOT}/reviews/<label>-prompt.md"
   ```

3. Show the "📝 Review Prompt Ready" panel and `> When all external agents finish, run /cf-review-in <label> to collect all results.`
4. Display the in-session report **before** the panel.
5. Skip Steps 7–10's completion banner. Step 8 if appropriate, then stop.

## External status in the merged report

Every external source gets one line under external sources in the merged `### 📋 Summary`: kept, or the exact `> ⚠ …` warning that dropped it. A dropped external never changes `Review status:` when native coverage is otherwise sufficient, and an external report can never substitute for a missing or timed-out native reviewer (see `SKILL.md` → `## Report contract`).
