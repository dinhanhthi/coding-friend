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
    .replace(
      /\{\{cf:agent_ref\s+([a-z0-9-]+)\}\}/g,
      (_match, name) => `$${name}`,
    )
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
      /(?<![A-Za-z0-9_-])\/(cf-[a-z0-9-]+)\b/g,
      (_match, name) => `$${name}`,
    );
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
  await fs.writeFile(targetPath, renderCodexText(source));
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
      convertAgentMarkdownToToml(markdown, { renderText: renderCodexText }),
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
      },
    },
  };
}

async function buildCodexPlugin({ repoRoot = REPO_ROOT } = {}) {
  const pluginSourceDir = path.join(repoRoot, "plugin");
  const codexPluginDir = path.join(repoRoot, "plugin-codex");
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
    convertAgentMarkdownToToml(markdown, { renderText: renderCodexText }),
  buildCodexPlugin,
  createCodexMcpConfig,
  createCodexPluginManifest,
  renderCodexText,
  transformCodexHooks,
};
