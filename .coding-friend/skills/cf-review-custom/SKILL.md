## After

After the standard review completes, check if any changed files require documentation updates.

### Step A1: Identify implementation changes that need doc sync

From the files already reviewed in this session, filter for changes in these source directories:

| Source path pattern             | Documentation target                            |
| ------------------------------- | ----------------------------------------------- |
| `plugin/skills/{name}/SKILL.md` | `website/src/content/docs/skills/{name}.mdx`    |
| `plugin/agents/{name}.md`       | `website/src/content/docs/reference/agents.mdx` |
| `cli/src/commands/{name}.ts`    | `website/src/content/docs/cli/cf-{name}.mdx`    |

Only consider files that were actually changed in this conversation's diff — do NOT scan the entire codebase.

If no implementation files match the patterns above, skip the remaining steps and end with: "No doc-sync needed."

### Step A2: Compare changes against documentation

For each matched implementation file:

1. Read the implementation file to understand what changed (use the diff from the review, not the entire file)
2. Read the corresponding documentation file
3. Check whether the documentation already reflects the changes — look for:
   - New or renamed workflow steps, flags, arguments
   - Changed behavior, conditions, or modes
   - Added or removed features, options, or commands
   - Updated agent metadata (model, tools, description)

### Step A3: Report doc-sync findings

Append a **Doc Sync** section to the review report:

```
### 📄 Doc Sync

| Source | Doc | Status |
|---|---|---|
| `plugin/skills/cf-ask/SKILL.md` | `website/.../skills/cf-ask.mdx` | Out of date — missing new `--verbose` flag |
| `plugin/agents/cf-explorer.md` | `website/.../reference/agents.mdx` | Up to date |

**Action needed:** <list specific updates required, or "None — all docs are in sync">
```

If updates are needed, ask the user whether to apply them now or leave as a reminder.

## Rules

- Only check documentation for files that were changed in the current conversation — never do a full-repo audit.
- Do not rewrite entire doc files. Only update the specific sections that drifted from the implementation.
- Preserve the existing documentation style, frontmatter, and structure when making updates.
- If a documentation file does not exist for a new implementation file, flag it as "Missing doc" rather than creating one automatically.
