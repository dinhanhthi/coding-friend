# Coding Friend Placeholders

Coding Friend keeps one canonical set of plugin source files and renders host-specific
artifacts at build time. Use these placeholders in markdown source files that are
consumed by both Claude Code and Codex CLI.

## Canonical Placeholders

| Placeholder                               | Claude Code render                                               | Codex CLI render                                      | Use                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| `{{cf:slash CMD}}`                        | `/CMD`                                                           | `$CMD`                                                | User-facing command references, for example `{{cf:slash cf-review}}`  |
| `{{cf:plugin_root}}`                      | `${CLAUDE_PLUGIN_ROOT}`                                          | `${PLUGIN_ROOT}`                                      | Paths to plugin scripts or reference files from markdown instructions |
| `{{cf:dispatch agent=NAME prompt="..."}}` | `Agent` tool dispatch with `subagent_type: "coding-friend:NAME"` | Natural-language Codex subagent dispatch instructions | Full host-specific subagent dispatch blocks                           |
| `{{cf:agent_ref NAME}}`                   | `subagent_type: "coding-friend:NAME"`                            | `$NAME`                                               | Short inline subagent references                                      |
| `{{cf:skill_invoke NAME}}`                | `use the Skill tool with skill name \`coding-friend:NAME\``      | `load \`$NAME\``                                      | Host-specific instruction for one skill to invoke another skill       |
| `{{cf:host}}`                             | `Claude Code`                                                    | `Codex CLI`                                           | Cosmetic host names in generated docs                                 |

## Scope

Use placeholders in source-of-truth markdown:

- `plugin/skills/cf-*/SKILL.md`
- `plugin/agents/cf-*.md`
- `plugin/context/bootstrap.md`
- shared project docs that are rendered or validated for host-neutral references

Do not rewrite hook shell scripts by hand as part of the markdown sweep. The Codex
plugin build copies hook scripts and rewrites the registered environment variable
references for generated artifacts.
