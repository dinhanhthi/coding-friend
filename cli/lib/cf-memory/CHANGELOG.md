# CF Memory Changelog

## v0.1.0 (unpublished)

- Auto-start daemon from MCP server for file watching — daemon spawns automatically when Tier 1 or 2 is detected, no manual `cf memory start` needed [#2211b84](https://github.com/dinhanhthi/coding-friend/commit/2211b84)
- Add `spawnDaemon()` function to `daemon/process.ts` with dynamic path resolution via `import.meta.url` [#2211b84](https://github.com/dinhanhthi/coding-friend/commit/2211b84)

## v0.0.1 (2026-03-16)

- Add persistent memory system — MCP server with 6 tools (`memory_store`, `memory_search`, `memory_retrieve`, `memory_list`, `memory_update`, `memory_delete`) + 2 resources (`memory://index`, `memory://stats`)
- Add 3-tier graceful degradation: SQLite + hybrid search (Tier 1) → MiniSearch daemon + BM25/fuzzy (Tier 2) → Markdown file I/O (Tier 3)
- Add SQLite backend with FTS5 + sqlite-vec + RRF fusion for hybrid keyword/semantic search
- Add MiniSearch daemon (Hono + Unix Domain Socket) with file watcher and idle timeout
- Add lazy dependency installer for heavy deps (`better-sqlite3`, `sqlite-vec`, `@huggingface/transformers`)
- Add Ollama embedding support with automatic fallback to Transformers.js
- Add `cf memory` CLI commands: `status`, `search`, `list`, `start`, `stop`, `rebuild`, `init`
- Add PreCompact auto-capture hook and smart capture in skills (`cf-fix`, `cf-sys-debug`, `cf-review`, `cf-ask`)
- Add deduplication detection and temporal decay scoring
- Add frontmatter migration script for existing `docs/memory/` files
- Migrate `/cf-remember` and Frontmatter Recall to use `memory_search` MCP tool
- Add `cf memory rm` and `cf memory ls` commands for project database management [#1da99b1](https://github.com/dinhanhthi/coding-friend/commit/1da99b1)
- Add dynamic embedding dimensions support and config wiring [#b7f6eba](https://github.com/dinhanhthi/coding-friend/commit/b7f6eba)
- Fix correct embedding model name in v1→v2 migration [#04d3c19](https://github.com/dinhanhthi/coding-friend/commit/04d3c19)
- Fix empty project directories created on SQLite backend failure [#4ab7570](https://github.com/dinhanhthi/coding-friend/commit/4ab7570)
- Fix unit tests creating orphaned SQLite databases [#ec0bfee](https://github.com/dinhanhthi/coding-friend/commit/ec0bfee)
