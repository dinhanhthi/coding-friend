# TODO

## Cross-Platform Support

Currently coding-friend supports Claude Code only. Future versions should support other coding agents.

Reference: [superpowers](https://github.com/obra/superpowers) uses symlinked skills and platform-specific instruction files to support multiple agents from a single codebase.

### Codex (OpenAI)

- [ ] Create `AGENTS.md` with rules adapted for Codex
- [ ] Create `.codex/` directory with CLI wrapper
- [ ] Symlink skills to `~/.agents/skills/coding-friend`
- [ ] Test skill discovery and hook equivalents in Codex

### OpenCode

- [ ] Create `.opencode/plugin/coding-friend.js` plugin
- [ ] Symlink skills to `~/.config/opencode/skills/coding-friend`
- [ ] Map hooks to OpenCode lifecycle events

### Gemini CLI

- [ ] Create `GEMINI.md` with rules adapted for Gemini CLI
- [ ] Map skills to Gemini-compatible format
- [ ] Test with Gemini CLI workflows

### Approach

Follow superpowers' pattern:
1. Single `skills/` directory shared across all platforms
2. Platform-specific instruction files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`)
3. Platform adapters in dedicated directories (`.codex/`, `.opencode/`)
4. Hooks mapped to each platform's lifecycle system where available

## Other

- [ ] CI/CD pipeline for releases
