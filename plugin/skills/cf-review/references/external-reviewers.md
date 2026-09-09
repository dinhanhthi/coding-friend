# External reviewers

Details for `/cf-review` Codex auto-scope, target-compatibility, host-match, `--out` exclusivity, background spawn, per-status collect, normalize mapping, and the `--out` build-prompt pipeline.

## Codex auto-scope

When `codex=true`, run the in-session review (Steps 2–6) **and** Codex in parallel, then merge (Steps 6.5–7). `run-codex-review.sh` auto-scopes: feature branch → `codex review --base <base>`; base branch with unpushed commits → `--base <upstream>`; only uncommitted → `--uncommitted`; local-only → `--commit HEAD`. Covers committed-on-base work that `gather-diff.sh` misses. `--base`/`--commit` omit uncommitted/untracked files.

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

Docs root + label `YYYY-MM-DD-review`. Use `CF_DOCS_ROOT` (absolute, from bootstrap) — not cwd-relative `docsDir`. Fallback: `$MAIN_REPO_ROOT/<docsDir>`. Background Bash so Steps 3–6 run concurrently.

```bash
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/run-codex-review.sh" "${CF_DOCS_ROOT}/reviews/<label>-result-codex.md"
bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-review/scripts/run-agent-review.sh" <agent> "${CF_DOCS_ROOT}/reviews/<label>-result-<agent>.md"
```

**Do NOT wait or inspect at spawn.** Proceed to Step 3. Harness notifies on exit — no poll/sleep/`/tasks`. Check results in Step 6.5.

Skip agent spawn when `agents=[]` or `out=true`. Same `${CF_DOCS_ROOT}` and `<label>` as Codex.

## Step 6.5 Codex status

1. **Wait for Codex.** After Step 6 the harness has usually notified. If not, wait — no poll/sleep. Read the result file only after exit.
2. **Check Codex exit** (`CF_CODEX=...` stderr + exit code):
   - `CF_CODEX=unavailable` (exit 127) → Codex not installed. Print:

     > ⚠ Codex unavailable (not on PATH) — proceeding without it.

     Set `codex=false`; skip the rest (Step 7 uses the cf-reviewer report as-is).

   - `CF_CODEX=error` (non-zero) → print:

     > ⚠ Codex review failed (<reason from stderr>) — proceeding with the in-session review.

     Set `codex=false`; skip the rest.

   - `CF_CODEX=empty` (exit 0, no result file) → print:

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

1. **Wait for each agent** (same contract as Codex — harness notify, no polling).
2. **Check each** (`CF_AGENT=…` stderr + exit code):
   - `unavailable` (127) → `> ⚠ \<Agent\> unavailable (not on PATH) — proceeding without it.` Drop it.
   - `error` (non-zero) → `> ⚠ \<Agent\> review failed (\<reason from stderr\>) — proceeding without it.` Drop it.
   - `empty` (0) → `> ⚠ \<Agent\> found no changes to review — proceeding without it.` Drop it.
   - `timeout` (124) → `> ⚠ \<Agent\> review timed out (\>Ns) — proceeding without it.` Drop it. (N = `review.agentTimeout`, default 300.)
   - `ok <file>` (0) → keep the result file. **No normalize** — already CF-format.

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
