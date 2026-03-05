# Config Schema

## Overview

coding-friend uses a layered config system:

1. **Global** `~/.coding-friend/config.json` — defaults for all projects
2. **Local** `<project>/.coding-friend/config.json` — project-specific overrides

**Merge rule:** Local overrides global at the top-level key level. For nested objects (like `learn`), local replaces the entire `learn` object if present.

## Full Schema

```jsonc
{
  // --- Global settings ---

  // Language for docs (plans, memory, research, ask)
  // Supported: "en", "vi", or any language name
  // Default: "en"
  "language": "en",

  // Base docs directory (relative to project root)
  // Default: "docs"
  "docsDir": "docs",

  // Enable/disable dev rules reminder hook
  // Default: true
  "devRulesReminder": true,

  // --- Learn settings ---
  "learn": {
    // Language for /cf-learn notes
    // Falls back to top-level "language", then "en"
    // Default: "en"
    "language": "en",

    // Where to store learn docs.
    // - Relative path → resolved from project root (e.g., "docs/learn")
    // - Absolute path → used as-is (e.g., "/Users/thi/git/learn-with-ai")
    // - "~/" prefix → expanded to home dir (e.g., "~/git/learn-with-ai")
    // Default: "{docsDir}/learn"
    "outputDir": "docs/learn",

    // Categories (subdirectories under outputDir)
    // Each has a name (used as folder name) and description (used by agent for categorization)
    // Default: see below
    "categories": [
      {
        "name": "concepts",
        "description": "Design patterns, algorithms, architecture principles",
      },
      {
        "name": "patterns",
        "description": "Repository pattern, observer pattern",
      },
      {
        "name": "languages",
        "description": "Language-specific features, syntax, idioms",
      },
      { "name": "tools", "description": "Libraries, frameworks, CLI tools" },
      { "name": "debugging", "description": "Debugging techniques, bug fixes" },
    ],

    // Auto git-commit after writing docs (useful for separate repo)
    // Default: false
    "autoCommit": false,

    // Index mode for README.md
    // - false: no index
    // - true: single README.md at outputDir root listing all docs
    // - "per-category": README.md per category folder + lightweight main README
    // Default: false
    "readmeIndex": false,
  },
}
```

## Examples

### Default (no config needed)

Writes to `docs/learn/` in the project. English. Default categories.

### Vietnamese user with separate learn repo

**Global** `~/.coding-friend/config.json`:

```json
{
  "language": "vi",
  "learn": {
    "outputDir": "~/git/learn-with-ai",
    "autoCommit": true,
    "readmeIndex": "per-category",
    "categories": [
      { "name": "AI", "description": "AI, ML, Deep Learning, LLMs" },
      {
        "name": "Web_Dev",
        "description": "Frontend, Backend, APIs, Frameworks"
      },
      { "name": "DevOps_Cloud", "description": "Docker, K8s, CI/CD, AWS/GCP" },
      {
        "name": "Programming_Languages",
        "description": "Language features, idioms, tips"
      },
      {
        "name": "Tools_Workflow",
        "description": "Git, CLI tools, IDE, productivity"
      },
      {
        "name": "System_Design",
        "description": "Architecture, scalability, distributed systems"
      }
    ]
  }
}
```

Doc skills (`/cf-plan`, `/cf-research`, `/cf-ask`, etc.) will write in Vietnamese. `/cf-learn` also writes in Vietnamese because `learn.language` is not set, so it falls back to the top-level `language`.

### Project-specific override (English for one project)

**Local** `<project>/.coding-friend/config.json`:

```json
{
  "language": "en",
  "learn": {
    "outputDir": "docs/learn",
    "categories": [
      { "name": "react", "description": "React hooks, components, patterns" },
      { "name": "nextjs", "description": "Next.js routing, SSR, API routes" },
      { "name": "testing", "description": "Jest, Testing Library, E2E" }
    ]
  }
}
```

This overrides both the global `language` and `learn` settings for this project. To set a different language for cf-learn notes, add `"language"` inside the `learn` object.

## Config Resolution (for skill authors)

```
1. Read local:  <project>/.coding-friend/config.json
2. Read global: ~/.coding-friend/config.json
3. Merge: local keys override global keys
4. Apply defaults for any missing keys
```

### Using `language` in skills

Most doc-generating skills (`/cf-ask`, `/cf-remember`, `/cf-plan`, `/cf-research`) read the top-level `language` setting.

`/cf-learn` reads `learn.language` with this fallback chain: `learn.language` → top-level `language` → `"en"`.

Language values:

- `"en"` → Write in English
- `"vi"` → Write in Vietnamese, keep technical terms in English
- Other → Write in that language, keep technical terms in English

### Path resolution for `learn.outputDir`

- Starts with `/` → absolute, use as-is
- Starts with `~/` → expand to home directory
- Otherwise → relative to project root

### MCP Server + Web Host (CLI only)

The `cf host` and `cf mcp` CLI commands use the same `learn.outputDir` to determine the docs folder. No additional config keys are required — both features use the existing `learn` configuration.

**MCP server:** Docs folder is passed as a CLI argument when starting the server.
**Web host:** Docs folder is set via `DOCS_DIR` env var at build time.

Both respect the same path resolution rules as `learn.outputDir`.

## Custom Skill Guides

Separate from `config.json`, users can extend built-in skills with custom guidance using directory-based guides.

### Location

- **Global**: `~/.coding-friend/skills/<skill-name>-custom/SKILL.md` — applies to all projects
- **Local**: `.coding-friend/skills/<skill-name>-custom/SKILL.md` — project-specific
- Local directories override global directories with the same name

### Format

Each `SKILL.md` supports 3 optional sections:

```markdown
## Before

- Steps to run BEFORE the builtin workflow starts

## Rules

- Additional rules applied THROUGHOUT the workflow

## After

- Steps to run AFTER the builtin workflow completes
```

### Example

`.coding-friend/skills/cf-commit-custom/SKILL.md`:

```markdown
## Before

- Check branch naming convention (must match `feat/XX-*` or `fix/XX-*`)

## Rules

- Always include JIRA ticket number from branch name in commit subject
- Scope should match the top-level directory of changed files

## After

- Run tests if commit type is `feat:` or `fix:`
```

### Reload

Custom guides are loaded at session start. After editing, use `/clear` to reload.
