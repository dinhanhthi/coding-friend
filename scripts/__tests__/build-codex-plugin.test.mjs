import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  agentMarkdownToToml,
  createCodexPluginManifest,
  createCodexMcpConfig,
  renderCodexText,
  transformCodexHooks,
} = require("../build-codex-plugin.js");

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
