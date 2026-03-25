# CF Memory

Persistent memory system for [Coding Friend](https://cf.dinhanhthi.com/). Provides MCP (Model Context Protocol) tools for storing, searching, and retrieving project knowledge across sessions.

## Architecture

CF Memory uses a **3-tier graceful degradation** design — it automatically detects and uses the best available backend:

| Tier                  | Backend                    | Features                                                                       | When                        |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------ | --------------------------- |
| **Tier 1** (Full)     | SQLite + FTS5 + sqlite-vec | Hybrid search (BM25 keyword + semantic embeddings), RRF fusion, temporal decay | SQLite deps installed       |
| **Tier 2** (Lite)     | MiniSearch daemon          | In-memory BM25 + fuzzy search, file watcher, Unix Domain Socket                | Daemon running              |
| **Tier 3** (Markdown) | Markdown file I/O          | Substring matching, no external deps                                           | Always available (fallback) |

Detection: Tier 1 → Tier 2 → Tier 3 (first available wins).

## MCP Interface

**6 tools:**

| Tool              | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| `memory_store`    | Store a new memory with title, description, type, tags, content |
| `memory_search`   | Search memories by query with optional type/tags filter         |
| `memory_retrieve` | Fetch a specific memory by ID                                   |
| `memory_list`     | List memories with optional type/category filter                |
| `memory_update`   | Update fields of an existing memory                             |
| `memory_delete`   | Delete a memory by ID                                           |

**2 resources:**

| Resource         | Description                                      |
| ---------------- | ------------------------------------------------ |
| `memory://index` | Browse all stored memories (JSON)                |
| `memory://stats` | Storage statistics (total, by category, by type) |

## Memory Model

**Types** map to storage categories:

| Type         | Category (folder) | Use case                        |
| ------------ | ----------------- | ------------------------------- |
| `fact`       | `features/`       | Feature descriptions, facts     |
| `preference` | `conventions/`    | Conventions, preferences        |
| `context`    | `decisions/`      | Architecture decisions, context |
| `episode`    | `bugs/`           | Bug reports, debugging sessions |
| `procedure`  | `infrastructure/` | Procedures, infra setup         |

Memories are stored as Markdown files with YAML frontmatter in `docs/memory/<category>/`.

## Embedding Models

Tier 1 (SQLite) uses embedding models to generate vectors for semantic search. Two providers are supported:

### Providers

| Provider            | How it works                                    | Default model                    | Pros                                         | Cons                                             |
| ------------------- | ----------------------------------------------- | -------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| **Transformers.js** | Runs in-process via `@huggingface/transformers` | `Xenova/all-MiniLM-L6-v2` (384d) | Zero config, no external service             | Slower first load (~5s), limited model selection |
| **Ollama**          | Calls local Ollama server API                   | `all-minilm:l6-v2` (384d)        | Fast, wide model selection, GPU acceleration | Requires Ollama running separately               |

### Recommended Models

| Model                      | Dims | Size    | Notes                                                                 |
| -------------------------- | ---- | ------- | --------------------------------------------------------------------- |
| `all-minilm:l6-v2`         | 384  | ~23 MB  | **Default** — fast, good for small-to-medium collections              |
| `nomic-embed-text`         | 768  | ~274 MB | **Recommended upgrade** — significantly better semantic understanding |
| `mxbai-embed-large`        | 1024 | ~670 MB | Best quality, suitable for large collections (100+ memories)          |
| `snowflake-arctic-embed:s` | 384  | ~67 MB  | Alternative compact model                                             |
| `snowflake-arctic-embed:m` | 768  | ~250 MB | Good balance of quality and speed                                     |
| `bge-base-en-v1.5`         | 768  | ~130 MB | Strong English-language model                                         |
| `bge-large-en-v1.5`        | 1024 | ~670 MB | Top-tier English model                                                |

### Using Ollama for Embeddings

1. Install Ollama: https://ollama.com/download
2. Pull a model:
   ```bash
   ollama pull nomic-embed-text
   ```
3. Configure in `.coding-friend/config.json`:
   ```json
   {
     "memory": {
       "embedding": {
         "provider": "ollama",
         "model": "nomic-embed-text"
       }
     }
   }
   ```
4. If you have existing memories, rebuild to re-embed:
   ```bash
   cf memory rebuild
   ```

If Ollama is not running or the configured model is missing, the system falls back to Transformers.js automatically.

### Changing Models

When you switch to a model with different dimensions (e.g., 384 → 768):

1. The system detects the mismatch on startup
2. Vector search is **disabled** with a warning
3. Run `cf memory rebuild` to re-embed all memories
4. Vector search is re-enabled with the new dimensions

Markdown files are unaffected — they remain the source of truth.

### Dynamic Dimensions

CF Memory includes a lookup table of known models and their dimensions. For models not in the table, it defaults to 384 dimensions. If you use an exotic model, the system logs a warning suggesting you verify dimensions.

Known models include: all-MiniLM-L6-v2 (384d), nomic-embed-text (768d), mxbai-embed-large (1024d), snowflake-arctic-embed variants, and BGE variants.

## Project Structure

```
src/
├── index.ts              # MCP server entry (stdio transport)
├── server.ts             # Tool registration
├── bin/
│   └── cf-memory.ts      # CLI entry point
├── tools/                # MCP tool handlers
│   ├── store.ts
│   ├── search.ts
│   ├── retrieve.ts
│   ├── list.ts
│   ├── update.ts
│   └── delete.ts
├── resources/
│   └── index.ts          # memory://index + memory://stats
├── backends/
│   ├── markdown.ts       # Tier 3: file-based backend
│   ├── minisearch.ts     # Tier 2: in-memory search backend
│   └── sqlite/
│       ├── index.ts      # Tier 1: SQLite backend
│       ├── schema.ts     # DB schema + PRAGMAs
│       ├── migrations.ts # Version tracking, vec table
│       ├── search.ts     # FTS5 + vector + RRF hybrid search
│       └── embeddings.ts # Ollama / Transformers.js pipeline
├── daemon/
│   ├── entry.ts          # Daemon process entry
│   ├── process.ts        # Start/stop, PID management
│   ├── server.ts         # Hono HTTP app (UDS)
│   └── watcher.ts        # File watcher + index rebuild
├── lib/
│   ├── types.ts          # MemoryType, Memory, SearchResult, etc.
│   ├── backend.ts        # MemoryBackend interface (8 methods)
│   ├── tier.ts           # detectTier() + createBackendForTier()
│   ├── daemon-client.ts  # HTTP client over Unix Domain Socket
│   ├── lazy-install.ts   # On-demand dep installer
│   ├── dedup.ts          # Jaccard similarity deduplication
│   ├── temporal-decay.ts # Recency + access scoring
│   └── ollama.ts         # Ollama detection + embedding provider
└── __tests__/            # 14 test suites (vitest)
```

## Development

### Prerequisites

- Node.js 22+
- npm

### Setup

```bash
cd cli/lib/cf-memory
npm install
```

### Scripts

| Command              | Description                           |
| -------------------- | ------------------------------------- |
| `npm run build`      | Compile TypeScript → `dist/`          |
| `npm run dev`        | Run MCP server directly via tsx       |
| `npm run dev:watch`  | Watch mode — recompile on changes     |
| `npm start`          | Run compiled server (`dist/index.js`) |
| `npm test`           | Run all tests (vitest)                |
| `npm run test:watch` | Run tests in watch mode               |

### Dev mode and `cf dev sync`

CF Memory lives in `cli/lib/cf-memory/` (part of the CLI package), **not** in `plugin/`. This means `cf dev sync` is **not needed** — the CLI resolves cf-memory via `getLibPath()` which points directly to `cli/lib/cf-memory/dist/`.

| Consumer                            | Needs `cf dev sync`?              | How changes take effect                                                      |
| ----------------------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| CLI commands (`cf memory *`)        | No                                | `dev:watch` recompiles `dist/` → picked up on next CLI invocation            |
| MCP server (if configured)          | No                                | Needs MCP server **restart** (long-running process)                          |
| Plugin skills (cf-fix, cf-ask, ...) | Yes (for skill file changes only) | Skills reference MCP tools by name — cf-memory code itself doesn't need sync |

In short: run `npm run dev:watch` (or `npm run dev` from the monorepo root) and your changes are immediately available to CLI commands. If you're running the MCP server, restart it after changes.

### Running the MCP server locally

```bash
# Via tsx (no build needed)
npm run dev

# Or build first, then run
npm run build
npm start

# With custom docs directory
MEMORY_DOCS_DIR=/path/to/docs/memory npm run dev

# Force a specific tier
MEMORY_TIER=markdown npm run dev   # Options: auto | full | lite | markdown
```

### Running tests

```bash
npm test              # Run once
npm run test:watch    # Watch mode
```

### Working with the daemon (Tier 2)

```bash
# Start daemon manually (for testing)
node dist/daemon/entry.js ./docs/memory

# With idle timeout (ms) and tier
node dist/daemon/entry.js ./docs/memory 1800000 --tier=lite
```

The daemon runs a Hono HTTP server on a Unix Domain Socket at `~/.coding-friend/memory/daemon.sock`, with PID tracking at `~/.coding-friend/memory/daemon.pid`.

**Auto-reconnect:** If the daemon dies (e.g., idle timeout expires), the `DaemonClient` automatically respawns it on the next request. This means mid-session daemon restarts are transparent — no manual intervention needed.

### Lazy dependencies (Tier 1)

Heavy dependencies for Tier 1 (SQLite + embeddings) are installed on-demand into `~/.coding-friend/memory/node_modules/`, not in this package's `node_modules/`. These include:

- `better-sqlite3` — native SQLite driver
- `sqlite-vec` — vector search extension
- `@huggingface/transformers` — local embeddings (fallback when Ollama is unavailable)

To install them manually: `cf memory init`

### Migration script

For migrating existing `docs/memory/` files to the current frontmatter format:

```bash
npx tsx scripts/migrate-frontmatter.ts [docsDir]
```

## Integration with the CLI

### MCP setup for end users

Users don't need to manually configure the MCP server. `cf init` includes a "CF Memory MCP" step that asks to add `coding-friend-memory` to the project's `.mcp.json` automatically. If skipped during init, users can run `cf memory mcp` to get the config for manual setup.

### CLI commands

The `cf` CLI exposes memory commands that use this package:

| Command                    | Description                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `cf memory status`         | Show current tier, daemon status, memory count                                                                       |
| `cf memory search <query>` | Search memories from the terminal                                                                                    |
| `cf memory list`           | List all stored memories                                                                                             |
| `cf memory start-daemon`   | Start the MiniSearch daemon (Tier 2)                                                                                 |
| `cf memory stop-daemon`    | Stop the daemon                                                                                                      |
| `cf memory rebuild`        | Rebuild search index (Tier 1 direct or via daemon)                                                                   |
| `cf memory init`           | Install Tier 1 deps + import existing memories into SQLite (see [prerequisites](#prerequisites-for-tier-1-on-linux)) |
| `cf memory mcp`            | Print MCP server config for use in Claude Desktop / other clients                                                    |

## Prerequisites for Tier 1 on Linux

Tier 1 uses `better-sqlite3` and `sqlite-vec`, which are native Node.js modules requiring C++ compilation. On a fresh Linux install, you need build tools before running `cf memory init`:

**Ubuntu/Debian:**

```bash
sudo apt update
sudo apt install -y build-essential python3
```

**Fedora/RHEL:**

```bash
sudo dnf groupinstall "Development Tools"
sudo dnf install python3
```

**Arch Linux:**

```bash
sudo pacman -S base-devel python
```

If these are missing, `cf memory init` will fail at the "Installing SQLite dependencies" step. You can still use Tier 2 (lite) or Tier 3 (markdown) without native dependencies — choose them during the init wizard.

**macOS** users need Xcode Command Line Tools: `xcode-select --install`.

## Environment Variables

| Variable                      | Default                  | Description                                       |
| ----------------------------- | ------------------------ | ------------------------------------------------- |
| `MEMORY_DOCS_DIR`             | `./docs/memory`          | Path to memory storage directory                  |
| `MEMORY_TIER`                 | `auto`                   | Force a tier: `auto`, `full`, `lite`, `markdown`  |
| `MEMORY_DAEMON_IDLE_TIMEOUT`  | `1800000` (30 min)       | Daemon idle timeout in ms (`0` = never auto-stop) |
| `MEMORY_EMBEDDING_PROVIDER`   | `transformers`           | Embedding provider: `transformers` or `ollama`    |
| `MEMORY_EMBEDDING_MODEL`      | (provider default)       | Embedding model name (e.g., `nomic-embed-text`)   |
| `MEMORY_EMBEDDING_OLLAMA_URL` | `http://localhost:11434` | Ollama server URL                                 |
| `OLLAMA_HOST`                 | `http://localhost:11434` | Ollama server URL (used by Ollama auto-detection) |

## Versioning

Part of the [coding-friend](https://github.com/dinhanhthi/coding-friend) monorepo. Versioned and released as part of the CLI package. Changelog: [`cli/CHANGELOG.md`](../../CHANGELOG.md).
