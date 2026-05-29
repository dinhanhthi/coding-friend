# coding-friend-learn-host

Next.js app that renders your `/cf-learn` docs as a browsable website with search, categories, and dark mode.

## Usage (via CLI)

```bash
cf learn host               # serves docs/learn/ on port 3333
cf learn host ./my-docs     # serves a custom directory
cf learn host -p 4000       # custom port
```

The CLI handles deps install, build, and serving automatically.

## Local Development

Run the app directly without the CLI — useful when working on the UI itself.

### 1. Install dependencies

```bash
cd cli/lib/learn-host
npm install
```

### 2. Point to a docs directory

The app reads the docs directory from the `DOCS_DIR` env var, which the CLI sets by resolving (in order):

1. Explicit path argument (`cf learn host <path>`)
2. Global `~/.coding-friend/config.json` → `learn.outputDir`
3. Default: `~/.coding-friend/learn`

For local dev, set `DOCS_DIR` to any directory with the expected structure:

```
docs/
└── learn/
    ├── category-one/
    │   ├── my-doc.md
    │   └── another-doc.md
    └── category-two/
        └── some-doc.md
```

Each `.md` file should have frontmatter:

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

### 3. Run dev server

```bash
# Point to this repo's own learn docs (if they exist)
DOCS_DIR=../../../docs/learn npm run dev

# Or point to any other project's docs
DOCS_DIR=/path/to/your/project/docs/learn npm run dev
```

App runs at `http://localhost:3333`.

> **Note:** `npm run dev` does not rebuild the Pagefind search index. If you've previously run `npm run build`, search will still work but uses the old index — new or edited docs won't appear in search results until you build again.

### 4. Full build (with search)

```bash
DOCS_DIR=/path/to/docs npm run build
npx next start -p 3333
```

`postbuild` runs `pagefind` to index docs for full-text search.

## Structure

```
src/
├── app/
│   ├── page.tsx                   # Homepage: recent docs, categories, tags
│   ├── [category]/page.tsx        # Category listing
│   ├── [category]/[slug]/page.tsx # Individual doc
│   └── layout.tsx
├── components/
│   ├── MarkdownRenderer.tsx       # Renders .md with syntax highlighting
│   ├── TableOfContents.tsx        # Auto-generated from headings
│   ├── Sidebar.tsx                # Category navigation
│   ├── PagefindSearch.tsx         # Full-text search (build-time index)
│   └── ThemeToggle.tsx
└── lib/
    ├── docs.ts                    # getAllDocs, getDocBySlug, etc.
    └── types.ts
```

## How It Fits Together

```
cf learn host [path]
  └─ resolves docs dir
  └─ npm install (one-time)
  └─ npm run build  (with DOCS_DIR env)
  └─ npx next start -p 3333  (with DOCS_DIR env)
```

ISR (Incremental Static Regeneration) is enabled, so new or edited docs appear on the next page refresh without a rebuild.
