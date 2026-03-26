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

/**
 * Print a boxed banner with green border.
 * Example output:
 *   ┌──────────────────────────────────┐
 *   │   ✨ Coding Friend Update ✨     │
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
  const width = inner.length;
  const top = `┌${"─".repeat(width)}┐`;
  const mid = `│${inner}│`;
  const bot = `└${"─".repeat(width)}┘`;
  console.log(colorFn(top));
  console.log(colorFn(mid));
  console.log(colorFn(bot));
}
