import chalk from "chalk";

export const log = {
  info: (msg: string) => console.log(chalk.blue("ℹ"), msg),
  success: (msg: string) => console.log(chalk.green("✔"), msg),
  congrats: (msg: string) => console.log(chalk.green("🎉"), msg),
  warn: (msg: string) => console.log(chalk.yellow("⚠"), msg),
  error: (msg: string) => console.log(chalk.red("✖"), msg),
  step: (msg: string) => console.log(chalk.cyan("→"), msg),
  dim: (msg: string) => console.log(chalk.dim(msg)),
};

/** Count the visual width of a string in terminal columns. */
function visualWidth(str: string): number {
  // Match emoji sequences (including modifiers, ZWJ sequences, keycap, flags)
  const emojiRe =
    /\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3/gu;
  let width = 0;
  let lastIndex = 0;
  for (const m of str.matchAll(emojiRe)) {
    // Characters before this emoji: 1 column each
    width += m.index! - lastIndex;
    // Each emoji takes 2 terminal columns
    width += 2;
    lastIndex = m.index! + m[0].length;
  }
  // Remaining characters after last emoji
  width += str.length - lastIndex;
  return width;
}

/**
 * Print a boxed banner with colored border.
 * Example output:
 *   ┌──────────────────────────────────┐
 *   │   ✨ Coding Friend Update ✨    │
 *   └──────────────────────────────────┘
 */
export function printBanner(
  title: string,
  opts: { color?: (s: string) => string } = {},
): void {
  const colorFn = opts.color ?? chalk.green;
  const padding = 3;
  const pad = " ".repeat(padding);
  const inner = `${pad}${title}${pad}`;
  const vw = visualWidth(inner);
  const top = `┌${"─".repeat(vw)}┐`;
  const mid = `│${inner}│`;
  const bot = `└${"─".repeat(vw)}┘`;
  console.log(colorFn(top));
  console.log(colorFn(mid));
  console.log(colorFn(bot));
}

/**
 * Print multi-line content wrapped in a light box frame.
 * Each line is padded to the widest visible width. Useful for framing
 * code snippets or JSON config blocks in CLI output.
 */
export function printBoxed(
  content: string,
  opts: { color?: (s: string) => string; padding?: number } = {},
): void {
  const colorFn = opts.color ?? chalk.dim;
  const padding = opts.padding ?? 1;
  const pad = " ".repeat(padding);
  const trimmed = content.replace(/^\n+|\n+$/g, "");
  if (trimmed === "") return;
  const lines = trimmed.split("\n");
  const maxW = Math.max(...lines.map(visualWidth));
  const innerW = maxW + padding * 2;
  const top = `┌${"─".repeat(innerW)}┐`;
  const bot = `└${"─".repeat(innerW)}┘`;
  console.log(colorFn(top));
  for (const line of lines) {
    const gap = " ".repeat(maxW - visualWidth(line));
    console.log(`${colorFn("│")}${pad}${line}${gap}${pad}${colorFn("│")}`);
  }
  console.log(colorFn(bot));
}
