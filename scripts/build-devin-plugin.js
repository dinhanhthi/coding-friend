#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { parseFrontmatter } = require("./lib/agent-md-to-toml.js");
const {
  assertSourceDir,
  copyRenderedTree,
  stableJson,
} = require("./lib/plugin-build-common.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const PLUGIN_SOURCE_DIR = path.join(REPO_ROOT, "plugin");
const DEVIN_PLUGIN_DIR = path.join(REPO_ROOT, "plugin-devin");

// Claude-only and other-host files (relative to plugin/) that would ship as
// dead or self-contradictory weight in the Devin artifact. Devin loads the
// Claude layout natively, so the shared hooks (`privacy-block.sh`,
// `scout-block.cjs`, `rules-reminder.sh`, `memory-capture.sh`,
// `session-init.sh`, `session-log.sh`) stay, along with `auto-approve.cjs`
// (required by `auto-approve.devin.cjs`), every `*.devin.*` shim and
// `lib/devin-tool-map.cjs`. `hooks/hooks.json` is replaced by the generated
// Devin event set; cf-review's external-reviewer scripts stay (verified to
// resolve through `<plugin-root>`).
const DEVIN_EXCLUDED_SOURCE_PATHS = new Set([
  "omp",
  "hooks/hooks.json",
  "hooks/statusline.sh",
  "hooks/task-tracker.sh",
  "hooks/agent-tracker.sh",
  "hooks/auto-approve.codex.cjs",
  "hooks/memory-capture.codex.sh",
  "hooks/auto-approve.agy.cjs",
  "hooks/scout-block.agy.cjs",
  "hooks/privacy-block.agy.sh",
  "hooks/rules-reminder.agy.sh",
  "hooks/session-init.agy.sh",
  "hooks/session-log.agy.sh",
  "lib/agy-hook-io.sh",
  "skills/cf-session/scripts",
  "CHANGELOG.md",
]);

// Devin's hook loader rejects the whole file on any unknown event — the
// generated hooks.json must stay inside this allow-list (verified
// 2026-10-04, see docs/memory/features/devin-host-spec-verified-2026-10-04.md).
const DEVIN_HOOK_EVENTS = new Set([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
  "Stop",
  "PostCompaction",
  "SessionEnd",
]);

// Matchers only apply to tool events; every other event must use "".
const DEVIN_TOOL_MATCHER_EVENTS = new Set([
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
]);

// Devin sets CLAUDE_PLUGIN_ROOT for hook commands but NOT inside skill bodies,
// so instruction text uses the `<plugin-root>` token (resolved from the
// PLUGIN_ROOT: line session-init.sh injects into the bootstrap context).
const DEVIN_PLUGIN_ROOT_TOKEN = "<plugin-root>";
const DEVIN_PLUGIN_ROOT_PHRASE =
  "the `PLUGIN_ROOT:` path in the session bootstrap context (HOST: devin), or the parent of the `skills/` folder that contains this SKILL.md";
const DEVIN_PLUGIN_ROOT_NOTE =
  "> Plugin root: the `PLUGIN_ROOT:` path in the session bootstrap context (HOST: devin), or the parent of the `skills/` folder that contains this SKILL.md. Replace `<plugin-root>` with it when running bundled scripts.";

function skillRelativePosixPath(normalizedPath) {
  const idx = normalizedPath.lastIndexOf("/skills/");
  if (idx !== -1) return normalizedPath.slice(idx + 1);
  if (normalizedPath.startsWith("skills/")) return normalizedPath;
  return null;
}

function isDevinSkillExecutable(normalizedPath) {
  const relative = skillRelativePosixPath(normalizedPath);
  return Boolean(relative) && /\.(?:sh|cjs)$/.test(relative);
}

function devinPluginRootFromScript(normalizedPath) {
  const relative = skillRelativePosixPath(normalizedPath);
  if (!relative) return null;
  const dirParts = relative.split("/").slice(0, -1);
  if (dirParts.length === 0) return ".";
  return dirParts.map(() => "..").join("/");
}

function rewriteDevinSkillScriptPluginRoot(normalizedPath, input) {
  const up = devinPluginRootFromScript(normalizedPath);
  if (!up) return input;
  if (normalizedPath.endsWith(".cjs")) {
    const expr = `require("node:path").resolve(__dirname, "${up}")`;
    return input
      .replace(/\{\{cf:plugin_root\}\}/g, expr)
      .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, expr)
      .replace(/process\.env\.CLAUDE_PLUGIN_ROOT/g, expr);
  }
  const expr = `$(cd "$(dirname "$0")/${up}" && pwd)`;
  return input
    .replace(/\{\{cf:plugin_root\}\}/g, expr)
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, expr);
}

// `keepPluginRoot` is for hook scripts: their commands run with
// CLAUDE_PLUGIN_ROOT in the environment, so the variable must survive. Skill
// and agent bodies never see it — there it becomes the `<plugin-root>` token.
function renderDevinText(input, { keepPluginRoot = false } = {}) {
  const rendered = input
    .replace(/\{\{cf:slash\s+([a-z0-9-]+)\}\}/g, (_match, name) => `/${name}`)
    .replace(/\{\{cf:agent_ref\s+([a-z0-9-]+)\}\}/g, (_match, name) => name)
    .replace(
      /\{\{cf:skill_invoke\s+([a-z0-9-]+)\}\}/g,
      (_match, name) => `activate the \`${name}\` skill (type \`/${name}\`)`,
    )
    .replace(/\{\{cf:plugin_root\}\}/g, DEVIN_PLUGIN_ROOT_PHRASE)
    .replace(/\{\{cf:host\}\}/g, "Devin CLI")
    .replace(
      /\{\{cf:dispatch\s+agent=([a-z0-9-]+)\s+prompt="([^"]*)"\}\}/g,
      (_match, agent, prompt) =>
        `use the \`run_subagent\` tool with profile \`coding-friend:${agent}\` and this task: ${prompt}`,
    )
    .replace(
      /use the Agent tool with `subagent_type: "coding-friend:<agent>"`/g,
      "use the `run_subagent` tool with profile `coding-friend:<agent>`",
    )
    .replace(
      /`subagent_type: "coding-friend:(cf-[a-z0-9-]+)"`/g,
      (_match, name) => `\`run_subagent\` profile \`coding-friend:${name}\``,
    )
    .replace(/\*\*Agent tool\*\*/g, "`run_subagent` tool")
    .replace(/\bAgent tool\b/g, "`run_subagent` tool");
  if (keepPluginRoot) return rendered;
  return rendered
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}\//g, `${DEVIN_PLUGIN_ROOT_TOKEN}/`)
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, DEVIN_PLUGIN_ROOT_TOKEN);
}

function renderDevinSessionSkill() {
  return `---
name: cf-session
description: >
  Continue or resume Devin CLI conversations with the native session
  controls. Use when the user asks to resume, continue, or restore a Devin
  session. Devin owns its transcript format, so Coding Friend does not copy
  or rewrite session files.
disable-model-invocation: true
---

# /cf-session

Devin CLI provides native session management:

- Run \`devin -r <id>\` to resume a session by id (bare \`devin -r\` opens the picker).
- Run \`devin -c\` to continue the most recent session.
- Run \`devin list\` to list sessions (\`--format json|csv\`); inside the REPL use \`/resume\` or \`/ls\`.

Do not run Coding Friend's Claude session scripts or parse Devin session files.
If the user needs cross-machine continuity, explain that native Devin session
availability is the supported path and keep durable project knowledge in \`docs/memory/\`.
`;
}

function renderDevinFile(sourcePath, input) {
  const normalizedPath = sourcePath.split(path.sep).join("/");
  const isSkill = normalizedPath.endsWith("/SKILL.md");
  const source = isDevinSkillExecutable(normalizedPath)
    ? rewriteDevinSkillScriptPluginRoot(normalizedPath, input)
    : input;
  let rendered = renderDevinText(source, {
    keepPluginRoot: normalizedPath.includes("/hooks/"),
  });

  if (normalizedPath.endsWith("/skills/cf-session/SKILL.md")) {
    rendered = renderDevinSessionSkill();
  }

  // Verified: Devin accepts Claude skill frontmatter natively
  // (`disable-model-invocation`, `user-invocable`, `model:`, `triggers`), so
  // SKILL.md frontmatter ships unchanged — only the plugin-root note is added.
  if (isSkill) {
    rendered = `${rendered.trimEnd()}\n\n${DEVIN_PLUGIN_ROOT_NOTE}\n`;
  }

  return rendered.replace(
    /run_in_background:\s*true/g,
    "run in the background",
  );
}

// Devin agent frontmatter: drop `model:` when it is `inherit` or `haiku`
// (Devin's default subagent model — a Known Difference), keep `sonnet`/`opus`,
// strip `created`/`updated` (devin doctor warns CFG005 on nonstandard keys),
// keep `tools:` as-is. The rest of the frontmatter ships verbatim.
function renderDevinAgentMarkdown(markdown) {
  const { frontmatter, body } = parseFrontmatter(markdown);
  if (!frontmatter.name) {
    throw new Error("Agent markdown is missing frontmatter name");
  }

  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  const kept = match[1].split("\n").filter((line) => {
    if (/^(?:created|updated):/.test(line)) return false;
    const model = line.match(/^model:\s*(\S+)\s*$/);
    return !model || (model[1] !== "inherit" && model[1] !== "haiku");
  });

  return renderDevinText(
    `---\n${kept.join("\n")}\n---\n${body.replace(/^\n+/, "")}`,
  );
}

async function writeDevinAgents(sourceAgentDir, targetAgentDir) {
  await fs.mkdir(targetAgentDir, { recursive: true });
  const entries = await fs.readdir(sourceAgentDir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !/^cf-.*\.md$/.test(entry.name)) continue;
    const sourcePath = path.join(sourceAgentDir, entry.name);
    const markdown = await fs.readFile(sourcePath, "utf8");
    await fs.writeFile(
      path.join(targetAgentDir, entry.name),
      renderDevinAgentMarkdown(markdown),
    );
  }
}

function transformDevinHooks() {
  return {
    hooks: {
      SessionStart: [
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command:
                "CF_HOST=devin ${CLAUDE_PLUGIN_ROOT}/hooks/session-init.sh",
            },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command:
                "CF_HOST=devin ${CLAUDE_PLUGIN_ROOT}/hooks/rules-reminder.devin.sh",
            },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: "^(read|write|edit|glob|grep)$",
          hooks: [
            {
              type: "command",
              command:
                "CF_HOST=devin ${CLAUDE_PLUGIN_ROOT}/hooks/block-adapter.devin.sh privacy-block.sh",
            },
            {
              type: "command",
              command:
                "CF_HOST=devin ${CLAUDE_PLUGIN_ROOT}/hooks/block-adapter.devin.sh scout-block.cjs",
            },
          ],
        },
      ],
      PermissionRequest: [
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command:
                "CF_HOST=devin ${CLAUDE_PLUGIN_ROOT}/hooks/auto-approve.devin.cjs",
            },
          ],
        },
      ],
      Stop: [
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command:
                "CF_HOST=devin ${CLAUDE_PLUGIN_ROOT}/hooks/session-log.sh",
            },
          ],
        },
      ],
      PostCompaction: [
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command:
                "CF_HOST=devin ${CLAUDE_PLUGIN_ROOT}/hooks/memory-capture.devin.sh",
            },
          ],
        },
      ],
    },
  };
}

function collectHookCommands(node, commands = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectHookCommands(item, commands);
    return commands;
  }
  if (node && typeof node === "object") {
    if (typeof node.command === "string") commands.push(node.command);
    for (const value of Object.values(node)) {
      collectHookCommands(value, commands);
    }
  }
  return commands;
}

// Self-check: the generated hooks.json stays inside Devin's allow-list,
// non-tool events carry no matcher, every command is CF_HOST=devin prefixed,
// and every hook script it references (the `${CLAUDE_PLUGIN_ROOT}/hooks/<file>`
// entry point plus bare sibling args like `block-adapter.devin.sh privacy-block.sh`)
// exists in the generated tree and is executable.
async function assertDevinHooksContract(hooks, devinPluginDir) {
  const problems = [];
  const hooksDir = path.join(devinPluginDir, "hooks");

  for (const [event, entries] of Object.entries(hooks.hooks ?? {})) {
    if (!DEVIN_HOOK_EVENTS.has(event)) {
      problems.push(`hooks.json uses unsupported Devin event: ${event}`);
      continue;
    }
    for (const entry of entries ?? []) {
      if (!DEVIN_TOOL_MATCHER_EVENTS.has(event) && entry.matcher !== "") {
        problems.push(`hooks.json ${event} must not set a matcher`);
      }
      for (const hook of entry.hooks ?? []) {
        const command = hook?.command;
        if (typeof command !== "string") {
          problems.push(`hooks.json ${event} hook is missing a command string`);
          continue;
        }
        if (!command.startsWith("CF_HOST=devin ")) {
          problems.push(
            `hooks.json ${event} command must start with "CF_HOST=devin ": ${command}`,
          );
        }
        for (const token of command.split(/\s+/).slice(1)) {
          const script = token.startsWith("${CLAUDE_PLUGIN_ROOT}/hooks/")
            ? token.slice("${CLAUDE_PLUGIN_ROOT}/hooks/".length)
            : token;
          if (!/^[\w.-]+\.(?:sh|cjs)$/.test(script)) continue;
          const scriptPath = path.join(hooksDir, script);
          try {
            await fs.access(scriptPath, fs.constants.X_OK);
          } catch {
            problems.push(
              `hooks.json ${event} references missing or non-executable script: hooks/${script}`,
            );
          }
        }
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `Generated Devin hooks.json violates the Devin hook contract:\n${problems
        .map((problem) => `  - ${problem}`)
        .join("\n")}`,
    );
  }
}

// Post-copy guard: any *.codex.* / *.agy.* / agy- path under plugin-devin/
// means the exclusion list fell out of sync with plugin/ sources.
async function assertNoForeignHostPaths(devinPluginDir) {
  const offenders = [];

  async function walk(dir, prefix = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (
        relativePath.includes(".codex.") ||
        relativePath.includes(".agy.") ||
        relativePath.includes("agy-")
      ) {
        offenders.push(relativePath);
      }
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), relativePath);
      }
    }
  }

  await walk(devinPluginDir);
  if (offenders.length > 0) {
    throw new Error(
      `Generated Devin plugin contains other-host files:\n${offenders
        .map((offender) => `  - ${offender}`)
        .join("\n")}`,
    );
  }
}

function createDevinPluginManifest({ version, sourceManifest }) {
  const manifest = {
    name: "coding-friend",
    version,
    description: `${sourceManifest.description} — for Devin CLI (beta)`,
  };
  if (sourceManifest.author) manifest.author = sourceManifest.author;
  if (sourceManifest.keywords) manifest.keywords = sourceManifest.keywords;
  if (sourceManifest.license) manifest.license = sourceManifest.license;
  return manifest;
}

// DECIDED (spec §6): the no-arg `mcp-serve` resolves the memory dir from
// `CLAUDE_PROJECT_DIR ?? process.cwd()`, and Devin's MCP cwd is the project
// dir — so no memoryDir arg (a relative one would write into plugin-devin/).
function createDevinMcpConfig() {
  return {
    mcpServers: {
      "coding-friend-memory": {
        command: "npx",
        args: ["-y", "coding-friend-cli", "mcp-serve"],
      },
    },
  };
}

function renderDevinReadme() {
  return `# Coding Friend — Devin CLI (beta)

Lean toolkit for disciplined engineering workflows — the same skills, agents,
hooks and memory system as the Claude Code plugin, repackaged for Devin CLI.

> **Beta:** Devin support is new — report issues at
> https://github.com/dinhanhthi/coding-friend/issues.

## Install

Production (GitHub, the \`plugin-devin/\` subdirectory of the repo):

\`\`\`bash
devin plugins install dinhanhthi/coding-friend#plugin-devin
\`\`\`

Development (local checkout — symlinked, so edits apply to new sessions):

\`\`\`bash
devin plugins install --local /path/to/coding-friend/plugin-devin
\`\`\`

## Usage

Slash commands resolve bare or namespaced: \`/cf-plan\` and
\`/coding-friend:cf-plan\` are the same skill. Subagents run through the
\`run_subagent\` tool with profile \`coding-friend:<agent>\`.

The plugin ships the \`coding-friend-memory\` MCP server via \`.mcp.json\`
(\`npx -y coding-friend-cli mcp-serve\`). Install the
[\`coding-friend-cli\`](https://www.npmjs.com/package/coding-friend-cli) for
indexed memory search; skills fall back to grep + direct file writes without it.

## Known Differences

Compared to the Claude Code plugin, on Devin CLI:

- No task tracker or agent tracker — the \`TaskCreated\`, \`TaskCompleted\`,
  \`SubagentStart\` and \`SubagentStop\` hook events do not exist.
- No statusline hook.
- \`/cf-session\` is a stub: use native resume — \`devin -r <id>\`, \`devin -c\`,
  \`devin list\`, or \`/resume\` / \`/ls\` in the REPL.
- Memory auto-capture is deferred to the first prompt AFTER compaction —
  \`PostCompaction\` context is not delivered to the model.
- Agents with \`model: inherit\` or \`model: haiku\` run on Devin's default
  subagent model; \`sonnet\` and \`opus\` are kept.
- No per-plugin enable/disable — \`cf enable/disable --agent devin\` prints
  guidance instead.
- Notebook tools (\`notebook_read\`, \`notebook_edit\`) are not covered by the
  privacy/scout PreToolUse filters — the matcher covers
  \`read|write|edit|glob|grep\` only.
- \`\${CLAUDE_PLUGIN_ROOT}\` is not expanded inside skill bodies — use the
  \`<plugin-root>\` token documented in each SKILL.md.
- Hooks are session-bound: edits to a \`--local\` install apply to new
  sessions only.
- \`-p\` (non-interactive) mode denies anything the auto-approve hook does not
  approve.
- CLI/Desktop sessions only — Devin cloud sessions do not load local plugins.
`;
}

async function buildDevinPlugin({ repoRoot = REPO_ROOT } = {}) {
  const pluginSourceDir = path.join(repoRoot, "plugin");
  const devinPluginDir = path.join(repoRoot, "plugin-devin");
  await assertSourceDir(pluginSourceDir);

  const packageJson = JSON.parse(
    await fs.readFile(path.join(repoRoot, "package.json"), "utf8"),
  );
  const sourceManifest = JSON.parse(
    await fs.readFile(
      path.join(pluginSourceDir, ".claude-plugin", "plugin.json"),
      "utf8",
    ),
  );

  await fs.rm(devinPluginDir, { recursive: true, force: true });
  await fs.mkdir(devinPluginDir, { recursive: true });

  const treeOptions = {
    render: renderDevinFile,
    exclude: DEVIN_EXCLUDED_SOURCE_PATHS,
  };
  for (const dir of ["skills", "hooks", "lib", "context"]) {
    await copyRenderedTree(
      path.join(pluginSourceDir, dir),
      path.join(devinPluginDir, dir),
      { ...treeOptions, prefix: dir },
    );
  }

  await writeDevinAgents(
    path.join(pluginSourceDir, "agents"),
    path.join(devinPluginDir, "agents"),
  );

  await fs.writeFile(
    path.join(devinPluginDir, "README.md"),
    renderDevinReadme(),
  );

  const hooks = transformDevinHooks();
  await assertDevinHooksContract(hooks, devinPluginDir);
  await fs.writeFile(
    path.join(devinPluginDir, "hooks", "hooks.json"),
    stableJson(hooks),
  );

  await fs.writeFile(
    path.join(devinPluginDir, ".mcp.json"),
    stableJson(createDevinMcpConfig()),
  );
  await fs.mkdir(path.join(devinPluginDir, ".claude-plugin"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(devinPluginDir, ".claude-plugin", "plugin.json"),
    stableJson(
      createDevinPluginManifest({
        version: packageJson.version,
        sourceManifest,
      }),
    ),
  );

  await assertNoForeignHostPaths(devinPluginDir);

  const { findDevinArtifactLintIssues } = await import(
    pathToFileURL(path.join(__dirname, "placeholder-lint.mjs")).href
  );
  const lintIssues = await findDevinArtifactLintIssues(repoRoot, {
    strict: path.resolve(repoRoot) === path.resolve(REPO_ROOT),
  });
  if (lintIssues.length > 0) {
    const details = lintIssues
      .map(
        (issue) => `${issue.file}:${issue.line}: ${issue.type}: ${issue.value}`,
      )
      .join("\n");
    throw new Error(
      `Generated Devin plugin contains unresolved or host-incompatible references:\n${details}`,
    );
  }
}

if (require.main === module) {
  buildDevinPlugin().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  DEVIN_EXCLUDED_SOURCE_PATHS,
  DEVIN_HOOK_EVENTS,
  buildDevinPlugin,
  createDevinMcpConfig,
  createDevinPluginManifest,
  renderDevinAgentMarkdown,
  renderDevinFile,
  renderDevinSessionSkill,
  renderDevinText,
  transformDevinHooks,
};
