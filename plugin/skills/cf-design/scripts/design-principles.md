# Design Principles Reference

Core principles to apply when designing or modifying UI. Read this in Design and Modify modes to guide implementation decisions.

---

## 1. Visual Hierarchy

Every screen has one primary action or piece of information. Everything else supports it.

**In practice:**

- Size: 3-4 sizes max (hero, heading, body, caption). Don't use 6 font sizes.
- Weight: 2-3 weights max (regular + semibold + bold). Don't use `font-medium` for everything.
- Color: High contrast = important. Low contrast = supporting. Never invert this.
- Space: More breathing room = more important. Tight = less important.

**Anti-pattern**: everything is `text-base font-medium text-gray-700` — nothing stands out.

---

## 2. Color (60-30-10 Rule)

- **60%** Dominant: neutral/surface color (background, cards, large areas)
- **30%** Secondary: supporting tone (sidebars, secondary buttons, borders)
- **10%** Accent: brand/action color (CTAs, links, highlights)

**In practice:**

- Extract exact values from DESIGN_PATTERNS.md — never guess "a blue"
- Semantic colors must be consistent: success = green (always), error = red (always), etc.
- Dark mode: rethink the palette, don't just invert. Dark surfaces are not `bg-white opacity-5`.

**Anti-pattern**: 8 different grays used inconsistently, 3 shades of blue with no rule.

---

## 3. Typography

A good type system needs only 2 families: one for UI (sans-serif) and optionally one for reading (serif or different sans). Mono is a bonus for code.

**Scale**: use a modular scale (1.25 or 1.333 ratio). Avoid arbitrary sizes like `text-[13px]` or `text-[17px]`.

**Line height**: body text at 1.5–1.7. Headings at 1.1–1.3. Don't use the same line-height everywhere.

**Letter spacing**: headings can go tighter (`-0.02em`). Small caps/labels often go wider (`0.05em`–`0.1em`). Body stays at 0.

**Max line length**: 60–75 characters for reading text (`max-w-prose`). Wider for UI elements.

**Anti-pattern**: all text is `font-sans text-base` with no scale, no weight variation, no line-height intentionality.

---

## 4. Spacing System

Pick a base unit (4px or 8px) and stick to it. Every padding, margin, and gap should be a multiple of this unit.

**Common scales:**

- Tailwind: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 (multiples of 4px)
- Compact: 2, 4, 8, 16, 24, 32, 48
- Generous: 8, 16, 24, 40, 64, 96

**Never**: mix `p-3 mt-5 mb-7` — these are arbitrary values that break rhythm.

**Section spacing**: sections breathe more than components. Use 2-3x the component gap for section separators.

**Anti-pattern**: `padding: 13px`, `margin-top: 22px` — arbitrary values that create invisible discord.

---

## 5. Contrast & Accessibility

WCAG AA minimum:

- Normal text (< 18px): **4.5:1** contrast ratio
- Large text (≥ 18px or ≥ 14px bold): **3:1** contrast ratio
- UI components (borders, icons): **3:1** contrast ratio

**In practice:**

- `text-gray-500 on bg-white` = 3.95:1 — FAILS for body text
- `text-gray-600 on bg-white` = 5.74:1 — passes
- `text-gray-400 on bg-gray-100` = very low — common mistake in disabled states
- Use a checker if unsure: https://webaim.org/resources/contrastchecker/

**Anti-pattern**: muted placeholder text that's unreadable, ghost buttons with 1.5:1 contrast.

---

## 6. Borders and Shape

Border radius signals personality:

- `rounded-none`: rigid, professional, brutalist
- `rounded-sm` / `rounded`: neutral, clean, enterprise
- `rounded-md` / `rounded-lg`: friendly, modern, approachable
- `rounded-xl` / `rounded-2xl`: soft, consumer, mobile-first
- `rounded-full`: pill badges, avatars, tags only — not for full cards

**Consistency rule**: pick 2-3 radius values for your system and use them consistently. Don't use 6 different border-radius values.

**Borders**: use borders OR shadows for depth, rarely both. A card with `border` AND `shadow-lg` is visually noisy.

---

## 7. Motion Principles

Animation should have purpose. Never animate for the sake of it.

**Duration scale**:

- Micro (hover, focus): 100–150ms
- Standard (appear, expand): 200–300ms
- Deliberate (modal, slide): 300–500ms
- Never > 500ms for UI transitions

**Easing**: use `ease-out` for elements entering the screen (fast start, slow end = natural). Use `ease-in` for leaving. Use `ease-in-out` for shifting.

**Respect motion preferences**: always add `prefers-reduced-motion` media query support when adding animations.

**Anti-pattern**: 1s transition on hover, `ease-linear` on everything, animating layout properties (width, height) instead of transform/opacity.

---

## 8. Layout Patterns

**Grid first**: prefer CSS Grid or Tailwind `grid` for layout. Flexbox for alignment within a grid cell.

**Consistent max-widths**: define 2-3 container sizes and use them consistently (e.g., `max-w-5xl` for content, `max-w-7xl` for full layout, `max-w-prose` for reading).

**Responsive**: mobile-first. Start with the narrow layout, add `md:` and `lg:` breakpoints. Don't design desktop-first and add `sm:` as an afterthought.

**Alignment**: align to a consistent baseline. Don't mix left-aligned and centered text at the same hierarchy level without intent.

---

## Anti-Patterns to Avoid (AI-Generic Output)

These are the telltale signs of AI-generated UI that looks like every other AI-generated UI:

1. **Center-everything layout**: hero → `flex flex-col items-center text-center` for everything
2. **Gray-on-gray text**: `text-gray-500` on `bg-gray-50` — technically valid, visually flat
3. **Font-medium everything**: every text element at `font-medium`, no weight variation
4. **`space-y-4` everywhere**: uniform spacing between all elements regardless of relationship
5. **Generic gradients**: `from-purple-600 to-blue-600` as a background with no thought
6. **Shadow soup**: `shadow-lg` on every card, every button, every section
7. **Arbitrary icon sizing**: `w-5 h-5` on some icons, `w-6 h-6` on others, `w-4 h-4` on others
8. **Blue links always**: every interactive element defaults to `text-blue-600` regardless of design language
9. **CTA overdose**: 3-4 `bg-purple-600` buttons on the same screen with the same visual weight
10. **Lorem ipsum**: always use realistic placeholder content — it reveals design problems early

The fix: make 3-5 intentional decisions per component and commit to them.
