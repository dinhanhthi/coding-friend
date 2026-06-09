#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  agentMarkdownToToml: convertAgentMarkdownToToml,
} = require("./lib/agent-md-to-toml.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const PLUGIN_SOURCE_DIR = path.join(REPO_ROOT, "plugin");
const CODEX_PLUGIN_DIR = path.join(REPO_ROOT, "plugin-codex");

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
const CODEX_HOOK_EVENTS = new Set([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Stop",
  "PermissionRequest",
  "PreCompact",
  "SubagentStart",
  "SubagentStop",
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

function renderCodexText(input) {
  return input
    .replace(/\{\{cf:slash\s+([a-z0-9-]+)\}\}/g, (_match, name) => `$${name}`)
    .replace(/\{\{cf:agent_ref\s+([a-z0-9-]+)\}\}/g, (_match, name) => name)
    .replace(
      /\{\{cf:skill_invoke\s+([a-z0-9-]+)\}\}/g,
      (_match, name) => `load \`$${name}\``,
    )
    .replace(/\{\{cf:plugin_root\}\}/g, "${PLUGIN_ROOT}")
    .replace(/\{\{cf:host\}\}/g, "Codex CLI")
    .replace(
      /\{\{cf:dispatch\s+agent=([a-z0-9-]+)\s+prompt="([^"]*)"\}\}/g,
      (_match, agent, prompt) =>
        [
          `Spawn a subagent named \`${agent}\` with the following instructions:`,
          "",
          prompt,
          "",
          "Wait for it to finish and use its output.",
        ].join("\n"),
    )
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, "${PLUGIN_ROOT}")
    .replace(/CLAUDE_PLUGIN_ROOT/g, "PLUGIN_ROOT")
    .replace(
      /use the Skill tool with skill name `coding-friend:(cf-[a-z0-9-]+)`/g,
      (_match, name) => `load \`$${name}\``,
    )
    .replace(
      /Use the \*\*Agent tool\*\* with `subagent_type: "coding-friend:(cf-[a-z0-9-]+)"`\./g,
      (_match, name) => `Spawn the \`${name}\` custom agent.`,
    )
    .replace(
      /via the \*\*Agent tool\*\* with `subagent_type: "coding-friend:(cf-[a-z0-9-]+)"`/g,
      (_match, name) => `by spawning the \`${name}\` custom agent`,
    )
    .replace(
      /\(Agent tool, `subagent_type: "coding-friend:(cf-[a-z0-9-]+)"`\)/g,
      (_match, name) => `(spawn the \`${name}\` custom agent)`,
    )
    .replace(
      /`subagent_type: "coding-friend:(cf-[a-z0-9-]+)"`/g,
      (_match, name) => `\`${name}\` custom agent`,
    )
    .replace(
      /(?<![A-Za-z0-9_-])\/(cf-[a-z0-9-]+)\b/g,
      (_match, name) => `$${name}`,
    );
}

function renderCodexInstructionText(input) {
  return renderCodexText(input)
    .replace(/\busing the Agent tool\b/gi, "using Codex subagent orchestration")
    .replace(/\*\*Agent tool\*\*/g, "Codex subagent workflow")
    .replace(/\bAgent tool\b/g, "Codex subagent workflow")
    .replace(/`AskUserQuestion`/g, "a direct user question")
    .replace(/\bAskUserQuestion\b/g, "a direct user question")
    .replace(/\(haiku\)/g, "(low reasoning effort)")
    .replace(/\(sonnet\)/g, "(medium reasoning effort)")
    .replace(/\(opus\)/g, "(high reasoning effort)")
    .replace(/\bCLAUDE\.md\b/g, "AGENTS.md")
    .replace(/\bWebSearch and WebFetch\b/g, "web search and source opening")
    .replace(/\bWebSearch\b/g, "web search")
    .replace(/\bWebFetch\b/g, "source opening")
    .replace(
      /Use the Write tool for new files/g,
      "Create new files with the available file-editing tool",
    )
    .replace(
      /Use the Edit tool for appending to or updating existing files/g,
      "Edit existing files with the available file-editing tool",
    )
    .replace(/\bEdit tool calls?\b/g, "file edits")
    .replace(/\bEdit calls?\b/g, "file edits")
    .replace(
      /it runs on Haiku for cost\s+efficiency\./gi,
      "it uses low reasoning effort for cost efficiency.",
    )
    .replace(
      /Runs on Haiku for speed\./g,
      "Uses low reasoning effort for speed.",
    )
    .replace(
      /Runs on Sonnet for deeper reasoning\s+than Haiku\./g,
      "Uses medium reasoning effort for deeper analysis.",
    )
    .replace(/\(model: sonnet\)/g, "(reasoning: medium)")
    .replace(/\(model: haiku\)/g, "(reasoning: low)")
    .replace(
      /Launch the `cf-reviewer-reducer` agent \(model: haiku by default — honor the `CF_REDUCER_MODEL` environment variable if set to `sonnet` or `opus`, to let users upgrade reducer quality without editing agent files\)/g,
      "Launch the `cf-reviewer-reducer` agent with its configured low reasoning effort",
    )
    .replace(
      /re-run with `CF_REDUCER_MODEL=sonnet` for a more conservative merge/g,
      "rerun after configuring the reducer with medium reasoning effort for a more conservative merge",
    )
    .replace(/helps Claude produce/g, "helps Codex produce")
    .replace(/phase file Claude re-opens/g, "phase file Codex re-opens")
    .replace(/if Claude finds itself/g, "if Codex finds itself")
    .replace(/Claude does NOT need/g, "Codex does NOT need")
    .replace(
      /> If `review\.withCodex: true` is set in the config, cf-review automatically runs a Codex second-opinion review alongside Claude's and merges both — no flag needed here \(cf-review reads the config itself\)\./g,
      "> On Codex, cf-review uses the native Coding Friend multi-agent review and ignores the Claude-only `review.withCodex` second-opinion setting.",
    )
    .replace(
      /\(If `review\.withCodex: true` is set in the config, cf-review automatically adds a Codex second-opinion review and merges both — no flag needed here\.\)/g,
      "(On Codex, cf-review uses the native Coding Friend multi-agent review and ignores the Claude-only `review.withCodex` setting.)",
    );
}

function renderCodexPlanSkill(input) {
  return input
    .replace(/tracked via TaskCreate/g, "tracked with an inline checklist")
    .replace(
      /register tasks via TaskCreate/g,
      "register tasks in an inline checklist",
    )
    .replace(
      /Progress tracked via TaskCreate/g,
      "Progress tracked with an inline checklist",
    )
    .replace(
      /Use TaskCreate to register every task from the plan/g,
      "Create an inline checklist containing every task from the plan",
    )
    .replace(
      /Use TaskCreate to create a task list\./g,
      "Create a task checklist and keep it updated.",
    )
    .replace(
      /Progress tracking in Step 7 uses TaskUpdate/g,
      "Progress tracking in Step 7 updates the inline checklist",
    )
    .replace(
      /use TaskUpdate on the corresponding task/g,
      "update the corresponding checklist item",
    )
    .replace(
      /call TaskUpdate on the corresponding task/g,
      "update the corresponding checklist item",
    )
    .replace(
      /Spawn one cf-implementer \*\*per task\*\* with `run_in_background: true` — all in a \*\*single message block\*\*\./g,
      "Ask Codex to spawn one `cf-implementer` custom agent per task in parallel, wait for all agents, and collect each result.",
    );
}

function renderCodexReviewSkill(input) {
  return input
    .replace(
      /\*\*Codex dual-review flag:\*\*[\s\S]*?(?=\n### Step 2: Gather the diff)/,
      [
        "**Codex host behavior:**",
        "",
        "- This skill already runs inside Codex. Ignore `--with-codex`, its `--codex` alias, and `review.withCodex`; do not launch a nested `codex review` subprocess.",
        "- Run the Coding Friend multi-agent review below.",
        "",
      ].join("\n"),
    )
    .replace(
      /### Step 2\.5: Spawn Codex review in the background \(only when `codex=true`\)[\s\S]*?(?=\n### Step 3: Assess change size)/,
      "",
    )
    .replace(
      /### Step 6\.5: Collect & normalize the Codex review \(only when `codex=true`\)[\s\S]*?(?=\n### Step 7: Collect the report)/,
      "",
    )
    .replace(
      /### Step 7: Collect the report[\s\S]*?(?=\n### Step 8: Mark review complete and display status)/,
      [
        "### Step 7: Collect the report",
        "",
        "The result of Step 6 is the final formatted report (Critical / Important / Suggestions / Summary). Do not reformat or restructure it; use it as-is in Step 10.",
        "",
      ].join("\n"),
    )
    .replace(/Claude's own review/g, "Coding Friend's multi-agent review")
    .replace(/Claude-only review/g, "Coding Friend review")
    .replace(
      /Display the cf-reviewer's report first, then append the appropriate banner\. When `codex=true`, add a `· Reviewed by: Claude \+ Codex` suffix to the `Mode:` line of whichever banner is shown \(when `codex=false`, omit the suffix\)\./,
      "Display the cf-reviewer's report first, then append the appropriate banner.",
    )
    .replace(/\n{3,}/g, "\n\n");
}

function renderCodexSessionSkill() {
  return `---
name: cf-session
description: >
  Continue or branch Codex conversations with the native session controls. Use when the user
  asks to resume, continue, fork, or restore a Codex session. Codex owns its transcript format,
  so Coding Friend does not copy or rewrite session JSONL files.
---

# $cf-session

Codex provides native session management:

- Use \`/resume\` in the TUI or run \`codex resume\` to continue a saved conversation.
- Use \`/fork\` in the TUI or run \`codex fork\` to branch a conversation.
- Use \`/archive\` to archive the current conversation without deleting its transcript.

Do not run Coding Friend's Claude session scripts or parse Codex session files. If the user
needs cross-machine continuity, explain that native Codex session availability is the supported
path and keep durable project knowledge in \`docs/memory/\`.
`;
}

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

function renderCodexFile(sourcePath, input) {
  const normalizedPath = sourcePath.split(path.sep).join("/");
  const isSkill = normalizedPath.endsWith("/SKILL.md");
  const isInstruction =
    isSkill ||
    normalizedPath.includes("/context/") ||
    normalizedPath.endsWith("/plugin/README.md");
  let rendered = isInstruction
    ? renderCodexInstructionText(input)
    : renderCodexText(input);

  if (isSkill) {
    rendered = stripClaudeSkillFrontmatter(rendered);
  }

  if (normalizedPath.endsWith("/skills/cf-plan/SKILL.md")) {
    rendered = renderCodexPlanSkill(rendered);
  } else if (normalizedPath.endsWith("/skills/cf-review/SKILL.md")) {
    rendered = renderCodexReviewSkill(rendered);
  } else if (normalizedPath.endsWith("/skills/cf-session/SKILL.md")) {
    rendered = renderCodexSessionSkill();
  } else if (normalizedPath.endsWith("/skills/cf-help/SKILL.md")) {
    rendered = rendered
      .replace(
        "Coding Friend is a lean toolkit for disciplined engineering workflows in Claude Code.",
        "Coding Friend is a lean toolkit for disciplined engineering workflows in Codex CLI.",
      )
      .replace(
        / Flag: `--with-codex` runs a Codex second-opinion review in parallel and merges both into one report \(set `review\.withCodex: true` in config to enable by default; auto-skips with a warning if Codex is unavailable\)\./,
        "",
      );
  } else if (normalizedPath.endsWith("/skills/cf-review-out/SKILL.md")) {
    rendered = rendered.replace(
      /> \*\*Using Codex\?\*\*[\s\S]*?(?=\n\n)/,
      "> **Using Codex?** Run `$cf-review` directly. The review-out/review-in round trip remains available for other external reviewers or humans.",
    );
  }

  return rendered;
}

async function copyRenderedFile(sourcePath, targetPath) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const mode = (await fs.stat(sourcePath)).mode & 0o777;
  if (!isTextFile(sourcePath)) {
    await fs.copyFile(sourcePath, targetPath);
    await fs.chmod(targetPath, mode);
    return;
  }
  const source = await fs.readFile(sourcePath, "utf8");
  await fs.writeFile(targetPath, renderCodexFile(sourcePath, source));
  await fs.chmod(targetPath, mode);
}

async function copyRenderedTree(sourceDir, targetDir) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (IGNORED_COPY_ENTRIES.has(entry.name)) continue;

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyRenderedTree(sourcePath, targetPath);
      continue;
    }
    if (entry.isFile()) {
      await copyRenderedFile(sourcePath, targetPath);
    }
  }
}

async function writeCodexAgents(sourceAgentDir, targetAgentDir) {
  await fs.mkdir(targetAgentDir, { recursive: true });
  const entries = await fs.readdir(sourceAgentDir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !/^cf-.*\.md$/.test(entry.name)) continue;
    const sourcePath = path.join(sourceAgentDir, entry.name);
    const targetPath = path.join(
      targetAgentDir,
      entry.name.replace(/\.md$/, ".toml"),
    );
    const markdown = await fs.readFile(sourcePath, "utf8");
    await fs.writeFile(
      targetPath,
      convertAgentMarkdownToToml(markdown, {
        renderText: renderCodexInstructionText,
      }),
    );
  }
}

function transformCodexHooks(hooksJson) {
  const output = { hooks: {} };
  const hooks = hooksJson.hooks ?? {};
  let needsPermissionHook = false;

  const renderHookCommand = (command) => {
    const rendered = renderCodexText(command).replace(
      /\/hooks\/memory-capture\.sh\b/g,
      "/hooks/memory-capture.codex.sh",
    );
    return rendered.startsWith("CF_HOST=")
      ? rendered
      : `CF_HOST=codex ${rendered}`;
  };

  for (const eventName of Object.keys(hooks).sort()) {
    if (!CODEX_HOOK_EVENTS.has(eventName)) continue;

    const entries = hooks[eventName]
      .map((entry) => {
        const renderedHooks = (entry.hooks ?? []).flatMap((hook) => {
          const command = typeof hook.command === "string" ? hook.command : "";
          if (/\/hooks\/auto-approve\.cjs\b/.test(command)) {
            needsPermissionHook = true;
            return [];
          }

          const nextHook = {
            ...hook,
            command:
              typeof hook.command === "string"
                ? renderHookCommand(hook.command)
                : hook.command,
          };
          delete nextHook.async;
          return [nextHook];
        });

        if (renderedHooks.length === 0) return null;
        return {
          ...entry,
          hooks: renderedHooks,
        };
      })
      .filter(Boolean);

    if (entries.length > 0) {
      output.hooks[eventName] = entries;
    }
  }

  if (needsPermissionHook) {
    output.hooks.PermissionRequest = [
      ...(output.hooks.PermissionRequest ?? []),
      {
        matcher: "",
        hooks: [
          {
            type: "command",
            command:
              "CF_HOST=codex ${PLUGIN_ROOT}/hooks/auto-approve.codex.cjs",
          },
        ],
      },
    ];
  }

  return output;
}

function createCodexPluginManifest({ version }) {
  return {
    name: "coding-friend",
    version,
    description:
      "Lean toolkit for disciplined engineering workflows with Codex CLI",
    author: {
      name: "Anh-Thi Dinh",
      email: "me@dinhanhthi.com",
      url: "https://dinhanhthi.com",
    },
    license: "MIT",
    keywords: [
      "skills",
      "tdd",
      "debugging",
      "code-review",
      "workflows",
      "knowledge",
      "agents",
    ],
    skills: "./skills/",
    hooks: "./hooks/hooks.json",
    mcpServers: "./.mcp.json",
    interface: {
      displayName: "Coding Friend",
      shortDescription: "Disciplined engineering workflows for Codex CLI",
      longDescription:
        "Coding Friend adds structured planning, debugging, review, commit, learning, research, and memory workflows to Codex CLI.",
      developerName: "Anh-Thi Dinh",
      category: "Developer Tools",
      capabilities: ["Read", "Write", "Interactive"],
      websiteURL: "https://cf.dinhanhthi.com/",
      defaultPrompt: [
        "Plan and implement this feature with Coding Friend",
        "Review my current changes with Coding Friend",
      ],
      brandColor: "#166534",
    },
  };
}

function createCodexMcpConfig() {
  return {
    mcpServers: {
      "coding-friend-memory": {
        command: "npx",
        args: ["-y", "coding-friend-cli", "mcp-serve", "docs/memory"],
        env: {},
      },
    },
  };
}

async function buildCodexPlugin({ repoRoot = REPO_ROOT } = {}) {
  const pluginSourceDir = path.join(repoRoot, "plugin");
  const codexPluginDir = path.join(repoRoot, "plugin-codex");
  try {
    const sourceStat = await fs.stat(pluginSourceDir);
    if (!sourceStat.isDirectory()) {
      throw new Error(`Missing plugin source directory: ${pluginSourceDir}`);
    }
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error(`Missing plugin source directory: ${pluginSourceDir}`);
    }
    throw error;
  }

  const packageJson = JSON.parse(
    await fs.readFile(path.join(repoRoot, "package.json"), "utf8"),
  );

  await fs.rm(codexPluginDir, { recursive: true, force: true });
  await fs.mkdir(codexPluginDir, { recursive: true });

  await copyRenderedTree(
    path.join(pluginSourceDir, "skills"),
    path.join(codexPluginDir, "skills"),
  );
  await copyRenderedTree(
    path.join(pluginSourceDir, "hooks"),
    path.join(codexPluginDir, "hooks"),
  );
  await copyRenderedTree(
    path.join(pluginSourceDir, "lib"),
    path.join(codexPluginDir, "lib"),
  );
  await copyRenderedTree(
    path.join(pluginSourceDir, "context"),
    path.join(codexPluginDir, "context"),
  );

  for (const filename of ["README.md", "CHANGELOG.md"]) {
    await copyRenderedFile(
      path.join(pluginSourceDir, filename),
      path.join(codexPluginDir, filename),
    );
  }

  await writeCodexAgents(
    path.join(pluginSourceDir, "agents"),
    path.join(codexPluginDir, "agents"),
  );

  const hooksJson = JSON.parse(
    await fs.readFile(path.join(pluginSourceDir, "hooks/hooks.json"), "utf8"),
  );
  await fs.writeFile(
    path.join(codexPluginDir, "hooks/hooks.json"),
    stableJson(transformCodexHooks(hooksJson)),
  );

  await fs.mkdir(path.join(codexPluginDir, ".codex-plugin"), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(codexPluginDir, ".codex-plugin/plugin.json"),
    stableJson(createCodexPluginManifest({ version: packageJson.version })),
  );
  await fs.writeFile(
    path.join(codexPluginDir, ".mcp.json"),
    stableJson(createCodexMcpConfig()),
  );
}

if (require.main === module) {
  buildCodexPlugin().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  agentMarkdownToToml: (markdown) =>
    convertAgentMarkdownToToml(markdown, {
      renderText: renderCodexInstructionText,
    }),
  buildCodexPlugin,
  createCodexMcpConfig,
  createCodexPluginManifest,
  renderCodexFile,
  renderCodexInstructionText,
  renderCodexText,
  transformCodexHooks,
};
