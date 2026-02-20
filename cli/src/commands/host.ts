import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { resolveDocsDir } from "../lib/config.js";
import { run, streamExec } from "../lib/exec.js";
import { log } from "../lib/log.js";
import { getLibPath } from "../lib/lib-path.js";

function countMdFiles(dir: string): number {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countMdFiles(join(dir, entry.name));
    } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
      count++;
    }
  }
  return count;
}

function countCategories(dir: string): number {
  return readdirSync(dir, { withFileTypes: true }).filter(
    (e) => e.isDirectory() && !e.name.startsWith("."),
  ).length;
}

export async function hostCommand(
  path?: string,
  opts?: { port?: string },
): Promise<void> {
  const docsDir = resolveDocsDir(path);
  const port = opts?.port ?? "3333";
  const hostDir = getLibPath("learn-host");

  // Validate docs
  if (!existsSync(docsDir)) {
    log.error(`Docs folder not found: ${docsDir}`);
    log.dim("Run /cf-learn first to generate some docs.");
    process.exit(1);
  }

  const docCount = countMdFiles(docsDir);
  if (docCount === 0) {
    log.error(`No .md files found in ${docsDir}`);
    log.dim("Run /cf-learn first to generate some docs.");
    process.exit(1);
  }

  const catCount = countCategories(docsDir);

  console.log("=== 🌿 Coding Friend Host 🌿 ===");
  log.info(`Docs folder: ${docsDir}`);
  log.info(`Found: ${docCount} docs in ${catCount} categories`);
  console.log();

  // Install deps if needed
  if (!existsSync(join(hostDir, "node_modules"))) {
    log.step("Installing dependencies (one-time setup)...");
    const result = run("npm", ["install", "--silent"], { cwd: hostDir });
    if (result === null) {
      log.error("Failed to install dependencies");
      process.exit(1);
    }
    log.success("Done.");
    console.log();
  }

  // Build
  log.step("Building site...");
  const buildCode = await streamExec("npm", ["run", "build", "--silent"], {
    cwd: hostDir,
    env: { ...process.env, DOCS_DIR: docsDir },
  });
  if (buildCode !== 0) {
    log.error("Build failed");
    process.exit(1);
  }
  console.log();

  // Serve with Next.js (ISR enabled)
  log.step("Starting server (ISR enabled)...");
  log.info(`Site: http://localhost:${port}`);
  log.dim("New/changed docs will auto-update on page refresh.");
  log.dim("Press Ctrl+C to stop.");
  console.log();

  await streamExec("npx", ["next", "start", "-p", port], {
    cwd: hostDir,
    env: { ...process.env, DOCS_DIR: docsDir },
  });
}
