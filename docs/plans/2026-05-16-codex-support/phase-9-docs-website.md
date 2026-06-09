# Phase 9: Docs & website

**Plan:** [README.md](./README.md)
**Type:** parallel
**Goal:** Document Codex support across all surfaces. Each task edits independent files.

## Progress

| Status  | Task                                                    |
| ------- | ------------------------------------------------------- |
| ✅ DONE | 9.1 README + tracked developer docs updates             |
| ✅ DONE | 9.2 Website landing — Codex pill + install section      |
| ✅ DONE | 9.3 Website docs pages — install, hosts, model mapping  |
| ✅ DONE | 9.4 StatsSection + landing Skills metadata (host count) |
| ✅ DONE | 9.5 Regenerate `llms.txt` + `llms-full.txt`             |

## Tasks

1. **9.1 README + CLAUDE.md**
   - Files: `README.md`, `cli/README.md`, `docs/plugin-dev.md`
   - README: added supported-host line, Claude/Codex install snippets, Codex manual `/plugins` note, Codex init command, and lifecycle command host-flag note.
   - Developer docs: `CLAUDE.md` is ignored/untracked in this repo state, so tracked Codex maintenance notes were added to `docs/plugin-dev.md` instead.
   - Verify: manual review; Prettier check passes.
   - Rollback: revert.

2. **9.2 Website landing**
   - Files: `website/src/components/landing/Hero.tsx`, `website/src/components/landing/InstallSection.tsx`, `website/src/components/landing/EcosystemSection.tsx` (edit each)
   - Add Codex pill alongside Claude Code in Hero ecosystem pills. Add tabbed install snippet ("Claude" / "Codex") to InstallSection. Update EcosystemSection to show both hosts.
   - Verify: visual check via `cd website && npm run dev`; both pills render; install snippet copies correct command per tab.
   - Rollback: revert components.

3. **9.3 Website docs pages**
   - Files: `website/src/content/docs/getting-started/codex.mdx` (new), `website/src/content/docs/getting-started/installation.mdx`, `website/src/lib/navigation.ts`, plus related CLI/config/reference pages.
   - New page covers: prerequisites (Codex CLI ≥ 0.130.0), install command, what gets registered, reasoning-effort mapping via copied agent TOMLs, known gaps (manual plugin install, best-effort parallelism, trackers, synchronous hooks, native statusline fields, and native session resume/fork), troubleshooting, drift check, and manual `codex plugin marketplace upgrade`.
   - Verify: focused formatting checks and the full production build pass. Desktop and 390px mobile browser checks confirm the page renders without overlap and is reachable from the docs navigation.
   - Rollback: delete page + revert nav.

4. **9.4 StatsSection + Skills metadata**
   - Files: `website/src/components/landing/StatsSection.tsx` (edit), `website/src/components/landing/Skills.tsx` (no add — all skills still apply), `website/src/components/docs/TokenTables.tsx` (no add — same skills)
   - StatsSection: add new stat "Hosts supported: 2" or replace existing stat with "Multi-host (Claude + Codex)".
   - Verify: snapshot test if any; visual review.
   - Rollback: revert.

5. **9.5 llms.txt regeneration**
   - Files: `website/public/llms.txt`, `website/public/llms-full.txt` (auto-generated)
   - Run `cd website && npx tsx scripts/generate-llms-txt.ts`
   - Status: completed with approved sandbox escalation. Both files are ignored build artifacts and remain untracked.
   - Verify: `llms.txt` contains `/docs/getting-started/codex/`; `llms-full.txt` contains the rendered Codex guide.
   - Rollback: regenerate from previous nav state.

## Exit criteria

- ✅ README mentions Codex with install command
- ✅ Website landing has Codex pill + host install snippet
- ✅ Codex docs page is reachable from nav
- ✅ `cd cli && npx vitest run src/lib/__tests__/codex-config.test.ts`
- ✅ `cd cli && npm run build`
- ✅ `npm run verify:codex-drift`
- ✅ Prettier checks for touched root/CLI and website files
- ✅ `cd website && npx tsx scripts/generate-llms-txt.ts`
- ✅ `cd website && npm run build` (68 static pages; Pagefind indexed 59 pages)
- ✅ Browser verification on desktop and 390x844 mobile for the landing page and Codex guide
- ⚠️ `cd website && npm run lint` fails on an existing unrelated `DocsSidebar.tsx` `react-hooks/set-state-in-effect` error
