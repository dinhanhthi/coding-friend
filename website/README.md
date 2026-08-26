# Coding Friend website

One-page site for [Coding Friend](https://github.com/dinhanhthi/coding-friend), rendered from `src/content/index.md`.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
npm start
```

## Structure

```
src/
  app/                          # Next.js App Router (`layout`, `page`)
  components/
    Navbar.tsx                  # H2 anchors (hamburger below md)
    CodeBlock.tsx               # fenced code + copy
    MdxLink.tsx                 # in-page / external links
  lib/mdx.ts                    # load index.md, slug H2s, MDX options
  content/index.md              # all page copy
```

Edit content only in `src/content/index.md`. H2 headings become navbar items. ASCII diagram conventions: [docs/DESIGN.md](../docs/DESIGN.md).

No Pagefind. No docs route — `/docs/*` redirects to `/`.
