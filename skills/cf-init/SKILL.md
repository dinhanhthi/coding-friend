---
name: cf-init
description: Initialize coding-friend in the current project
disable-model-invocation: true
---

# /cf-init

Initialize coding-friend workspace in the current project. Safe to re-run — automatically detects what's already done and only offers pending setup steps.

## Workflow

### Step 1: Verify Project Context

Check that the current working directory is inside a project (has a git repo, package.json, pyproject.toml, Cargo.toml, go.mod, or similar project marker).

```bash
git rev-parse --is-inside-work-tree 2>/dev/null
```

If NOT inside a project, tell the user:
> This doesn't appear to be a project directory. Please navigate to a project root and try again.

Stop here.

### Step 2: Scan Setup Steps

Run ALL detection checks below to build a list of **pending** steps. Each setup step has a detection check that determines if it's already done.

<!-- SETUP_STEPS_START — When adding new features in future versions, add detection + setup entries here -->

#### Check: Docs Folders
```bash
# Done if ALL four exist
ls -d docs/plans docs/memory docs/research docs/learn 2>/dev/null
```
→ If any missing: mark **"Create docs folders"** as pending.

#### Check: .gitignore
```bash
# Done if .gitignore contains "# coding-friend" marker
grep -q "# coding-friend" .gitignore 2>/dev/null
```
→ If marker not found: mark **"Configure .gitignore"** as pending.

#### Check: Language
```bash
# Done if "language" key exists in local OR global config
grep -q '"language"' .coding-friend/config.json 2>/dev/null || \
grep -q '"language"' ~/.coding-friend/config.json 2>/dev/null
```
→ If no `language` config found: mark **"Set docs language"** as pending.

#### Check: /cf-learn config
```bash
# Done if "learn" key exists in local OR global config
grep -q '"learn"' .coding-friend/config.json 2>/dev/null || \
grep -q '"learn"' ~/.coding-friend/config.json 2>/dev/null
```
→ If no `learn` config found: mark **"Configure /cf-learn"** as pending.

#### Check: Claude permissions for external outputDir
Only run this check if `/cf-learn` config exists AND `learn.outputDir` points outside the current project (absolute path or `~/`-prefixed).

```bash
# Read the resolved outputDir from config
# Then check if ~/.claude/settings.json already has permissions for that path
grep -q '<resolved-outputDir>' ~/.claude/settings.json 2>/dev/null
```
→ If `outputDir` is external AND no matching permission rules found in `~/.claude/settings.json`: mark **"Configure Claude permissions"** as pending.
→ If `outputDir` is inside the project (default `docs/learn/`): mark as **done** (not needed).

<!-- SETUP_STEPS_END -->

### Step 3: Present Status

Show the user a checklist of ALL setup steps and their status:

```
coding-friend setup status:
  [done] Create docs folders
  [done] Configure .gitignore
  [pending] Set docs language          ← NEW in v1.4
  [pending] Configure /cf-learn        ← NEW in v1.4
  [pending] Configure Claude permissions  ← NEW in v1.4 (only if external outputDir)
```

**If all steps are done:** Tell the user everything is already configured. Stop here.

**If there are pending steps:** Show the list and ask:

> These setup steps are pending. What do you want to do?

1. **Apply all pending** — Run all pending steps in order
2. **Pick which to apply** — Let the user choose (multi-select from pending list)
3. **Cancel** — Stop here

Then execute only the selected pending steps in order (skip done steps).

---

## Setup Steps

Each step below is only executed if it was marked as pending in Step 2.

### Setup: Create Docs Folders

Create the coding-friend docs structure:

```bash
mkdir -p docs/plans docs/memory docs/research docs/learn
```

Tell the user which folders were created (skip any that already existed).

### Setup: Configure .gitignore

Ask the user if they want to add coding-friend artifacts to `.gitignore`. Present these choices:

1. **Yes, ignore all** — Add `docs/plans/`, `docs/memory/`, `docs/research/`, `docs/learn/`, and `.coding-friend/` to `.gitignore`
2. **Partial** — Let the user pick which folders to ignore
3. **No** — Keep everything tracked in git

#### If "Yes, ignore all":

Append the following block to `.gitignore` (create the file if it doesn't exist). Check first that these entries don't already exist to avoid duplicates:

```
# coding-friend
docs/plans/
docs/memory/
docs/research/
docs/learn/
.coding-friend/
```

#### If "Partial":

Ask the user which of these they want to ignore (multi-select):
- `docs/plans/`
- `docs/memory/`
- `docs/research/`
- `docs/learn/`
- `.coding-friend/`

Then append only the selected entries under a `# coding-friend` header in `.gitignore`.

#### If "No":

Do nothing. Tell the user they can always add these later.

### Setup: Set Docs Language

This is a top-level setting that applies to ALL skills that generate docs (`/cf-learn`, `/cf-plan`, `/cf-research`, etc.).

Ask the user:

> What language should generated docs be written in?

1. **English** (default)
2. **Vietnamese**
3. **Other** — let the user specify

Save the `language` value. It will be written to config in the "Save Config" step at the end.

### Setup: Configure /cf-learn

Ask the user about learning docs settings. Use the `AskUserQuestion` tool for each question.

#### a) Output Location

> Where do you want to store learning docs?

1. **In this project** (`docs/learn/`) — default, docs live with the project
2. **A separate folder** — e.g., a dedicated learning repo or shared folder

If "A separate folder": ask the user to enter the path (absolute or `~/`-prefixed). Validate the path exists or offer to create it.

#### b) Categories

> What categories do you want for organizing learning docs?

1. **Use defaults** — concepts, patterns, languages, tools, debugging
2. **Customize** — let the user define their own categories

If "Customize": ask the user to provide category names and descriptions. Format: `name: description` (one per line).

#### c) Auto-commit (only ask if output is a separate folder)

> Auto-commit learning docs to git after each `/cf-learn`?

1. **Yes** — auto `git add && git commit` in the output directory
2. **No** (default) — manual commits

#### d) README index

> How should learning docs be indexed?

1. **No** (default) — no index file
2. **Single README** — one README.md at the root listing all docs
3. **Per-category** — a README.md in each category folder + a lightweight main README listing only categories

### Setup: Configure Claude permissions

**Only applies when `learn.outputDir` is outside the current project.**

The `/cf-learn` skill needs to read, write, and git-commit in the external `outputDir`. Without explicit permissions in `~/.claude/settings.json`, Claude Code will prompt the user for approval on every file operation — which is disruptive.

Read the current `~/.claude/settings.json`, then compute which permission rules are needed for the resolved `outputDir`. The required rules are:

```
Read(<outputDir>/**)
Edit(<outputDir>/**)
Write(<outputDir>/**)
Bash(cd <outputDir> && git add:*)
Bash(cd <outputDir> && git commit:*)
```

If `autoCommit` is `false`, skip the `git add` and `git commit` rules.

Check which of these rules already exist in `permissions.allow`. Only add the missing ones.

If there are missing rules, show the user what will be added:

> To avoid repeated permission prompts, add these rules to `~/.claude/settings.json`?
>
> ```
> Read(~/git/learn-with-ai/**)
> Edit(~/git/learn-with-ai/**)
> Write(~/git/learn-with-ai/**)
> Bash(cd ~/git/learn-with-ai && git add:*)
> Bash(cd ~/git/learn-with-ai && git commit:*)
> ```

1. **Yes** — Add the missing rules to `permissions.allow` in `~/.claude/settings.json`
2. **No** — Skip (user will get prompted each time)

If "Yes": read `~/.claude/settings.json`, append the missing rules to `permissions.allow` array, and write it back. Preserve all existing settings and formatting.

**Important:**
- Use `~/` prefix in the rules (not expanded absolute paths) for portability
- Never modify `permissions.deny` or any other settings
- If `~/.claude/settings.json` doesn't exist, tell the user to create it via Claude Code settings first

---

## Save Config

After all selected setup steps are done, collect ALL settings that were configured and save them.

Build the config object from all applied steps:

```json
{
  "language": "<from Set Docs Language, if applied>",
  "learn": {
    "outputDir": "<from a>",
    "categories": [<from b>],
    "autoCommit": <from c>,
    "readmeIndex": <from d>
  }
}
```

Only include keys for steps that were actually applied. For example, if user only applied "Set docs language", the config is just `{ "language": "vi" }`.

Ask the user:

> Save these settings as global default or just for this project?

1. **Global** — Write to `~/.coding-friend/config.json` (applies to all projects)
2. **This project only** — Write to `<project>/.coding-friend/config.json`
3. **Both** — Write to global AND local

When writing config:
- If the config file already exists, **merge** new keys into it (preserve other settings)
- If it doesn't exist, create it
- Create `~/.coding-friend/` directory if needed: `mkdir -p ~/.coding-friend`
- Create `<project>/.coding-friend/` directory if needed: `mkdir -p .coding-friend`

**Skip defaults:** If all answers match defaults (language=`en`, outputDir=`docs/learn`, default categories, autoCommit=`false`, readmeIndex=`false`), tell the user no config file is needed since defaults apply. Only write config if at least one setting differs from default.

---

## Final: Confirm

Summarize what was done:
- Which setup steps were applied (and which were already done)
- Details of each applied step (folders created, .gitignore entries, config saved where)
- Remind the user about available commands: `/cf-plan`, `/cf-commit`, `/cf-review`, `/cf-learn`

## Adding New Setup Steps (for future versions)

When adding a new feature that needs initial setup:

1. Add a **Check** block in Step 2 between the `SETUP_STEPS_START`/`SETUP_STEPS_END` markers
2. Add a **Setup** section under "Setup Steps" with the interactive configuration
3. The step name in the checklist should match between Check and Setup
4. Mark new steps with `← NEW in vX.Y` in the checklist display so users know what's new
5. If the step produces config, add its keys to the "Save Config" section
