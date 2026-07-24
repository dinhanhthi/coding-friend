import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "fs";
import { join, relative } from "path";

import { confirm, input, select } from "@inquirer/prompts";
import chalk from "chalk";

import { loadConfig, resolveMemoryDir } from "../lib/config.js";
import { log, printBanner } from "../lib/log.js";
import { resolvePath } from "../lib/paths.js";

type DateRange =
  | "more_than_1_day"
  | "more_than_3_days"
  | "more_than_1_week"
  | "more_than_1_month"
  | "more_than_1_year"
  | "before_date"
  | "all";

const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})/;

export function parseDateFromName(name: string): Date | null {
  const m = DATE_PREFIX_RE.exec(name);
  if (!m) return null;
  const d = new Date(`${m[1]}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}

export function getEffectiveDate(entryPath: string, name: string): Date {
  const fromName = parseDateFromName(name);
  if (fromName) return fromName;
  try {
    return new Date(statSync(entryPath).mtime);
  } catch {
    return new Date(0);
  }
}

export function olderThanDays(date: Date, days: number, now: Date): boolean {
  return now.getTime() - date.getTime() > days * 24 * 60 * 60 * 1000;
}

export function matchesRange(
  entryPath: string,
  name: string,
  range: DateRange,
  cutoff: Date | null,
  now: Date,
): boolean {
  if (range === "all") return true;
  const date = getEffectiveDate(entryPath, name);
  switch (range) {
    case "more_than_1_day":
      return olderThanDays(date, 1, now);
    case "more_than_3_days":
      return olderThanDays(date, 3, now);
    case "more_than_1_week":
      return olderThanDays(date, 7, now);
    case "more_than_1_month":
      return olderThanDays(date, 30, now);
    case "more_than_1_year":
      return olderThanDays(date, 365, now);
    case "before_date":
      return cutoff !== null && date.getTime() < cutoff.getTime();
  }
}

// First token after `status:`, stopping at whitespace or an inline `# comment`
// (plan templates ship the field with a trailing `# ...` note).
const STATUS_RE = /^status:\s*([^\s#]+)/m;

// Read the `status:` frontmatter value of a plan entry. A plan is either a
// folder (`<slug>/README.md`) or a legacy single file (`<slug>.md`). Returns
// the lowercased status, or null when missing/unreadable/not a plan file.
export function readPlanStatus(entryPath: string, isDirectory: boolean): string | null {
  let file: string;
  if (isDirectory) {
    file = join(entryPath, "README.md");
  } else if (entryPath.endsWith(".md")) {
    file = entryPath;
  } else {
    return null;
  }
  if (!existsSync(file)) return null;
  try {
    const content = readFileSync(file, "utf8");
    // Only look inside the leading `---` frontmatter block.
    if (!content.startsWith("---")) return null;
    const end = content.indexOf("\n---", 3);
    if (end === -1) return null;
    const frontmatter = content.slice(3, end);
    const m = STATUS_RE.exec(frontmatter);
    return m ? m[1].trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

// Gate for the `plans` directory: only completed plans are sweepable. Fails
// safe — anything without a readable `status: done` is kept.
export function isDonePlan(entryPath: string, isDirectory: boolean): boolean {
  return readPlanStatus(entryPath, isDirectory) === "done";
}

function countFiles(dir: string): number {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(entryPath);
    } else {
      count++;
    }
  }
  return count;
}

function deleteMatchingEntries(
  dir: string,
  range: DateRange,
  cutoff: Date | null,
  now: Date,
  extraFilter?: (entryPath: string, isDirectory: boolean) => boolean,
): { deleted: number; failed: number } {
  if (!existsSync(dir)) return { deleted: 0, failed: 0 };
  let deleted = 0;
  let failed = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name);
    if (extraFilter && !extraFilter(entryPath, entry.isDirectory())) continue;
    if (matchesRange(entryPath, entry.name, range, cutoff, now)) {
      const filesBefore = entry.isDirectory() ? countFiles(entryPath) : 1;
      try {
        rmSync(entryPath, { recursive: true });
        deleted += filesBefore;
      } catch {
        log.warn(`  Could not delete: ${entry.name}`);
        failed++;
      }
    }
  }
  return { deleted, failed };
}

async function promptDateRange(): Promise<{
  range: DateRange;
  cutoff: Date | null;
}> {
  const range = await select<DateRange>({
    message: "Delete files older than:",
    choices: [
      { name: "More than 1 day", value: "more_than_1_day" },
      { name: "More than 3 days", value: "more_than_3_days" },
      { name: "More than 1 week", value: "more_than_1_week" },
      { name: "More than 1 month", value: "more_than_1_month" },
      { name: "More than 1 year", value: "more_than_1_year" },
      { name: "Before a specific date (YYYY-MM-DD)", value: "before_date" },
      { name: "Clean all (no date filter)", value: "all" },
    ],
  });

  if (range !== "before_date") return { range, cutoff: null };

  while (true) {
    const raw = await input({ message: "Enter date (YYYY-MM-DD):" });
    const d = new Date(`${raw.trim()}T00:00:00.000Z`);
    if (!isNaN(d.getTime())) return { range, cutoff: d };
    log.warn(`Invalid date "${raw}". Use YYYY-MM-DD format.`);
  }
}

export async function cleanCommand(): Promise<void> {
  console.log();
  printBanner("🧹 Coding Friend Clean");
  console.log();

  const config = loadConfig();
  const docsDir = resolvePath(config.docsDir ?? "docs");

  const candidates = [
    { key: "context", path: join(docsDir, "context") },
    { key: "memory", path: resolveMemoryDir() },
    { key: "research", path: join(docsDir, "research") },
    { key: "reviews", path: join(docsDir, "reviews") },
    { key: "plans", path: join(docsDir, "plans") },
    { key: "sessions", path: join(docsDir, "sessions") },
    { key: "learn", path: join(docsDir, "learn") },
  ];

  const summary: { key: string; deleted: number }[] = [];

  while (true) {
    const cleanable = candidates
      .map((c) => ({ ...c, fileCount: countFiles(c.path) }))
      .filter((c) => existsSync(c.path) && c.fileCount > 0);

    if (cleanable.length === 0) {
      log.info("Nothing to clean.");
      break;
    }

    const selected = await select<string>({
      message: "Select a directory to clean:",
      choices: [
        ...cleanable.map((c) => ({
          name: `${c.key} — ${c.fileCount} ${c.fileCount === 1 ? "file" : "files"}`,
          value: c.key,
        })),
        { name: chalk.dim("Done (exit)"), value: "__done__" },
      ],
    });

    if (selected === "__done__") break;

    const entry = cleanable.find((c) => c.key === selected)!;
    const relPath = relative(process.cwd(), entry.path);

    console.log();
    console.log(`${chalk.yellow("→")} ${chalk.bold(entry.key)} (${relPath})`);
    const { range, cutoff } = await promptDateRange();

    const isMemory = entry.key === "memory";
    const isPlans = entry.key === "plans";
    let message: string;
    if (isMemory) {
      message = `Delete matching contents of ${relPath}/? (includes SQLite databases — stop memory daemon first if running)`;
    } else if (isPlans) {
      message = `Delete matching plans in ${relPath}/? (only plans with frontmatter status: done are removed — in-progress/failed plans are kept)`;
    } else {
      message = `Delete matching contents of ${relPath}/?`;
    }

    const ok = await confirm({ message, default: false });

    if (ok) {
      const now = new Date();
      const { deleted, failed } = deleteMatchingEntries(
        entry.path,
        range,
        cutoff,
        now,
        isPlans ? isDonePlan : undefined,
      );
      summary.push({ key: entry.key, deleted });
      const failNote = failed > 0 ? `, ${failed} failed` : "";
      log.success(
        `Cleared: ${relPath} (${deleted} ${deleted === 1 ? "file" : "files"} removed${failNote})`,
      );
    } else {
      log.dim("  Skipped.");
    }

    console.log();
  }

  if (summary.length === 0) {
    log.info("Done. Nothing was deleted.");
  } else {
    const total = summary.reduce((sum, s) => sum + s.deleted, 0);
    const breakdown = summary
      .map((s) => `${chalk.bold(s.key)}: ${s.deleted}`)
      .join(", ");
    log.info(
      `Done. ${chalk.bold(total)} ${total === 1 ? "file" : "files"} removed — ${breakdown}`,
    );
  }
  console.log();
}
