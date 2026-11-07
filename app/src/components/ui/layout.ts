/**
 * Layout class strings shared by the views inside the pane. Every flex ancestor of a
 * scrolling column needs `min-h-0`, so the chain lives here: VIEW → SPLIT → LIST / DETAIL,
 * or VIEW → SCROLL → READING.
 */

/** Root of every view, directly under the pane. */
export const VIEW = "flex min-h-0 flex-1 flex-col";
/** A body that scrolls as a whole (reading views). */
export const SCROLL =
  "min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]";
/** Reading width for text-heavy views (Doctor, Version, Settings, Config). */
export const READING = "mx-auto flex w-full max-w-4xl flex-col gap-8 px-8 py-6";

/** A list column beside a detail column; both scroll on their own. */
export const SPLIT = "flex min-h-0 flex-1";
/** The list column. The caller adds its width (`w-72`, `w-60`). */
export const LIST =
  "flex shrink-0 flex-col gap-1 overflow-y-auto border-r border-rule p-2 [scrollbar-gutter:stable]";
export const DETAIL =
  "flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5 [scrollbar-gutter:stable]";

/** Text inputs, selects and textareas. The caller adds height and padding. */
export const CONTROL =
  "rounded-md border border-rule bg-control px-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50";

/** Segmented control (tabs, radio groups): a capsule of pills. */
export const SEGMENTS =
  "flex shrink-0 items-center gap-0.5 rounded-full border border-rule bg-control p-0.5";
export const SEGMENT =
  "h-6 rounded-full px-2.5 text-xs text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50";
export const SEGMENT_ON = "bg-paper-3 font-medium text-ink";
