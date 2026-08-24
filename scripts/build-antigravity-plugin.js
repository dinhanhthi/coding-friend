#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

const REPO_ROOT = path.resolve(__dirname, "..");
const PLUGIN_SOURCE_DIR = path.join(REPO_ROOT, "plugin");
const AGY_PLUGIN_DIR = path.join(REPO_ROOT, "plugin-antigravity");

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

function renderAntigravityText(input) {
  return input
    .replace(/\{\{cf:slash\s+([a-z0-9-]+)\}\}/g, (_match, name) => `/${name}`)
    .replace(/\{\{cf:agent_ref\s+([a-z0-9-]+)\}\}/g, (_match, name) => name)
    .replace(
      /\{\{cf:skill_invoke\s+([a-z0-9-]+)\}\}/g,
      (_match, name) => `activate skill \`${name}\``,
    )
    .replace(/\{\{cf:plugin_root\}\}/g, "${AGY_PLUGIN_ROOT}")
    .replace(/\{\{cf:host\}\}/g, "Google Antigravity")
    .replace(
      /\{\{cf:dispatch\s+agent=([a-z0-9-]+)\s+prompt="([^"]*)"\}\}/g,
      (_match, agent, prompt) =>
        [
          `Spawn a subagent or invoke skill \`${agent}\` with the following task:`,
          "",
          prompt,
          "",
          "Wait for it to finish and integrate results.",
        ].join("\n"),
    )
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, "${AGY_PLUGIN_ROOT}")
    .replace(/CLAUDE_PLUGIN_ROOT/g, "AGY_PLUGIN_ROOT")
    .replace(/\bCLAUDE\.md\b/g, "GEMINI.md")
    .replace(/\bhaiku\b/g, "flash")
    .replace(/\bsonnet\b/g, "pro")
    .replace(/\bopus\b/g, "pro");
}

function stripClaudeSkillFrontmatter(input) {
  const match = input.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    return input;
  }
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

async function copyRenderedFile(src, dest, transformFn = renderAntigravityText) {
  if (isTextFile(src)) {
    const content = await fs.readFile(src, "utf8");
    const transformed = transformFn(content);
    await fs.writeFile(dest, transformed, "utf8");
  } else {
    await fs.copyFile(src, dest);
  }
}

async function copyRenderedTree(srcDir, destDir, kind) {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_COPY_ENTRIES.has(entry.name)) continue;

    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyRenderedTree(srcPath, destPath, kind);
    } else if (entry.isFile()) {
      let transformFn = renderAntigravityText;
      if (entry.name === "SKILL.md") {
        transformFn = (content) => stripClaudeSkillFrontmatter(renderAntigravityText(content));
      }
      await copyRenderedFile(srcPath, destPath, transformFn);
    }
  }
}

function createAntigravityPluginManifest({ version }) {
  return {
    name: "coding-friend",
    version,
    description: "Lean toolkit for disciplined engineering workflows with Google Antigravity (AGY)",
    author: {
      name: "Anh-Thi Dinh",
      email: "me@dinhanhthi.com",
      url: "https://dinhanhthi.com",
    },
    license: "MIT",
    keywords: [
      "antigravity",
      "agy",
      "skills",
      "tdd",
      "debugging",
      "code-review",
      "workflows",
      "knowledge",
      "memory"
    ]
  };
}

function createAntigravityMcpConfig() {
  return {
    mcpServers: {
      "coding-friend-memory": {
        command: "npx",
        args: ["-y", "coding-friend-cli", "mcp-serve", "docs/memory"],
        env: {}
      }
    }
  };
}

async function buildAntigravityPlugin({ repoRoot = REPO_ROOT } = {}) {
  const pluginSourceDir = path.join(repoRoot, "plugin");
  const agyPluginDir = path.join(repoRoot, "plugin-antigravity");

  const packageJson = JSON.parse(
    await fs.readFile(path.join(repoRoot, "package.json"), "utf8"),
  );

  console.log(`Building Antigravity plugin v${packageJson.version}...`);

  await fs.rm(agyPluginDir, { recursive: true, force: true });
  await fs.mkdir(agyPluginDir, { recursive: true });

  await copyRenderedTree(
    path.join(pluginSourceDir, "skills"),
    path.join(agyPluginDir, "skills"),
    "skills",
  );

  await copyRenderedTree(
    path.join(pluginSourceDir, "hooks"),
    path.join(agyPluginDir, "hooks"),
    "hooks",
  );
  await copyRenderedTree(
    path.join(pluginSourceDir, "lib"),
    path.join(agyPluginDir, "lib"),
    "lib",
  );
  await copyRenderedTree(
    path.join(pluginSourceDir, "context"),
    path.join(agyPluginDir, "context"),
    "context",
  );

  await copyRenderedTree(
    path.join(pluginSourceDir, "agents"),
    path.join(agyPluginDir, "agents"),
    "agents",
  );

  for (const filename of ["README.md", "CHANGELOG.md"]) {
    const srcFile = path.join(pluginSourceDir, filename);
    try {
      await copyRenderedFile(srcFile, path.join(agyPluginDir, filename));
    } catch (error) {
      if (error && error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  await fs.writeFile(
    path.join(agyPluginDir, "plugin.json"),
    stableJson(createAntigravityPluginManifest({ version: packageJson.version })),
  );

  await fs.writeFile(
    path.join(agyPluginDir, "mcp_config.json"),
    stableJson(createAntigravityMcpConfig()),
  );

  console.log(" Antigravity plugin built successfully at:", agyPluginDir);
}

if (require.main === module) {
  buildAntigravityPlugin().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  buildAntigravityPlugin,
  createAntigravityMcpConfig,
  createAntigravityPluginManifest,
  renderAntigravityText,
  stripClaudeSkillFrontmatter,
};
