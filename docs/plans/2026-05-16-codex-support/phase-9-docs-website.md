# Phase 9: Docs & website

**Plan:** [README.md](./README.md)
**Type:** parallel
**Goal:** Document Codex support across all surfaces. Each task edits independent files.

## Progress

| Status  | Task                                                    |
| ------- | ------------------------------------------------------- |
| ⬜ TODO | 9.1 README + CLAUDE.md updates                          |
| ⬜ TODO | 9.2 Website landing — Codex pill + install section      |
| ⬜ TODO | 9.3 Website docs pages — install, hosts, model mapping  |
| ⬜ TODO | 9.4 StatsSection + landing Skills metadata (host count) |
| ⬜ TODO | 9.5 Regenerate `llms.txt` + `llms-full.txt`             |

## Tasks

1. **9.1 README + CLAUDE.md**
   - Files: `README.md` (edit), `CLAUDE.md` (edit)
   - README: add Codex install section under existing Claude install ("Codex CLI users: run `cf install --codex` instead"). Update Commands table noting `--codex` works on lifecycle commands. Add "Supported hosts: Claude Code, Codex CLI" line.
   - CLAUDE.md: add `## Codex Support` section listing host-aware files, build-script invocation, drift-check command.
   - Verify: manual review; lint test (if any) passes.
   - Rollback: revert.

2. **9.2 Website landing**
   - Files: `website/src/components/landing/Hero.tsx`, `website/src/components/landing/InstallSection.tsx`, `website/src/components/landing/EcosystemSection.tsx` (edit each)
   - Add Codex pill alongside Claude Code in Hero ecosystem pills. Add tabbed install snippet ("Claude" / "Codex") to InstallSection. Update EcosystemSection to show both hosts.
   - Verify: visual check via `cd website && npm run dev`; both pills render; install snippet copies correct command per tab.
   - Rollback: revert components.

3. **9.3 Website docs pages**
   - Files: `website/src/app/docs/codex/page.mdx` (new), `website/src/app/docs/installation/page.mdx` (edit — add Codex tab), `website/src/lib/navigation.ts` (edit — add Codex doc entry under "Getting started")
   - New page covers: prerequisites (Codex CLI ≥ 0.130.0), install command, what gets registered, model-mapping (Claude haiku/sonnet/opus → Codex models user picks in config.toml — point to `[agents.<name>.model]` override), known gaps (PreCompact, trackers), troubleshooting (drift check, manual `codex plugin marketplace upgrade`).
   - Verify: docs build (`cd website && npm run build`) clean.
   - Rollback: delete page + revert nav.

4. **9.4 StatsSection + Skills metadata**
   - Files: `website/src/components/landing/StatsSection.tsx` (edit), `website/src/components/landing/Skills.tsx` (no add — all skills still apply), `website/src/components/docs/TokenTables.tsx` (no add — same skills)
   - StatsSection: add new stat "Hosts supported: 2" or replace existing stat with "Multi-host (Claude + Codex)".
   - Verify: snapshot test if any; visual review.
   - Rollback: revert.

5. **9.5 llms.txt regeneration**
   - Files: `website/llms.txt`, `website/llms-full.txt` (auto-generated)
   - Run `cd website && npx tsx scripts/generate-llms-txt.ts`
   - Verify: regenerated files contain the new Codex doc page; `git diff` only shows additions.
   - Rollback: regenerate from previous nav state.

## Exit criteria

- README mentions Codex with install command
- Website landing has Codex pill + install snippet
- Codex docs page is reachable from nav
- llms.txt contains Codex doc URL
