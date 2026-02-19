---
name: cf-init
description: Initialize coding-friend in the current project
disable-model-invocation: true
---

# /cf-init

Initialize coding-friend workspace in the current project.

## Workflow

### Step 1: Verify Project Context

Check that the current working directory is inside a project (has a git repo, package.json, pyproject.toml, Cargo.toml, go.mod, or similar project marker).

```bash
git rev-parse --is-inside-work-tree 2>/dev/null
```

If NOT inside a project, tell the user:
> This doesn't appear to be a project directory. Please navigate to a project root and try again.

Stop here.

### Step 2: Create Docs Folders

Create the coding-friend docs structure:

```bash
mkdir -p docs/plans docs/memory docs/research docs/learn
```

Tell the user which folders were created (skip any that already existed).

### Step 3: Ask About .gitignore

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

### Step 4: Confirm

Summarize what was done:
- Which folders were created
- Whether `.gitignore` was modified (and which entries were added)
- Remind the user about available commands: `/cf-plan`, `/cf-commit`, `/cf-review`
