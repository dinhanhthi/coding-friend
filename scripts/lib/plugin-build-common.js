"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const TEXT_EXTENSIONS = new Set([
  ".cjs",
  ".html",
  ".js",
  ".json",
  ".md",
  ".py",
  ".sh",
  ".txt",
]);

const TEXT_FILENAMES = new Set(["CHANGELOG", "LICENSE", "README"]);
const IGNORED_COPY_ENTRIES = new Set([
  ".DS_Store",
  "__tests__",
  "PLACEHOLDERS.md",
]);

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function isTextFile(filePath) {
  const basename = path.basename(filePath);
  return (
    TEXT_EXTENSIONS.has(path.extname(filePath)) || TEXT_FILENAMES.has(basename)
  );
}

// Closing fence may omit the trailing newline (`\n?`) so SKILL.md files
// that end at `---` still lose Claude-only frontmatter keys.
function stripClaudeSkillFrontmatter(input) {
  const match = input.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return input;

  const filtered = match[1]
    .split("\n")
    .filter(
      (line) =>
        !/^(?:model|allowed-tools|user-invocable|disable-model-invocation|argument-hint):/.test(
          line,
        ),
    )
    .join("\n");
  return `---\n${filtered}\n---\n${input.slice(match[0].length)}`;
}

async function copyFilePreservingMode(src, dest, renderFn) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const mode = (await fs.stat(src)).mode & 0o777;
  if (!isTextFile(src)) {
    await fs.copyFile(src, dest);
    await fs.chmod(dest, mode);
    return;
  }
  const source = await fs.readFile(src, "utf8");
  await fs.writeFile(dest, renderFn(source));
  await fs.chmod(dest, mode);
}

async function copyRenderedTree(
  srcDir,
  destDir,
  { render, exclude, prefix = "" } = {},
) {
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (IGNORED_COPY_ENTRIES.has(entry.name)) continue;

    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (exclude && exclude.has(relativePath)) continue;

    const sourcePath = path.join(srcDir, entry.name);
    const targetPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyRenderedTree(sourcePath, targetPath, {
        render,
        exclude,
        prefix: relativePath,
      });
      continue;
    }
    if (entry.isFile()) {
      await copyFilePreservingMode(sourcePath, targetPath, (content) =>
        render(sourcePath, content),
      );
    }
  }
}

async function assertSourceDir(dir) {
  try {
    const sourceStat = await fs.stat(dir);
    if (!sourceStat.isDirectory()) {
      throw new Error(`Missing plugin source directory: ${dir}`);
    }
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(`Missing plugin source directory: ${dir}`);
    }
    throw error;
  }
}

module.exports = {
  TEXT_EXTENSIONS,
  TEXT_FILENAMES,
  IGNORED_COPY_ENTRIES,
  stableJson,
  isTextFile,
  stripClaudeSkillFrontmatter,
  copyFilePreservingMode,
  copyRenderedTree,
  assertSourceDir,
};
