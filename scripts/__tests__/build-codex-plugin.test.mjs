import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  agentMarkdownToToml,
  buildCodexPlugin,
  createCodexPluginManifest,
  createCodexMcpConfig,
  renderCodexText,
  transformCodexHooks,
} = require("../build-codex-plugin.js");

async function writeText(filePath, content, mode) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  if (mode) await fs.chmod(filePath, mode);
}

async function createFixtureRepo() {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cf-codex-build-"));
  await writeText(
    path.join(repoRoot, "package.json"),
    JSON.stringify({ version: "9.8.7" }),
  );
  await writeText(
    path.join(repoRoot, "plugin", "skills", "cf-example", "SKILL.md"),
    "Use {{cf:host}}, {{cf:slash cf-review}}, and {{cf:agent_ref cf-writer}}.\n",
  );
  await writeText(
    path.join(repoRoot, "plugin", "hooks", "hooks.json"),
    JSON.stringify({
      hooks: {
        TaskCreated: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "task-tracker.sh" }],
          },
        ],
        PreToolUse: [
          {
            matcher: "",
            hooks: [
              {
                type: "command",
                command: "${CLAUDE_PLUGIN_ROOT}/hooks/auto-approve.cjs",
              },
            ],
          },
          {
            matcher: "Read|Write",
            hooks: [
              {
                type: "command",
                command: "${CLAUDE_PLUGIN_ROOT}/hooks/privacy-block.sh",
                async: true,
              },
            ],
          },
        ],
      },
    }),
  );
  await writeText(
    path.join(repoRoot, "plugin", "hooks", "privacy-block.sh"),
    "#!/usr/bin/env bash\necho {{cf:host}}\n",
    0o755,
  );
  await writeText(
    path.join(repoRoot, "plugin", "lib", "helper.js"),
    "export const root = process.env.CLAUDE_PLUGIN_ROOT;\n",
  );
  await writeText(
    path.join(repoRoot, "plugin", "context", "notes.md"),
    "Run /cf-plan before dispatch.\n",
  );
  await writeText(
    path.join(repoRoot, "plugin", "README.md"),
    'Call {{cf:dispatch agent=cf-explorer prompt="inspect state"}}\n',
  );
  await writeText(
    path.join(repoRoot, "plugin", "CHANGELOG.md"),
    "Initial fixture.\n",
  );
  await writeText(
    path.join(repoRoot, "plugin", "agents", "cf-example.md"),
    [
      "---",
      "name: cf-example",
      "description: Example fixture agent.",
      "tools: Read, Bash",
      "---",
      "",
      "Use {{cf:slash cf-review}}.",
      "",
    ].join("\n"),
  );
  return repoRoot;
}

async function snapshotTree(root) {
  const files = [];

  async function walk(dir, prefix = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const relativePath = path.join(prefix, entry.name);
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = await fs.stat(absolutePath);
      const content = await fs.readFile(absolutePath);
      files.push({
        path: relativePath.replaceAll(path.sep, "/"),
        mode: (stat.mode & 0o777).toString(8),
        sha: Buffer.from(content).toString("base64"),
      });
    }
  }

  await walk(root);
  return files;
}

test("renders Coding Friend placeholders for Codex", () => {
  const rendered = renderCodexText(
    [
      "{{cf:slash cf-review}}",
      "{{cf:agent_ref cf-explorer}}",
      "{{cf:skill_invoke cf-learn}}",
      "{{cf:plugin_root}}/hooks/session-init.sh",
      "{{cf:host}}",
      '{{cf:dispatch agent=cf-explorer prompt="explore X"}}',
      "/cf-plan",
      "${CLAUDE_PLUGIN_ROOT}/hooks/rules-reminder.sh",
      "process.env.CLAUDE_PLUGIN_ROOT",
    ].join("\n"),
  );

  assert.equal(
    rendered,
    [
      "$cf-review",
      "$cf-explorer",
      "load `$cf-learn`",
      "${PLUGIN_ROOT}/hooks/session-init.sh",
      "Codex CLI",
      [
        "Spawn a subagent named `cf-explorer` with the following instructions:",
        "",
        "explore X",
        "",
        "Wait for it to finish and use its output.",
      ].join("\n"),
      "$cf-plan",
      "${PLUGIN_ROOT}/hooks/rules-reminder.sh",
      "process.env.PLUGIN_ROOT",
    ].join("\n"),
  );
});

test("creates stamped Codex plugin manifest", () => {
  const manifest = createCodexPluginManifest({ version: "1.2.3" });
  assert.equal(manifest.name, "coding-friend");
  assert.equal(manifest.version, "1.2.3");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.hooks, "./hooks/hooks.json");
  assert.equal(manifest.mcpServers, "./.mcp.json");
});

test("creates Codex MCP config for shared memory server", () => {
  assert.deepEqual(createCodexMcpConfig(), {
    mcpServers: {
      "coding-friend-memory": {
        command: "npx",
        args: ["-y", "coding-friend-cli", "mcp-serve", "docs/memory"],
        env: {},
      },
    },
  });
});

test("converts markdown agents to Codex TOML", () => {
  const toml = agentMarkdownToToml(`---
name: cf-example
description: >
  Example agent for testing conversion.
model: haiku
tools: Read, Write, Bash
---

# Example

Use {{cf:slash cf-review}} and {{cf:agent_ref cf-writer}}.
`);

  assert.match(toml, /name = "cf-example"/);
  assert.match(toml, /description = "Example agent for testing conversion\."/);
  assert.match(toml, /model = "haiku"/);
  assert.match(toml, /tools = \["Read", "Write", "Bash"\]/);
  assert.match(
    toml,
    /developer_instructions = '''\n# Example\n\nUse \$cf-review and \$cf-writer\.\n'''/,
  );
});

test("filters and renders Codex hooks", () => {
  const hooks = transformCodexHooks({
    hooks: {
      TaskCreated: [
        {
          matcher: "",
          hooks: [{ type: "command", command: "task-tracker.sh", async: true }],
        },
      ],
      PreCompact: [
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command: "${CLAUDE_PLUGIN_ROOT}/hooks/memory-capture.sh",
              async: false,
            },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: "Read|Write",
          hooks: [
            {
              type: "command",
              command: "${CLAUDE_PLUGIN_ROOT}/hooks/privacy-block.sh",
            },
          ],
        },
        {
          matcher: "",
          hooks: [
            {
              type: "command",
              command: "${CLAUDE_PLUGIN_ROOT}/hooks/auto-approve.cjs",
            },
          ],
        },
      ],
    },
  });

  assert.deepEqual(Object.keys(hooks.hooks), [
    "PreCompact",
    "PreToolUse",
    "PermissionRequest",
  ]);
  assert.equal(
    hooks.hooks.PreCompact[0].hooks[0].command,
    "CF_HOST=codex ${PLUGIN_ROOT}/hooks/memory-capture.codex.sh",
  );
  assert.equal("async" in hooks.hooks.PreCompact[0].hooks[0], false);
  assert.equal(
    hooks.hooks.PreToolUse[0].hooks[0].command,
    "CF_HOST=codex ${PLUGIN_ROOT}/hooks/privacy-block.sh",
  );
  assert.equal(hooks.hooks.PreToolUse.length, 1);
  assert.equal(
    hooks.hooks.PermissionRequest[0].hooks[0].command,
    "CF_HOST=codex ${PLUGIN_ROOT}/hooks/auto-approve.codex.cjs",
  );
});

test("builds Codex plugin fixture idempotently", async () => {
  const repoRoot = await createFixtureRepo();
  const codexPluginDir = path.join(repoRoot, "plugin-codex");

  await buildCodexPlugin({ repoRoot });
  const firstSnapshot = await snapshotTree(codexPluginDir);

  await buildCodexPlugin({ repoRoot });
  const secondSnapshot = await snapshotTree(codexPluginDir);

  assert.deepEqual(secondSnapshot, firstSnapshot);
  assert.deepEqual(
    firstSnapshot.map((entry) => entry.path),
    [
      ".codex-plugin/plugin.json",
      ".mcp.json",
      "agents/cf-example.toml",
      "CHANGELOG.md",
      "context/notes.md",
      "hooks/hooks.json",
      "hooks/privacy-block.sh",
      "lib/helper.js",
      "README.md",
      "skills/cf-example/SKILL.md",
    ],
  );

  const hooks = JSON.parse(
    await fs.readFile(path.join(codexPluginDir, "hooks", "hooks.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(hooks.hooks), [
    "PreToolUse",
    "PermissionRequest",
  ]);
  assert.equal(
    hooks.hooks.PreToolUse[0].hooks[0].command,
    "CF_HOST=codex ${PLUGIN_ROOT}/hooks/privacy-block.sh",
  );
  assert.equal("async" in hooks.hooks.PreToolUse[0].hooks[0], false);

  const readme = await fs.readFile(
    path.join(codexPluginDir, "README.md"),
    "utf8",
  );
  assert.match(readme, /Spawn a subagent named `cf-explorer`/);
  assert.doesNotMatch(readme, /\{\{cf:/);

  const skill = await fs.readFile(
    path.join(codexPluginDir, "skills", "cf-example", "SKILL.md"),
    "utf8",
  );
  assert.match(skill, /Use Codex CLI, \$cf-review, and \$cf-writer\./);

  const shellMode = (
    await fs.stat(path.join(codexPluginDir, "hooks", "privacy-block.sh"))
  ).mode;
  assert.equal(shellMode & 0o111, 0o111);
});

test("fails fast when plugin source directory is missing", async () => {
  const repoRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "cf-codex-missing-"),
  );
  await writeText(
    path.join(repoRoot, "package.json"),
    JSON.stringify({ version: "1.0.0" }),
  );

  await assert.rejects(
    () => buildCodexPlugin({ repoRoot }),
    new RegExp(
      `Missing plugin source directory: ${path.join(repoRoot, "plugin").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ),
  );
});
