/**
 * Build decorated status frames for memory store/update operations.
 * Shows what was saved (markdown file, database) in a visual box.
 */

interface StoreStatusInput {
  id: string;
  title: string;
  markdownPath: string;
  dbPath: string | null;
  claudeMdUpdated?: boolean;
  warning?: string;
}

interface UpdateStatusInput {
  id: string;
  title: string;
  markdownPath: string;
  dbPath: string | null;
  claudeMdUpdated?: boolean;
}

/**
 * Estimate visual display width of a string.
 * Emojis count as 2 columns, variation selectors and zero-width joiners as 0.
 */
function visualWidth(s: string): number {
  // Strip ANSI escape codes
  // eslint-disable-next-line no-control-regex
  const clean = s.replace(/\u001b\[[0-9;]*m/g, "");
  let width = 0;
  for (const ch of clean) {
    const code = ch.codePointAt(0)!;
    // Zero-width: variation selectors, ZWJ, combining marks
    if (
      (code >= 0xfe00 && code <= 0xfe0f) || // variation selectors
      code === 0x200d || // ZWJ
      (code >= 0x0300 && code <= 0x036f) // combining diacritical marks
    ) {
      continue;
    }
    // Emoji and wide characters count as 2
    if (
      code > 0x1f000 || // supplementary emoji
      (code >= 0x2600 && code <= 0x27bf) || // misc symbols, dingbats
      (code >= 0x2300 && code <= 0x23ff) || // misc technical (⌚ etc.)
      (code >= 0x2700 && code <= 0x27bf) || // dingbats
      (code >= 0x1f300 && code <= 0x1f9ff) // emoji range
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

function buildFrame(lines: string[]): string {
  const maxLen = Math.max(...lines.map((l) => visualWidth(l)));
  const top = `╭${"─".repeat(maxLen + 2)}╮`;
  const bottom = `╰${"─".repeat(maxLen + 2)}╯`;
  const padded = lines.map((l) => {
    const visible = visualWidth(l);
    return `│ ${l}${" ".repeat(maxLen - visible)} │`;
  });
  return [top, ...padded, bottom].join("\n");
}

export function buildStoreStatus(input: StoreStatusInput): string {
  const lines: string[] = [
    `✅ Memory stored`,
    ``,
    `   ID:       ${input.id}`,
    `   Title:    ${input.title}`,
    ``,
    `📄 Markdown: ${input.markdownPath}`,
  ];

  if (input.dbPath) {
    lines.push(`🗄️  Database: ${input.dbPath}`);
  }

  if (input.claudeMdUpdated) {
    lines.push(`📋 CLAUDE.md updated`);
  }

  if (input.warning) {
    lines.push(``);
    lines.push(`⚠ ${input.warning}`);
  }

  return buildFrame(lines);
}

export function buildUpdateStatus(input: UpdateStatusInput): string {
  const lines: string[] = [
    `✅ Memory updated`,
    ``,
    `   ID:       ${input.id}`,
    `   Title:    ${input.title}`,
    ``,
    `📄 Markdown: ${input.markdownPath}`,
  ];

  if (input.dbPath) {
    lines.push(`🗄️  Database: ${input.dbPath}`);
  }

  if (input.claudeMdUpdated) {
    lines.push(`📋 CLAUDE.md updated`);
  }

  return buildFrame(lines);
}
