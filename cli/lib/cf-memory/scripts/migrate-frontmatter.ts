/**
 * One-time migration script: adds `type`, `importance`, `source` fields
 * to existing docs/memory/ markdown files.
 *
 * Uses string manipulation instead of gray-matter stringify to preserve
 * the original date format (YYYY-MM-DD) and tag format ([a, b, c]).
 *
 * Usage: npx tsx scripts/migrate-frontmatter.ts [docsDir]
 * Default docsDir: ../../../../docs/memory (relative to this script)
 */
import fs from "node:fs";
import path from "node:path";

const CATEGORY_TO_TYPE: Record<string, string> = {
  features: "fact",
  conventions: "preference",
  decisions: "context",
  bugs: "episode",
  infrastructure: "procedure",
};

function migrateFile(filePath: string, type: string): boolean {
  const raw = fs.readFileSync(filePath, "utf-8");

  // Check if the file has frontmatter
  if (!raw.startsWith("---")) return false;

  const endIdx = raw.indexOf("---", 3);
  if (endIdx === -1) return false;

  const frontmatter = raw.slice(3, endIdx);
  const body = raw.slice(endIdx + 3);

  const hasType = /^type:/m.test(frontmatter);
  const hasImportance = /^importance:/m.test(frontmatter);
  const hasSource = /^source:/m.test(frontmatter);

  // Nothing to add
  if (hasType && hasImportance && hasSource) return false;

  // Build new fields to insert before the closing ---
  const newFields: string[] = [];

  // Insert type after tags line
  let updatedFrontmatter = frontmatter;

  if (!hasType) {
    // Insert type after description line
    updatedFrontmatter = updatedFrontmatter.replace(
      /^(description:.*\n)/m,
      `$1type: ${type}\n`,
    );
  }

  if (!hasImportance) {
    // Insert importance before created line
    updatedFrontmatter = updatedFrontmatter.replace(
      /^(created:)/m,
      `importance: 3\n$1`,
    );
  }

  if (!hasSource) {
    // Insert source after updated line
    updatedFrontmatter = updatedFrontmatter.replace(
      /^(updated:.*\n)/m,
      `$1source: conversation\n`,
    );
  }

  const output = `---${updatedFrontmatter}---${body}`;
  fs.writeFileSync(filePath, output, "utf-8");
  return true;
}

function migrate(docsDir: string): void {
  if (!fs.existsSync(docsDir)) {
    console.error(`Directory not found: ${docsDir}`);
    process.exit(1);
  }

  const entries = fs.readdirSync(docsDir, { withFileTypes: true });
  let updated = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      const category = entry.name;
      const catDir = path.join(docsDir, category);
      const files = fs
        .readdirSync(catDir)
        .filter((f) => f.endsWith(".md") && f !== "README.md");

      const type = CATEGORY_TO_TYPE[category] ?? "fact";

      for (const file of files) {
        const filePath = path.join(catDir, file);
        if (migrateFile(filePath, type)) {
          console.log(`  Updated: ${category}/${file}`);
          updated++;
        } else {
          console.log(`  Skipped: ${category}/${file} (already migrated)`);
          skipped++;
        }
      }
    }

    // Handle root-level markdown files
    if (
      entry.isFile() &&
      entry.name.endsWith(".md") &&
      entry.name !== "README.md"
    ) {
      const filePath = path.join(docsDir, entry.name);
      if (migrateFile(filePath, "fact")) {
        console.log(`  Updated: ${entry.name} (root)`);
        updated++;
      } else {
        console.log(`  Skipped: ${entry.name} (already migrated)`);
        skipped++;
      }
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`);
}

// CLI entry
const docsDir =
  process.argv[2] ??
  path.resolve(import.meta.dirname, "../../../../docs/memory");

console.log(`Migrating frontmatter in: ${docsDir}\n`);
migrate(docsDir);
