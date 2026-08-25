import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

const SHARED_MARKDOWN_FILES = ["plugin/context/bootstrap.md", "README.md"];

const SOURCE_PATTERNS = [
  {
    name: "unresolved host placeholder",
    regex: /\{\{cf:[^}]+\}\}/g,
  },
];

const CODEX_PATTERNS = [
  { name: "unresolved host placeholder", regex: /\{\{cf:[^}]+\}\}/g },
  { name: "Claude plugin root", regex: /CLAUDE_PLUGIN_ROOT/g },
  {
    name: "Claude subagent type",
    regex: /subagent_type:\s*"coding-friend:cf-[a-z0-9-]+"/g,
  },
  { name: "Claude question tool", regex: /\bAskUserQuestion\b/g },
  { name: "Claude task tool", regex: /\b(?:TaskCreate|TaskUpdate)\b/g },
  { name: "Claude background flag", regex: /\brun_in_background\b/g },
  { name: "Claude agent tool", regex: /\bAgent tool\b/g },
  {
    name: "Claude skill frontmatter",
    regex:
      /^(?:model|allowed-tools|user-invocable|disable-model-invocation|argument-hint):/gm,
  },
  {
    name: "Claude model alias",
    regex: /^model\s*=\s*"(?:haiku|sonnet|opus|inherit)"\s*$/gm,
  },
  {
    name: "Anthropic instruction tier",
    regex: /\((?:haiku|sonnet|opus)\)/g,
  },
  {
    name: "legacy nested Codex review branch",
    regex:
      /Codex dual-review flag|Step 2\.5: Spawn Codex review|Step 6\.5: Collect & normalize the Codex review|run-codex-review\.sh|normalize-codex-review\.sh|codex=(?:true|false)/g,
  },
  { name: "Claude-only dev workflow", regex: /\bcf dev sync\b/g },
  { name: "unsupported agent tools key", regex: /^tools\s*=/gm },
];

const AGY_PATTERNS = [
  { name: "unresolved host placeholder", regex: /\{\{cf:[^}]+\}\}/g },
  { name: "Claude plugin root", regex: /\$\{CLAUDE_PLUGIN_ROOT\}/g },
  { name: "AGY plugin root leftover", regex: /\bAGY_PLUGIN_ROOT\b/g },
  { name: "Claude question tool", regex: /\bAskUserQuestion\b/g },
  { name: "Claude task tool", regex: /\b(?:TaskCreate|TaskUpdate)\b/g },
  { name: "Claude subagent type", regex: /subagent_type:/g },
  { name: "Claude agent tool", regex: /\bAgent tool\b/g },
  { name: "Claude WebFetch", regex: /\bWebFetch\b/g },
  { name: "Claude WebSearch", regex: /\bWebSearch\b/g },
  { name: "Claude Skill tool", regex: /\bSkill tool\b/g },
  { name: "Claude hook output", regex: /\bhookSpecificOutput\b/g },
  { name: "Claude instruction file", regex: /\bCLAUDE\.md\b/g },
  { name: "Claude resume command", regex: /\bclaude --resume\b/g },
];

async function collectInstructionFiles(root, relativePrefix) {
  const skillDir = path.join(root, "skills");
  const agentDir = path.join(root, "agents");

  const skillEntries = await readdir(skillDir, { withFileTypes: true });
  const skillFiles = skillEntries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("cf-"))
    .map((entry) =>
      path.join(relativePrefix, "skills", entry.name, "SKILL.md"),
    );

  const agentEntries = await readdir(agentDir, { withFileTypes: true });
  const agentFiles = agentEntries
    .filter(
      (entry) => entry.isFile() && /^cf-.*\.(?:md|toml)$/.test(entry.name),
    )
    .map((entry) => path.join(relativePrefix, "agents", entry.name));

  return [...skillFiles, ...agentFiles].sort();
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

async function findIssues(files, patterns, root = repoRoot) {
  const issues = [];

  for (const relativePath of files) {
    const absolutePath = path.join(root, relativePath);
    const raw = await readFile(absolutePath, "utf8");
    const searchable = stripFencedCode(raw);

    for (const pattern of patterns) {
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

export async function findPlaceholderLintIssues(root = repoRoot) {
  const pluginFiles = await collectInstructionFiles(
    path.join(root, "plugin"),
    "plugin",
  );
  return findIssues(
    [...pluginFiles, ...SHARED_MARKDOWN_FILES].sort(),
    SOURCE_PATTERNS,
    root,
  );
}

export async function findCodexArtifactLintIssues(root = repoRoot) {
  const files = await collectInstructionFiles(
    path.join(root, "plugin-codex"),
    "plugin-codex",
  );
  const bootstrapPath = "plugin-codex/context/bootstrap.md";
  try {
    await access(path.join(root, bootstrapPath));
    files.push(bootstrapPath);
  } catch {
    // Fixture repos may not include a bootstrap context file.
  }
  return findIssues(files.sort(), CODEX_PATTERNS, root);
}

export async function findAntigravityArtifactLintIssues(root = repoRoot) {
  const files = await collectInstructionFiles(
    path.join(root, "plugin-antigravity"),
    "plugin-antigravity",
  );

  const rulesDir = path.join(root, "plugin-antigravity", "rules");
  try {
    const ruleEntries = await readdir(rulesDir, { withFileTypes: true });
    for (const entry of ruleEntries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(path.join("plugin-antigravity", "rules", entry.name));
      }
    }
  } catch {
    // Fixture repos may omit rules/.
  }

  const hooksJsonPath = "plugin-antigravity/hooks.json";
  try {
    await access(path.join(root, hooksJsonPath));
    files.push(hooksJsonPath);
  } catch {
    // Fixture repos may omit hooks.json.
  }

  return findIssues(files.sort(), AGY_PATTERNS, root);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const agyOnly = process.argv.includes("--agy");
  const issues = agyOnly
    ? await findAntigravityArtifactLintIssues()
    : [
        ...(await findPlaceholderLintIssues()),
        ...(await findCodexArtifactLintIssues()),
      ];
  if (issues.length > 0) {
    console.error("Found unresolved or host-incompatible references:");
    for (const issue of issues) {
      console.error(
        `${issue.file}:${issue.line}: ${issue.type}: ${issue.value}`,
      );
    }
    process.exitCode = 1;
  }
}
