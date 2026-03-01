# coding-friend-learn-mcp

MCP (Model Context Protocol) server that exposes your `/cf-learn` docs as tools for Claude — letting Claude read, search, write, and improve your learning notes directly.

## Usage (via CLI)

```bash
cf mcp                     # setup MCP for docs/learn/
cf mcp ./my-docs           # setup MCP for a custom directory
```

The CLI builds the server and prints the config to add to Claude Desktop / Claude Code.

## Local Development

Run the server directly without the CLI — useful when working on tools or docs logic.

### 1. Install dependencies

```bash
cd cli/lib/learn-mcp
npm install
```

### 2. Run with tsx (no build needed)

The server accepts the docs directory as the first CLI argument, or via `LEARN_DOCS_DIR` env var.

```bash
# Using argument
npx tsx src/index.ts /path/to/your/docs/learn

# Using env var
LEARN_DOCS_DIR=/path/to/your/docs/learn npx tsx src/index.ts

# Point to this repo's own learn docs
npx tsx src/index.ts ../../../docs/learn
```

The server communicates over stdio (MCP protocol), so you won't see output when running manually — it's meant to be connected to Claude.

### 3. Connect to Claude Code (dev mode)

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "coding-friend-learn": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "/path/to/coding-friend/cli/lib/learn-mcp/src/index.ts", "/path/to/your/docs/learn"]
    }
  }
}
```

Or for Claude Desktop, add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "coding-friend-learn": {
      "command": "npx",
      "args": ["tsx", "/path/to/coding-friend/cli/lib/learn-mcp/src/index.ts", "/path/to/your/docs/learn"]
    }
  }
}
```

### 4. Watch mode (auto-rebuild)

Keep a terminal running to auto-rebuild on every file change:

```bash
npm run dev:watch
```

Then restart the MCP server in Claude Code (`/mcp` → restart) to pick up the latest changes.

### 5. Build and run compiled

```bash
npm run build
node dist/index.js /path/to/docs/learn
```

## Docs Directory Structure

```
docs/
└── learn/
    ├── category-one/
    │   ├── my-doc.md
    │   └── another-doc.md
    └── category-two/
        └── some-doc.md
```

Each `.md` file needs frontmatter:

```md
---
title: My Doc Title
category: category-one
tags: [typescript, patterns]
created: 2025-01-01
updated: 2025-01-15
---

Content here...
```

## Available Tools

| Tool | Type | Description |
|------|------|-------------|
| `list-categories` | Read | List all doc categories |
| `list-docs` | Read | List docs (optionally filter by category or tag) |
| `read-doc` | Read | Read a specific doc by category + slug |
| `search-docs` | Read | Full-text search across all docs |
| `get-review-list` | Read | Get docs needing review |
| `create-doc` | Write | Create a new doc with frontmatter |
| `update-doc` | Write | Append content or update tags on an existing doc |
| `improve-doc` | Write | Replace doc content while preserving frontmatter |
| `track-knowledge` | Write | Mark a doc as remembered / needs-review / new |

## Structure

```
src/
├── index.ts          # Entry: parses docs dir, starts MCP server
├── server.ts         # Registers all tools
├── bin/
│   └── learn-mcp.ts  # CLI binary entry
├── tools/            # One file per MCP tool
│   ├── list-categories.ts
│   ├── list-docs.ts
│   ├── read-doc.ts
│   ├── search-docs.ts
│   ├── create-doc.ts
│   ├── update-doc.ts
│   ├── improve-doc.ts
│   ├── track-knowledge.ts
│   └── get-review-list.ts
└── lib/
    ├── docs.ts       # Shared doc utilities (read, write, search)
    ├── types.ts      # TypeScript interfaces
    └── knowledge.ts  # Knowledge tracking state
```

## How It Fits Together

```
cf mcp [path]
  └─ resolves docs dir
  └─ npm install + build (one-time)
  └─ prints MCP config to add to Claude
```

Once configured, Claude can call these tools directly to read and write your learning notes without leaving the conversation.
