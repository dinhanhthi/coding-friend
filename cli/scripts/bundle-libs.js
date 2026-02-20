/**
 * Copy lib/learn-host and lib/learn-mcp source (no node_modules) into cli/lib/
 * for npm packaging. Users run `npm install` inside each lib on first use.
 */

import { cpSync, rmSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliRoot = join(__dirname, "..");
const repoRoot = join(cliRoot, "..");
const targetLib = join(cliRoot, "lib");

// Clean
if (existsSync(targetLib)) {
  rmSync(targetLib, { recursive: true });
}

const libs = ["learn-host", "learn-mcp"];

for (const lib of libs) {
  const src = join(repoRoot, "lib", lib);
  const dest = join(targetLib, lib);

  if (!existsSync(src)) {
    console.error(`ERROR: ${src} not found`);
    process.exit(1);
  }

  cpSync(src, dest, {
    recursive: true,
    filter: (source) => {
      // Skip node_modules, dist, .next, out
      const rel = source.replace(src, "");
      if (rel.includes("node_modules")) return false;
      if (rel.includes("/.next")) return false;
      if (rel.includes("/out")) return false;
      if (rel.includes("/dist")) return false;
      return true;
    },
  });

  console.log(`Bundled: lib/${lib}`);
}

console.log("Done.");
