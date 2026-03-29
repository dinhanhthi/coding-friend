/**
 * Build status output for memory store/update operations.
 * Shows what was saved (markdown file, database) as a simple list with icons.
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

export function buildStoreStatus(input: StoreStatusInput): string {
  const lines: string[] = [
    `✅ Memory stored`,
    `   ID:       ${input.id}`,
    `   Title:    ${input.title}`,
    `📄 Markdown: ${input.markdownPath}`,
  ];

  if (input.dbPath) {
    lines.push(`🗄️  Database: ${input.dbPath}`);
  }

  if (input.claudeMdUpdated) {
    lines.push(`📋 CLAUDE.md updated`);
  }

  if (input.warning) {
    lines.push(`⚠ ${input.warning}`);
  }

  return lines.join("\n");
}

export function buildUpdateStatus(input: UpdateStatusInput): string {
  const lines: string[] = [
    `✅ Memory updated`,
    `   ID:       ${input.id}`,
    `   Title:    ${input.title}`,
    `📄 Markdown: ${input.markdownPath}`,
  ];

  if (input.dbPath) {
    lines.push(`🗄️  Database: ${input.dbPath}`);
  }

  if (input.claudeMdUpdated) {
    lines.push(`📋 CLAUDE.md updated`);
  }

  return lines.join("\n");
}
