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
