# CF Memory Changelog

## v0.0.1 (unpublished)

- Add Phase 1: Markdown MCP Server with 6 tools + 2 resources, MarkdownBackend (Tier 3)
- Add Phase 2: MiniSearch daemon + BM25/fuzzy search (Tier 2), daemon HTTP client, file watcher
- Add Phase 3: SQLite + hybrid search with FTS5 + sqlite-vec + RRF fusion (Tier 1), lazy dependency installer, Ollama embedding support
- Add Phase 4: Frontmatter migration, memory recall via MCP, PreCompact auto-capture, smart capture in skills, dedup detection, temporal decay scoring
- Add `cf memory` CLI commands: status, search, list, start, stop, rebuild, init
- Add 3-tier graceful degradation: SQLite → MiniSearch → Markdown
