#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cacheDir = mkdtempSync(join(tmpdir(), "coding-friend-npm-cache-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

try {
  const result = spawnSync(
    npm,
    ["pack", "--dry-run", "--json", "--silent", "--cache", cacheDir],
    {
      cwd: packageRoot,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  const [artifact] = JSON.parse(result.stdout);
  const paths = artifact.files.map((file) => file.path);
  const forbidden = paths.filter(
    (file) =>
      file.includes("/node_modules/") ||
      file.includes("/__tests__/") ||
      (file.startsWith("lib/") && file.includes("/dist/")) ||
      file.startsWith("lib/learn-host/public/_pagefind/"),
  );

  const required = [
    "dist/index.js",
    "lib/cf-memory/package.json",
    "lib/cf-memory/src/index.ts",
    "lib/learn-host/package.json",
    "lib/learn-host/src/app/page.tsx",
    "lib/learn-mcp/package.json",
    "lib/learn-mcp/src/index.ts",
  ];
  const missing = required.filter((file) => !paths.includes(file));
  const maxBytes = 5 * 1024 * 1024;

  if (forbidden.length > 0 || missing.length > 0 || artifact.size > maxBytes) {
    if (forbidden.length > 0) {
      console.error(`Forbidden package files:\n${forbidden.join("\n")}`);
    }
    if (missing.length > 0) {
      console.error(`Missing runtime package files:\n${missing.join("\n")}`);
    }
    if (artifact.size > maxBytes) {
      console.error(
        `Package is too large: ${artifact.size} bytes (limit ${maxBytes})`,
      );
    }
    process.exit(1);
  }

  console.log(
    `Package check passed: ${artifact.entryCount} files, ${artifact.size} bytes`,
  );
} finally {
  rmSync(cacheDir, { recursive: true, force: true });
}
