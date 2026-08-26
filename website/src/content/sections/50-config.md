## Config

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
    "outputDir": "{docsDir}/learn"
  }
}
```

| Key | Description |
| --- | --- |
| `language` | Language for docs (plans, memory, research, ask). Default: `en`. |
| `docsDir` | Base docs directory relative to project root. Default: `docs`. |
| `autoApprove` | Enable the auto-approve hook. Default: `false`. |
| `privacyBlock` | Privacy-block hook (deny `.env`, keys, credentials). Default: `true`. |
| `scoutBlock` | Scout-block hook (deny ignored dirs). Default: `true`. |
| `autoApproveAllowExtra` | Bash command prefixes to auto-approve (merged across global + local). |
| `autoApproveIgnore` | Bash command prefixes to always require user review. |
| `disableGUIPlan` | Disable the human overview doc `/cf-plan` generates. Default: `true`. |
| `guiPlanFormat` | Format for the GUI plan: `html` or `md`. Default: `html`. |
| `learn` | Learn settings: `language`, `outputDir`, `categories`. Nested object. |
| `review` | Review settings. Nested object; `withCodex` runs a Codex second opinion. |
| `tdd` | Boolean. Enable TDD (RED→GREEN→REFACTOR) by default. |
| `memory` | Object. MemoryConfig for search tier, embeddings, and capture. |

`memory` (MemoryConfig) keys:

- `tier` — `"auto"`, `"full"`, `"lite"`, or `"markdown"`.
- `embedding` — object with `provider` (`"transformers"` or `"ollama"`), `model`, and `ollamaUrl`.
- `autoCapture` — boolean. Save session context on PreCompact.
- `autoStart` — boolean. Start the memory daemon when the MCP server connects.

Extend a built-in skill with `.coding-friend/skills/<name>-custom/SKILL.md`, and list gitignore-style paths in `.coding-friend/ignore` so scout-block skips them.

## Changelog

Releases live on GitHub: [github.com/dinhanhthi/coding-friend/releases](https://github.com/dinhanhthi/coding-friend/releases).

`cf update` upgrades the CLI and plugin.
