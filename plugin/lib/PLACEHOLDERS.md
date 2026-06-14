# Coding Friend Host Rendering

The published `plugin/` tree is valid Claude Code content and is also the
canonical input for the Codex build. Do not leave `{{cf:*}}` tokens in
published Markdown. The Codex builder translates these Claude-native forms:

| Claude source form                                      | Codex output                           |
| ------------------------------------------------------- | -------------------------------------- |
| `/cf-review`                                            | `$cf-review`                           |
| `${CLAUDE_PLUGIN_ROOT}`                                 | `${PLUGIN_ROOT}`                       |
| `subagent_type: "coding-friend:cf-explorer"`            | `cf-explorer` custom-agent instruction |
| `use the Skill tool with skill name coding-friend:NAME` | `load $NAME`                           |

Host-specific workflow differences that are not safe text substitutions belong
in `renderCodexFile()` in `scripts/build-codex-plugin.js`. The lint suite checks
that Claude sources contain no unresolved placeholders and generated Codex
instructions contain no Claude-only runtime APIs.
