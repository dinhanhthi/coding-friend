import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

const SHARED_MARKDOWN_FILES = [
  "plugin/context/bootstrap.md",
  "README.md",
  "CLAUDE.md",
];

const RAW_PATTERNS = [
  {
    name: "raw slash command",
    regex: /(^|[\s("'`>\[{|])\/(cf-[a-z0-9-]+)(?=$|[\s.,;:)"'`<\]}|])/g,
  },
  {
    name: "raw Claude plugin root",
    regex: /\$\{CLAUDE_PLUGIN_ROOT\}/g,
  },
  {
    name: "raw Claude subagent type",
    regex: /subagent_type:\s*"coding-friend:cf-[a-z0-9-]+"/g,
  },
  {
    name: "raw plugin skill or agent id",
    regex: /coding-friend:cf-[a-z0-9-]+/g,
  },
];

async function collectMarkdownFiles() {
  const skillDir = path.join(repoRoot, "plugin/skills");
  const agentDir = path.join(repoRoot, "plugin/agents");

  const skillEntries = await readdir(skillDir, { withFileTypes: true });
  const skillFiles = skillEntries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("cf-"))
    .map((entry) => path.join("plugin/skills", entry.name, "SKILL.md"));

  const agentEntries = await readdir(agentDir, { withFileTypes: true });
  const agentFiles = agentEntries
    .filter((entry) => entry.isFile() && /^cf-.*\.md$/.test(entry.name))
    .map((entry) => path.join("plugin/agents", entry.name));

  return [...skillFiles, ...agentFiles, ...SHARED_MARKDOWN_FILES].sort();
}

function stripFencedCode(markdown) {
  return markdown.replace(
    /(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2(?=\n|$)/g,
    "$1",
  );
}

function lineNumberForIndex(source, index) {
  return source.slice(0, index).split("\n").length;
}

export async function findPlaceholderLintIssues() {
  const files = await collectMarkdownFiles();
  const issues = [];

  for (const relativePath of files) {
    const absolutePath = path.join(repoRoot, relativePath);
    const raw = await readFile(absolutePath, "utf8");
    const searchable = stripFencedCode(raw);

    for (const pattern of RAW_PATTERNS) {
      pattern.regex.lastIndex = 0;
      for (const match of searchable.matchAll(pattern.regex)) {
        issues.push({
          file: relativePath,
          line: lineNumberForIndex(searchable, match.index ?? 0),
          type: pattern.name,
          value: match[0],
        });
      }
    }
  }

  return issues;
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const issues = await findPlaceholderLintIssues();
  if (issues.length > 0) {
    console.error("Found raw host-specific references:");
    for (const issue of issues) {
      console.error(
        `${issue.file}:${issue.line}: ${issue.type}: ${issue.value}`,
      );
    }
    process.exitCode = 1;
  }
}
