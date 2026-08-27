# Design system — coding-friend website

Single-page site at `website/`. Dark only. Visual reference: [dinhanhthi.com](https://dinhanhthi.com) (navbar pill, list panel hairline, muted grey).

## Detected Design System

**Style**: Minimalist dark (dinhanhthi.com) — high confidence. Reading column, hairline borders, one violet accent, ASCII diagrams instead of mermaid or icons. Dark only; no light theme.

**Colors**

- `--color-bg`: `#23262e` — page background
- `--color-nav`: `#1c1e25` — navbar
- `--color-surface`: `#2a2d36` — panel / table / list row
- `--color-surface-2`: `#31353f` — hover, table header
- `--color-code-bg`: `#1d2027` — `pre`
- `--color-border`: `rgba(255,255,255,0.08)` — hairline
- `--color-text`: `#e4e5ea` — body
- `--color-text-muted`: `#9a9ca6` — subtitle, captions (dinhanhthi.com muted grey)
- `--color-heading`: `#f5f5f7` — h1–h3
- `--color-link`: `#8ab4f8` — link
- `--color-accent`: `#a78bfa` — brand pill, `cf-*` keyword, H1

**Typography**

- Sans: `--font-sans` — Inter via `next/font/google`, then `-apple-system, "system-ui", "Segoe UI", system-ui, sans-serif`
- Mono: `--font-mono` — `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` (code and ASCII)
- h1: `2.25rem/700` (mobile `1.875rem`)
- h2: `1.5rem/600` with hairline under + `scroll-margin-top: 4.5rem`
- h3: `1.125rem/600`
- body: `1rem/1.7`
- small: `.875rem`
- code: `.875rem` (ASCII `.8125rem` on mobile)

**Spacing base**: Tailwind `0.25rem` (4px). Container `mx-auto max-w-3xl px-4 sm:px-6`. Navbar `h-14`. Section spacing `mt-14` for h2. Panel `rounded-lg`.

**Components**

- Navbar: `h-14 sticky top-0`, background `--color-nav` + `border-b`. Brand pill left (logo 24px + Coding Friend + version). Anchors to each H2 on `md+`. Hamburger below `md`. No scroll-spy, no router. Pill shape matches dinhanhthi.com.
- Panel / list: `border border-border rounded-lg bg-surface`. List panel hairline like dinhanhthi.com.
- Tables: full-width, hairline rows, no zebra.
- Code / ASCII: `pre` = panel with `bg-code-bg`, `overflow-x: auto`, no window chrome. ASCII ≤ 72 columns.
- Footer: muted line — `Made by Anh-Thi Dinh · GitHub · npm · Changelog · plugin vX · cli vY`. Version numbers are `font-mono` and link to releases / npm.
- Signature: ASCII big picture after the pitch; box-drawing `┌─┐│└┘`; arrows `→ ↓`. No gradient, animation, stat counter, or icon set.

**Notes**: Dark only. Tokens live in `@theme` in `globals.css`. One accent only (`--color-accent`). Diagrams are fenced ASCII, not mermaid or SVG.

**Do / Don't**

- Do: ASCII box-drawing, hairline, one accent.
- Don't: gradient, animation, icon set, multiple accent colors, tab/accordion.

**ASCII conventions**

- Characters: `┌─┐│└┘├┤→↓`
- ≤ 72 columns
- One cell = one concept
- Short labels
