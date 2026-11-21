# Plan branch mode (shared by cf-plan Step 7 and cf-plan-resume)

Opt-in: config `planBranch: true` (local overrides global) or flag `--branch`; `--no-branch` turns it off for one run. The plan's work goes on its own branch, created in the **current checkout**.

#### Inputs

- `branchMode` = `on` | `off` — set by cf-plan Step 0.5 item 1f.
- `off` → skip this whole file.

#### Setup

Run at cf-plan Step 7, after the user approved implementing and before the first task. Applies in every mode, including no-file runs (`--inline`, or single-phase `--fast` without `--auto`).

1. **Git check** — `git rev-parse --is-inside-work-tree` fails → print `> ⚠️ Not a git repository — skipping plan branch.` and continue normally (no branch).
2. **Name** — `name` = the plan task-id with the prefix `^[0-9]{4}-[0-9]{2}-[0-9]{2}-` removed (e.g. `2026-11-20-add-login` → `add-login`). `git check-ref-format --branch "$name"` fails → Ask the user for a branch name.
3. **Switch**:
   - Already on `$name` (`git branch --show-current`) → nothing to do.
   - Branch already exists (`git show-ref --verify --quiet "refs/heads/$name"`) → Ask the user: reuse it (`git switch "$name"`) or abort.
   - Otherwise → `git switch -c "$name"` (branches from HEAD; uncommitted changes come along).
4. **Record** — a plan file exists → write frontmatter `branch: <name>` into the plan `README.md`. Plan files and the context file stay in `CF_DOCS_ROOT`; if the project tracks `docs/plans/` in git, plan edits are committed on this branch together with the code.
5. **Announce** — `> 🌿 Working on branch <name>`.

#### Resume

Run by `/cf-plan-resume` before running any task. Resume never reads config `planBranch` and accepts no `--branch` / `--no-branch` flags — only the plan frontmatter counts.

1. No `branch:` in the plan frontmatter → skip.
2. Already on that branch (`git branch --show-current`) → nothing to do.
3. Branch does not exist (`git show-ref --verify --quiet "refs/heads/$branch"` fails) → Ask the user: recreate it from HEAD (`git switch -c "$branch"`) or abort.
4. Working tree dirty (`git status --porcelain` non-empty) → stop and Ask the user. Never switch with a dirty tree.
5. Otherwise → `git switch "$branch"`.

#### Review target

Plan has `branch:` and is not `commitPerTask` → review with a path target instead of the default one:

1. The orchestrator resolves `<root>` itself = the output of `git rev-parse --show-toplevel`. Never pass a `$(…)` string into a skill argument.
2. Run `/cf-review --no-fix <root>`. A directory target = `--uncommitted --path <root>` (uncommitted + untracked changes).

Why: the default target includes the branch's commits vs `main`/`master`, so phase N would re-review earlier phases. External reviewers (`review.with*`) do not run on a path target.

This applies to the per-phase reviews only; the final after-all-phases review in `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/modes/execute.md` (Post-implementation) keeps the default target (the whole branch).

`commitPerTask: true` → keep the `<phaseBase>..HEAD` range from `${CLAUDE_PLUGIN_ROOT}/skills/cf-plan/modes/autopilot.md`.

#### End report

Plan finished → print `> 🌿 Work is on branch <name>. Merge it when ready.`

Never merge, push, or delete the branch automatically.
