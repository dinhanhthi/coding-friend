import { existsSync, readdirSync, rmSync, statSync } from "fs";
import { join, relative } from "path";

import { checkbox, confirm, input, select } from "@inquirer/prompts";
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

const RANGE_LABELS: Record<DateRange, string> = {
  more_than_1_day: "more than 1 day old",
  more_than_3_days: "more than 3 days old",
  more_than_1_week: "more than 1 week old",
  more_than_1_month: "more than 1 month old",
  more_than_1_year: "more than 1 year old",
  before_date: "before custom date",
  all: "all files",
};

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
): { deleted: number; failed: number } {
  if (!existsSync(dir)) return { deleted: 0, failed: 0 };
  let deleted = 0;
  let failed = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const entryPath = join(dir, entry.name);
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

  const cleanable = candidates
    .map((c) => ({ ...c, fileCount: countFiles(c.path) }))
    .filter((c) => existsSync(c.path) && c.fileCount > 0);

  if (cleanable.length === 0) {
    log.info("Nothing to clean.");
    console.log();
    return;
  }

  const selected = await checkbox({
    message: "Select directories to clean:",
    choices: cleanable.map((c) => ({
      name: `${c.key} — ${c.fileCount} ${c.fileCount === 1 ? "file" : "files"}`,
      value: c.key,
    })),
  });

  if (selected.length === 0) {
    log.dim("  Nothing selected.");
    console.log();
    return;
  }

  console.log();
  const { range, cutoff } = await promptDateRange();
  console.log();

  const now = new Date();
  const summary: { key: string; deleted: number }[] = [];

  for (const entry of cleanable.filter((c) => selected.includes(c.key))) {
    const relPath = relative(process.cwd(), entry.path);

    const rangeLabel =
      range === "before_date"
        ? `files before ${cutoff!.toISOString().slice(0, 10)}`
        : RANGE_LABELS[range];

    console.log(
      `${chalk.yellow("→")} Clean ${chalk.bold(entry.key)} (${relPath}) — ${chalk.dim(rangeLabel)}`,
    );

    const isMemory = entry.key === "memory";
    const message = isMemory
      ? `Delete matching contents of ${relPath}/? (includes SQLite databases — stop memory daemon first if running)`
      : `Delete matching contents of ${relPath}/?`;

    const ok = await confirm({ message, default: false });

    if (ok) {
      const { deleted, failed } = deleteMatchingEntries(
        entry.path,
        range,
        cutoff,
        now,
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
