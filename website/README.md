# Coding Friend website

Site for [Coding Friend](https://github.com/Coprimal/coding-friend) at `cf.coprimal.dev`: a landing page, the docs and a privacy page, all on one header, footer and stylesheet.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build   # static export into out/
```

## Routes

- `/`: landing (`src/app/page.tsx`). Hosts and the install prompt are read from `src/content/index.md`, so they stay in sync with the docs.
- `/docs/`: all of `src/content/index.md`, with a table of contents (`src/app/docs/page.tsx`).
- `/privacy/`: `src/app/privacy/page.tsx`. Every statement there was checked against the code; check it again when a feature starts storing data or going online.

Old links to the home page (`cf.coprimal.dev/#memory`, printed by shipped CLIs) move to the same anchor on `/docs/` (`LegacyHashRedirect`). Landing section ids must not reuse a docs heading id, or that link stops redirecting. Old `/docs/<page>` paths go to `/docs/` (`not-found.tsx`).

## Structure

```
src/
  app/                       # layout (shared header/footer), page, docs/, privacy/, not-found
  components/
    SiteHeader.tsx, SiteFooter.tsx
    landing/                 # SessionDemo (hero), LoopTrack, Scenes, HostBars, InstallTabs
    TableOfContents.tsx      # docs + privacy
  lib/landing.ts             # host table, install prompt, legacy hash (tested)
  lib/mdx.ts                 # load index.md, heading ids, MDX options
  content/index.md           # all docs copy
```

Edit docs content only in `src/content/index.md`. Design: tokens in `src/app/tokens.css`, everything else in `src/app/globals.css`.
