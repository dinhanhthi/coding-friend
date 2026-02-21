# Coding Friend Website

Documentation and landing page for the [Coding Friend](https://github.com/user/coding-friend) Claude Code plugin.

Built with Next.js 15, Tailwind CSS 4, and MDX.

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
npm start
```

The build compiles all pages and runs [Pagefind](https://pagefind.app/) to index the documentation for full-text search.

## Project Structure

```
src/
  app/            # Next.js App Router pages
    docs/         # Documentation route ([[...slug]])
    changelog/    # Changelog page
  components/
    landing/      # Landing page sections (Hero, Features, HowItWorks, etc.)
    docs/         # Docs layout, sidebar, search, navigation
    layout/       # Header, Footer
    ui/           # Shared UI primitives (Container, CopyButton)
  content/
    docs/         # MDX documentation files
  lib/            # Utilities (docs loader, sidebar config)
public/
  logo.svg        # Site logo
  _pagefind/      # Generated search index (after build)
```

## Documentation

Docs are authored as `.mdx` files in `src/content/docs/`. Each file uses YAML frontmatter:

```mdx
---
title: Page Title
description: Short description for meta tags.
---

Content here...
```

Sidebar order and grouping are configured in `src/lib/sidebar.ts`.

## Deployment

Optimized for Vercel. Push to deploy.
