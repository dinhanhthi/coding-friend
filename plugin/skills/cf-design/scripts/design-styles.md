# Design Styles Reference

A curated reference of common UI design styles. Use this to identify what style a project uses (scan mode) or help the user articulate what they want (design/modify mode).

---

## Minimalism

**Visual signature**: Lots of white space, very few decorative elements, restrained color palette (often 1-2 accent colors on neutral), thin or light typography, generous padding.

**Common signals in code**: `font-light`, `tracking-wide`, `text-neutral-500`, large `py-*`/`gap-*` values, `max-w-prose`, very few `shadow-*` classes.

**Best for**: SaaS, productivity tools, editorial, writing apps, developer tools.

**Anti-patterns to avoid**: cluttered nav, busy gradients, too many font weights.

---

## Flat Design

**Visual signature**: No shadows or gradients, solid fills, geometric shapes, bold solid colors, clear borders. Often uses a vivid but limited palette.

**Common signals in code**: No `shadow-*`, no `bg-gradient-*`, `rounded-none` or `rounded-sm`, bold color classes (`bg-blue-600`, `bg-red-500`), `border-2`.

**Best for**: Dashboards, admin panels, mobile apps, educational tools.

---

## Material Design

**Visual signature**: Layered paper-like surfaces with distinct elevation shadows, bold typography (Roboto), strong use of primary color, ripple interactions, defined grid.

**Common signals in code**: `shadow-md`/`shadow-lg` on cards, `font-roboto`, `rounded-sm`, FAB buttons, `bg-primary` with `text-on-primary`.

**Best for**: Android apps, Google ecosystem, enterprise web apps.

---

## Glassmorphism

**Visual signature**: Frosted glass panels with blur backdrop, semi-transparent backgrounds, subtle border on light side, layered depth. Works best on colorful backgrounds.

**Common signals in code**: `backdrop-blur-*`, `bg-white/10` or `bg-white/20`, `border border-white/20`, `bg-opacity-*`, layered `z-*` values.

**Best for**: Landing pages, dashboards with visual backgrounds, authentication screens, portfolio sites.

**Caution**: Overuse makes UI feel muddy. Use for 1-2 focal elements max.

---

## Neumorphism / Soft UI

**Visual signature**: Soft extruded elements that appear pressed into or raised from a monochromatic background. Dual shadows (light top-left, dark bottom-right), very low contrast, tactile feel.

**Common signals in code**: `shadow` with dual values in CSS (e.g., `6px 6px 12px #b8b9be, -6px -6px 12px #ffffff`), `bg-gray-200`, `rounded-2xl`, very limited color palette.

**Best for**: Mobile UI concepts, smart home dashboards, music/audio apps, premium calculator apps.

**Caution**: Accessibility issues (low contrast). Use WCAG AA checker.

---

## Dark Mode First

**Visual signature**: Dark surfaces as primary background (not just inverted light mode). Uses dark palette systematically: surface/background/overlay layers. Accent colors are often vibrant against dark.

**Common signals in code**: `dark:` prefix everywhere, `bg-zinc-900`/`bg-slate-900`/`bg-gray-950`, `text-white`/`text-gray-100`, `border-gray-800`, vibrant `text-violet-400`/`text-cyan-400` accents.

**Best for**: Developer tools, code editors, media apps, gaming, terminal-adjacent products.

---

## Light & Airy

**Visual signature**: Very light backgrounds (near-white, light gray, warm cream), delicate shadows, soft rounded corners, pastel accents, lots of breathing room.

**Common signals in code**: `bg-gray-50`/`bg-slate-50`/`bg-stone-50`, `shadow-sm`, `rounded-xl`/`rounded-2xl`, `text-gray-600`, `border-gray-100`, soft `ring-*` focus styles.

**Best for**: Health & wellness, lifestyle, e-commerce, food & beverage, personal blogs.

---

## Brutalism / Neo-Brutalism

**Visual signature**: Harsh black borders, raw/exposed structure, unpolished aesthetic with intention, high contrast, limited palette (often black + 1 bold color), offset shadows, strong typography.

**Common signals in code**: `border-2 border-black`/`border-4 border-black`, `shadow-[4px_4px_0px_black]`, `font-black`, `uppercase`, `rounded-none`, `bg-yellow-300`/`bg-lime-400`/`bg-pink-400`.

**Best for**: Creative agencies, portfolios, indie products, gaming, anything wanting to stand out.

---

## Swiss / International (Grid-based)

**Visual signature**: Strong typographic hierarchy, strict grid alignment, red+black+white palette (or similar), geometric sans-serif fonts, minimal decoration, functional beauty.

**Common signals in code**: `grid` with explicit columns, `font-mono`/`font-helvetica`, `text-red-600 font-bold uppercase tracking-widest` for labels, very structured spacing, `border-l-4 border-red-600`.

**Best for**: Design studios, editorial, annual reports, cultural institutions, architectural firms.

---

## Enterprise / SaaS

**Visual signature**: Dense information display, secondary sidebar nav, data tables, utility-first layout, professional color palette (blues, teals, grays), small typography, clear visual hierarchy for scanning.

**Common signals in code**: `text-sm` dominant, `px-4 py-2` tables, sidebar `w-64`, `text-blue-600` links, `bg-white border border-gray-200 rounded` cards, `hover:bg-gray-50` rows.

**Best for**: B2B software, dashboards, admin panels, analytics tools, CRMs.

---

## E-commerce / Retail

**Visual signature**: Product-first layout, image-heavy cards, clear pricing hierarchy, trust badges, CTA prominence (often orange or green), sale/discount styling.

**Common signals in code**: `aspect-square`/`aspect-[3/4]` images, `line-through text-gray-400` for original price, `bg-red-100 text-red-700` for sale badges, `shadow-hover` on product cards, sticky add-to-cart.

**Best for**: Online stores, marketplaces, product landing pages.

---

## Dashboard / Data-heavy

**Visual signature**: Metric cards, charts and graphs, data tables, status indicators (colored dots/badges), sidebar navigation, dense but scannable layout.

**Common signals in code**: `grid grid-cols-4` for stat cards, `recharts`/`chart.js` components, `text-2xl font-bold` metrics with `text-sm text-gray-500` labels, colored `Badge` components.

**Best for**: Analytics platforms, monitoring tools, business intelligence, reporting.

---

## Mobile-First / App-like

**Visual signature**: Bottom navigation, full-width tap targets, large touch areas, swipe gestures, card-based content, native-feel transitions, status bar awareness.

**Common signals in code**: `fixed bottom-0`, `min-h-[44px]` touch targets, `safe-area-inset-*`, `overflow-hidden` on containers, iOS-style `rounded-2xl` cards with subtle shadows.

**Best for**: PWAs, React Native web shells, mobile-first products.

---

## Micro-interaction Rich

**Visual signature**: Subtle but plentiful animations — hover state transitions, loading skeletons, count-up numbers, spring animations, gesture responses. The UI feels alive.

**Common signals in code**: `transition-all duration-200`, `framer-motion` or `@spring-ui/react`, `animate-*` classes, `skeleton` components, `hover:-translate-y-1`.

**Best for**: Consumer apps, social products, onboarding flows, premium product sites.

---

## Aurora / Gradient-first

**Visual signature**: Soft radial gradients in background ("aurora" effect), blurred color blobs, gradient text, glassmorphic elements on top, dark or near-dark base.

**Common signals in code**: `bg-gradient-to-*`, `blur-3xl` colored divs as decorative elements, `bg-clip-text text-transparent`, `from-violet-500 to-cyan-500`, multiple `opacity-20`/`opacity-30` blobs.

**Best for**: AI/tech startups, SaaS landing pages, Web3 products, developer tools.

---

## How to Use This Reference

**For scan mode**: Compare what you see in the codebase against these signatures. Multiple styles can co-exist (e.g., "Enterprise SaaS with Dark Mode First" is common). Pick the 1-2 that match best.

**For design mode**: When the user describes what they want ("modern and clean", "bold and eye-catching"), map their adjectives to styles here, then apply the corresponding visual patterns.

**For modify mode**: Confirm the project's detected style, then ensure modifications stay within that style's characteristic patterns.
