import { existsSync, readdirSync, rmSync } from "fs";
import { join, relative } from "path";

import { checkbox, confirm } from "@inquirer/prompts";
import chalk from "chalk";

import { loadConfig, resolveMemoryDir } from "../lib/config.js";
import { log, printBanner } from "../lib/log.js";
import { resolvePath } from "../lib/paths.js";

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

function clearDirContents(dir: string): void {
  for (const entry of readdirSync(dir)) {
    rmSync(join(dir, entry), { recursive: true });
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

  let cleared = 0;

  for (const entry of cleanable.filter((c) => selected.includes(c.key))) {
    const relPath = relative(process.cwd(), entry.path);

    console.log(
      `${chalk.yellow("→")} Clean ${chalk.bold(entry.key)} (${relPath})`,
    );

    const isMemory = entry.key === "memory";
    const message = isMemory
      ? `Delete all contents of ${relPath}/? (includes SQLite databases — stop memory daemon first if running)`
      : `Delete all contents of ${relPath}/?`;

    const ok = await confirm({ message, default: false });

    if (ok) {
      clearDirContents(entry.path);
      log.success(`Cleared: ${relPath}`);
      cleared++;
    } else {
      log.dim("  Skipped.");
    }

    console.log();
  }

  log.info(`Done. ${cleared} of ${selected.length} directories cleared.`);
  console.log();
}
