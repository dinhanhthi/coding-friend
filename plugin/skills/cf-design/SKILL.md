---
name: cf-design
description: >
  UI design workflow — scan existing UI patterns, design new UI from a description, or modify
  existing UI while keeping it visually consistent with the rest of the project.

  Use when the user wants to: design or redesign a component, page, or section; change colors,
  typography, spacing, or visual style; understand the project's current design system; add new
  UI that should match existing patterns; or ensure a UI change doesn't look out of place. Use
  when the user says things like "make it look like", "update the styling", "redesign this",
  "match the existing style", "what design patterns does this project use", "extract the design
  system", "add a dark mode", "make it more minimal/bold/clean", or describes a desired visual
  outcome. Invoke via /cf-design — helps Claude produce intentional, consistent UI.
---

# /cf-design

Design UI with intent and consistency: **$ARGUMENTS**

## Modes

Three modes, triggered by the first word of `$ARGUMENTS`:

| Invocation                          | Mode       | Purpose                                                                                     |
| ----------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| `/cf-design scan [path]`            | **Scan**   | Read existing UI files → extract design patterns → save to `docs/memory/DESIGN_PATTERNS.md` |
| `/cf-design [description]`          | **Design** | Implement new UI from the user's description, using existing patterns as a base             |
| `/cf-design modify [what] -- [how]` | **Modify** | Change a specific UI element, enforcing consistency with existing patterns                  |

If `$ARGUMENTS` is empty, ask the user which mode they want and what their goal is.

---

## Step 0: Custom Guide

Run: `bash "${CLAUDE_PLUGIN_ROOT}/lib/load-custom-guide.sh" cf-design`

If output is non-empty, integrate returned sections: `## Before` → before first step, `## Rules` → apply throughout, `## After` → after final step.

## Step 0.5: Load Existing Design Context

Run: `bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-design/scripts/load-design-context.sh"`

- If `DESIGN_PATTERNS.md` exists: read it now and keep it in working memory for all subsequent steps. This is the project's source of truth for visual style.
- If not found: note that patterns are unknown and will either be extracted (scan mode) or defined fresh.

## Step 1: Determine Mode

Parse `$ARGUMENTS`:

- Empty → ask the user: _"What would you like to do? (a) scan existing UI patterns, (b) design something new, or (c) modify a specific element?_"
- First word is `scan` (case-insensitive) → **Scan mode** (Step 2)
- First word is `modify` (case-insensitive) → **Modify mode** (Step 4)
- Anything else → **Design mode** (Step 3)

---

## Step 2: Scan Mode

Goal: understand the project's visual DNA and write it down so every future design decision can be consistent.

1. **Determine scope**: use the path from `$ARGUMENTS` (after "scan") if provided. Default: look in `src/`, `app/`, `components/`, `styles/`, or wherever UI files live in this project.

2. **Read the design styles reference** to calibrate what you're looking for:

   ```
   Read: ${CLAUDE_PLUGIN_ROOT}/skills/cf-design/scripts/design-styles.md
   ```

3. **Scan UI files** — look for and extract:
   - **Colors**: hex/rgb/hsl values, CSS custom properties (`--color-*`), Tailwind color classes, theme objects. Group into: primary, secondary/accent, neutral/surface, semantic (success/error/warning).
   - **Typography**: font families, size scale, weight usage, line-height, letter-spacing. Note any heading/body/mono split.
   - **Spacing**: recurring gap/padding/margin values. Identify the base unit (4px? 8px? rem-based?).
   - **Shape**: border-radius values, shadow definitions, outline styles.
   - **Motion**: transition durations, easing functions, animation names.
   - **Layout patterns**: grid columns, max-widths, breakpoints, container widths.
   - **Component patterns**: how buttons, cards, inputs, badges, navbars are styled. Note variations (primary vs ghost button, etc.).
   - **Dark/light mode**: how it's implemented (class-based, media query, CSS vars).
   - **Overall style**: use `design-styles.md` to identify the closest matching style(s) and confidence.

4. **Show findings to the user** for confirmation before saving. Format:

   ```
   ## Detected Design System

   **Style**: [e.g., "Minimalist Dark with subtle glassmorphism — high confidence"]

   **Colors**
   - Primary: #... (used for CTA, links)
   - ...

   **Typography**
   - Headings: [font], weights [bold/semibold]
   - Body: [font], size [base], leading [...]
   - ...

   **Spacing base**: [4px / 8px / 0.25rem / ...]

   **Components**
   - Buttons: [description]
   - Cards: [description]
   - ...

   **Notes**: [any unique patterns, inconsistencies, or surprises]
   ```

   Ask: _"Does this look right? Anything to correct or add before I save?"_

5. **Save** to `{docsDir}/memory/DESIGN_PATTERNS.md` after confirmation. Use the format shown in the output example above.

6. Suggest running `/cf-remember` to index this file so it can be recalled in future sessions.

---

## Step 3: Design Mode

Goal: implement intentional, project-consistent UI from a description. Avoid generic, AI-looking defaults.

1. **Read design principles**:

   ```
   Read: ${CLAUDE_PLUGIN_ROOT}/skills/cf-design/scripts/design-principles.md
   ```

2. **Parse the user's description** — extract:
   - _What_ to build (component, page section, feature)
   - _Style intent_ (adjectives: clean, bold, playful, serious, minimal, rich)
   - _Color preferences_ (if any specified)
   - _Specific patterns_ or frameworks mentioned (Tailwind, shadcn, plain CSS, etc.)

3. **Choose design foundation**:
   - If `DESIGN_PATTERNS.md` exists → use it as the design foundation. The user's description refines on top.
   - If no patterns exist → ask: _"No design patterns found. Should I (a) quick-scan the UI first, or (b) design fresh from your description?"_

4. **Research if needed**: If the user asks for a specific style, trend, or technique you want to verify is current, use WebSearch:
   - Query pattern: `"[style name] UI design [year] best practices"`
   - Example: `"glassmorphism UI 2024 best practices"`
   - Extract 2-3 specific, applicable techniques from the results. Summarize briefly.

5. **Draft a design spec** — before writing code, show a brief spec:

   ```
   ## Design Spec: [component name]

   Base: [existing system / fresh]
   Colors: [specific values]
   Typography: [choices]
   Spacing: [approach]
   Shape/Shadow: [choices]
   Key decisions: [1-2 intentional choices that make this non-generic]
   ```

   Keep it short (5-8 lines). This isn't a full document — it's a checkpoint so the user can redirect before you code.

6. **Implement** — apply the design dials below to avoid AI-generic output:

   **Design dials** (apply intentionally, not by default):
   - **Layout variance**: prefer grid-based, asymmetric, or purposeful alignment over "stack everything centered"
   - **Spacing intentionality**: use the project's spacing scale — never arbitrary px values
   - **Color specificity**: use exact palette colors from DESIGN_PATTERNS.md, never generic `blue-500` defaults
   - **Weight variation**: vary font weights to create hierarchy — don't default to `font-medium` everywhere
   - **Detail moments**: add one small detail that shows intention (subtle gradient, specific shadow, slight border)

7. **After implementation**: ask _"Want me to save these patterns to DESIGN_PATTERNS.md?"_ If yes, update the file and suggest `/cf-remember`.

---

## Step 4: Modify Mode

Goal: change a specific part of the UI without breaking the visual consistency of the rest.

1. **Parse** `$ARGUMENTS`:
   - _What_ to modify = text before `--` (e.g., "the navbar")
   - _How_ to change it = text after `--` (e.g., "make it sticky with blur backdrop")
   - If no `--` separator: ask the user to clarify what they want changed and how.

2. **Require design context**: DESIGN_PATTERNS.md must exist. If it doesn't:
   - Run a quick scan (abbreviated Step 2) focused on the specific component/area being modified.
   - Save results before proceeding.

3. **Analyze the modification** against the existing patterns:
   - Does the change introduce new colors? Do they fit the palette?
   - Does it use different spacing? Is it on-scale?
   - Does it introduce a new pattern (animation, glassmorphism, etc.)? Does it fit the style?
   - If something diverges, explain why it's intentional and worth the consistency trade-off.

4. **Research if needed**: for specific techniques (e.g., "blur backdrop", "scroll-triggered animation"), use WebSearch to find the current best implementation approach.

5. **Implement** — apply the same design dials from Step 3. Stay within the existing system unless the user explicitly wants to diverge.

6. **Show a before/after summary**:
   ```
   Before: [describe previous state briefly]
   After:  [describe what changed and why it fits]
   ```

---

## General Guidance

- **Don't generate filler content** — use realistic placeholder text (not "Lorem Ipsum"), real icon names, real color values.
- **Match the tech stack** — if the project uses Tailwind, use Tailwind classes. If it uses CSS modules, use those. Read existing files to confirm before generating.
- **Progressive complexity** — implement the simplest version that satisfies the description first, then offer to add complexity (animations, responsive variants, dark mode) as follow-ups.
- **Prefer existing patterns** — reuse component variants, spacing scale, and color tokens from DESIGN_PATTERNS.md rather than introducing new values.
