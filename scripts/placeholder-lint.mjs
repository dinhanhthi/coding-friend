import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..");

const SHARED_MARKDOWN_FILES = ["plugin/context/bootstrap.md", "README.md"];

const SOURCE_PHASE3_EXCLUDED = new Set([
  "plugin/skills/cf-plan/SKILL.md",
  "plugin/skills/cf-review/SKILL.md",
  "plugin/context/bootstrap.md",
]);

const SOURCE_PATTERNS = [
  {
    name: "unresolved host placeholder",
    regex: /\{\{cf:[^}]+\}\}/g,
  },
  {
    name: "Claude agent tool",
    regex: /\bAgent tool\b/g,
    excludeFiles: SOURCE_PHASE3_EXCLUDED,
  },
  {
    name: "Claude question tool",
    regex: /\bAskUserQuestion\b/g,
    excludeFiles: SOURCE_PHASE3_EXCLUDED,
  },
  {
    name: "Claude background flag",
    regex: /\brun_in_background\b/g,
    scanRaw: true,
    excludeFiles: SOURCE_PHASE3_EXCLUDED,
  },
  {
    name: "Claude Skill tool",
    regex: /\bSkill tool\b/g,
    excludeFiles: SOURCE_PHASE3_EXCLUDED,
  },
  {
    name: "Claude host name",
    regex: /if Claude finds itself|Claude does NOT need/g,
    excludeFiles: SOURCE_PHASE3_EXCLUDED,
  },
  {
    name: "Claude-specific review prose",
    regex: /Claude's own review/g,
    excludeFiles: SOURCE_PHASE3_EXCLUDED,
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
  {
    name: "Claude background flag",
    regex: /\brun_in_background\b/g,
    scanRaw: true,
  },
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
  {
    name: "Claude-specific review prose",
    regex: /Claude's own review|Claude-only review/g,
  },
  {
    name: "Claude host name",
    regex: /\bin Claude Code\b|if Claude finds itself|Claude does NOT need/g,
  },
  {
    name: "Anthropic model prose",
    regex:
      /Runs on Haiku for speed|Runs on Sonnet for deeper reasoning|\(model:\s*(?:haiku|sonnet|opus)\)|CF_REDUCER_MODEL=sonnet/g,
  },
];

const CODEX_MUST_CONTAIN = [
  {
    file: "plugin-codex/context/bootstrap.md",
    regex: /spawn the `<agent>` custom agent/,
  },
  { file: "plugin-codex/skills/cf-plan/SKILL.md", regex: /\$cf-/ },
  {
    file: "plugin-codex/skills/cf-review/SKILL.md",
    regex: /Codex host behavior/,
  },
];

const AGY_MUST_CONTAIN = [
  { file: "plugin-antigravity/rules/AGENTS.md", regex: /invoke_subagent/ },
  {
    file: "plugin-antigravity/skills/cf-review/SKILL.md",
    regex: /Antigravity host behavior/,
  },
  {
    file: "plugin-antigravity/skills/cf-plan/SKILL.md",
    regex: /explicit model/,
  },
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
  {
    name: "Claude background flag",
    regex: /\brun_in_background\b/g,
    scanRaw: true,
  },
  { name: "Claude Skill tool", regex: /\bSkill tool\b/g },
  { name: "Claude hook output", regex: /\bhookSpecificOutput\b/g },
  { name: "Claude instruction file", regex: /\bCLAUDE\.md\b/g },
  { name: "Claude resume command", regex: /\bclaude --resume\b/g },
  {
    name: "Claude-specific review prose",
    regex: /Claude's own review|Claude-only review/g,
  },
  {
    name: "Claude host name",
    regex: /\bin Claude Code\b|if Claude finds itself|Claude does NOT need/g,
  },
  {
    name: "Anthropic model prose",
    regex:
      /Runs on Haiku for speed|Runs on Sonnet for deeper reasoning|\(model:\s*(?:haiku|sonnet|opus)\)|CF_REDUCER_MODEL=sonnet/g,
  },
];

async function collectFilesRecursive(dir, relativePrefix, predicate) {
  const files = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    const relativePath = path.join(relativePrefix, entry.name);
    if (entry.isDirectory()) {
      files.push(
        ...(await collectFilesRecursive(absolutePath, relativePath, predicate)),
      );
    } else if (entry.isFile() && predicate(entry.name, relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

async function collectInstructionFiles(root, relativePrefix) {
  const skillFiles = await collectFilesRecursive(
    path.join(root, "skills"),
    path.join(relativePrefix, "skills"),
    (name) => name.endsWith(".md"),
  );

  const agentFiles = await collectFilesRecursive(
    path.join(root, "agents"),
    path.join(relativePrefix, "agents"),
    (name) => /\.(?:md|toml)$/.test(name),
  );

  const libFiles = await collectFilesRecursive(
    path.join(root, "lib"),
    path.join(relativePrefix, "lib"),
    (name) => name.endsWith(".md") && name !== "PLACEHOLDERS.md",
  );

  return [...skillFiles, ...agentFiles, ...libFiles].sort();
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

function mustContainStrict(options = {}) {
  if (options.strict === false || options.optional === true) {
    return false;
  }
  return true;
}

async function findIssues(files, patterns, root = repoRoot) {
  const issues = [];

  for (const relativePath of files) {
    const absolutePath = path.join(root, relativePath);
    const raw = await readFile(absolutePath, "utf8");
    const stripped = stripFencedCode(raw);

    for (const pattern of patterns) {
      if (pattern.excludeFiles?.has(relativePath)) continue;
      const searchable = pattern.scanRaw ? raw : stripped;
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

async function findMissingRequired(root, list, options = {}) {
  const issues = [];
  const strict = mustContainStrict(options);

  for (const { file, regex } of list) {
    let raw;
    try {
      raw = await readFile(path.join(root, file), "utf8");
    } catch (error) {
      if (error?.code === "ENOENT" && !strict) {
        continue;
      }
      const missing = error?.code === "ENOENT";
      issues.push({
        file,
        line: 0,
        type: missing ? "missing required file" : "unreadable required file",
        value: missing ? regex.source : (error?.code ?? String(error)),
      });
      continue;
    }
    regex.lastIndex = 0;
    if (!regex.test(raw)) {
      issues.push({
        file,
        line: 0,
        type: "missing required host phrasing",
        value: regex.source,
      });
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

export async function findCodexArtifactLintIssues(root = repoRoot, options = {}) {
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
  return [
    ...(await findIssues(files.sort(), CODEX_PATTERNS, root)),
    ...(await findMissingRequired(root, CODEX_MUST_CONTAIN, options)),
  ];
}

export async function findAntigravityArtifactLintIssues(
  root = repoRoot,
  options = {},
) {
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

  return [
    ...(await findIssues(files.sort(), AGY_PATTERNS, root)),
    ...(await findMissingRequired(root, AGY_MUST_CONTAIN, options)),
  ];
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
