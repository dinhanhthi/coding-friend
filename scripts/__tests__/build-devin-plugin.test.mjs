import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const {
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
} = require("../build-devin-plugin.js");

const DEVIN_NON_TOOL_EVENTS = new Set([
  "SessionStart",
  "UserPromptSubmit",
  "Stop",
  "PostCompaction",
  "SessionEnd",
]);

async function writeText(filePath, content, mode) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  if (mode) await fs.chmod(filePath, mode);
}

// The generated hooks.json references these scripts; every fixture that runs
// buildDevinPlugin needs them present and executable.
const DEVIN_HOOK_SCRIPTS = [
  "session-init.sh",
  "rules-reminder.devin.sh",
  "block-adapter.devin.sh",
  "auto-approve.devin.cjs",
  "privacy-block.sh",
  "scout-block.cjs",
  "session-log.sh",
  "memory-capture.devin.sh",
];

async function createFixtureRepo() {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cf-devin-build-"));
  await writeText(
    path.join(repoRoot, "package.json"),
    JSON.stringify({ version: "9.8.7" }),
  );
  await writeText(
    path.join(repoRoot, "plugin", ".claude-plugin", "plugin.json"),
    JSON.stringify({
      name: "coding-friend",
      version: "0.0.1",
      description:
        "Lean toolkit for disciplined engineering workflows with Claude Code",
      author: { name: "Fixture Author" },
      keywords: ["skills", "fixture"],
    }),
  );
  await writeText(
    path.join(repoRoot, "plugin", "skills", "cf-example", "SKILL.md"),
    [
      "---",
      "name: cf-example",
      "description: Example",
      "model: haiku",
      "allowed-tools: [Read]",
      "user-invocable: true",
      "disable-model-invocation: true",
      "---",
      "",
      "Use {{cf:slash cf-review}}.",
      'Use the **Agent tool** with `subagent_type: "coding-friend:cf-writer"`.',
      'bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-example/scripts/run.sh"',
      "",
    ].join("\n"),
  );
  await writeText(
    path.join(repoRoot, "plugin", "skills", "cf-example", "scripts", "run.sh"),
    '#!/usr/bin/env bash\nROOT="${CLAUDE_PLUGIN_ROOT}"\necho "$ROOT"\n',
    0o755,
  );
  await writeText(
    path.join(repoRoot, "plugin", "skills", "cf-session", "SKILL.md"),
    [
      "---",
      "name: cf-session",
      "description: Claude session save/restore.",
      "disable-model-invocation: true",
      "---",
      "",
      "Claude session implementation.",
      "",
    ].join("\n"),
  );
  await writeText(
    path.join(
      repoRoot,
      "plugin",
      "skills",
      "cf-session",
      "scripts",
      "save-session.sh",
    ),
    "#!/usr/bin/env bash\necho save\n",
    0o755,
  );
  for (const script of DEVIN_HOOK_SCRIPTS) {
    const content =
      script === "session-init.sh"
        ? '#!/usr/bin/env bash\necho "${CLAUDE_PLUGIN_ROOT}"\n'
        : `#!/usr/bin/env bash\necho ${script}\n`;
    await writeText(
      path.join(repoRoot, "plugin", "hooks", script),
      content,
      0o755,
    );
  }
  // Kept shared hook scripts and helpers.
  await writeText(
    path.join(repoRoot, "plugin", "hooks", "auto-approve.cjs"),
    "module.exports = { keep: true };\n",
  );
  await writeText(
    path.join(repoRoot, "plugin", "hooks", "rules-reminder.sh"),
    "#!/usr/bin/env bash\necho rules\n",
    0o755,
  );
  await writeText(
    path.join(repoRoot, "plugin", "hooks", "memory-capture.sh"),
    "#!/usr/bin/env bash\necho capture\n",
    0o755,
  );
  // Excluded Claude-only and other-host hook files.
  for (const excluded of [
    "hooks.json",
    "statusline.sh",
    "task-tracker.sh",
    "agent-tracker.sh",
    "auto-approve.codex.cjs",
    "memory-capture.codex.sh",
    "auto-approve.agy.cjs",
    "scout-block.agy.cjs",
    "privacy-block.agy.sh",
    "rules-reminder.agy.sh",
    "session-init.agy.sh",
    "session-log.agy.sh",
  ]) {
    await writeText(
      path.join(repoRoot, "plugin", "hooks", excluded),
      `echo ${excluded}\n`,
      0o755,
    );
  }
  await writeText(
    path.join(repoRoot, "plugin", "lib", "agy-hook-io.sh"),
    "# agy helper\n",
  );
  await writeText(
    path.join(repoRoot, "plugin", "lib", "devin-tool-map.cjs"),
    "module.exports = {};\n",
  );
  await writeText(
    path.join(repoRoot, "plugin", "lib", "helper.js"),
    "export const root = process.env.CLAUDE_PLUGIN_ROOT;\n",
  );
  await writeText(
    path.join(repoRoot, "plugin", "lib", "protocols", "implementer-result.md"),
    "# CF-RESULT-FIXTURE-PROTOCOL\n",
  );
  await writeText(
    path.join(repoRoot, "plugin", "context", "bootstrap.md"),
    [
      "# coding-friend",
      "",
      "Follow {{cf:slash cf-review}}.",
      'use the Agent tool with `subagent_type: "coding-friend:<agent>"`.',
      "",
    ].join("\n"),
  );
  await writeText(
    path.join(repoRoot, "plugin", "omp", "extension.ts"),
    "export const host = 'omp';\n",
  );
  await writeText(
    path.join(repoRoot, "plugin", "README.md"),
    'Use the **Agent tool** with `subagent_type: "coding-friend:cf-explorer"`.\n',
  );
  await writeText(
    path.join(repoRoot, "plugin", "CHANGELOG.md"),
    "Changelog entries.\n",
  );
  await writeText(
    path.join(repoRoot, "plugin", "agents", "cf-example.md"),
    [
      "---",
      "name: cf-example",
      "description: Example fixture agent.",
      "model: haiku",
      "tools: Read, Bash",
      "created: 2026-01-01",
      "updated: 2026-01-02",
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

test("renders Claude-native Coding Friend references for Devin", () => {
  assert.equal(renderDevinText("{{cf:slash cf-review}}"), "/cf-review");
  assert.equal(renderDevinText("{{cf:agent_ref cf-writer}}"), "cf-writer");
  assert.equal(
    renderDevinText("{{cf:skill_invoke cf-plan}}"),
    "activate the `cf-plan` skill (type `/cf-plan`)",
  );
  assert.equal(renderDevinText("{{cf:host}}"), "Devin CLI");
  assert.equal(
    renderDevinText(
      '{{cf:dispatch agent=cf-explorer prompt="Explore the repo"}}',
    ),
    "use the `run_subagent` tool with profile `coding-friend:cf-explorer` and this task: Explore the repo",
  );
  assert.equal(
    renderDevinText("{{cf:plugin_root}}"),
    "the `PLUGIN_ROOT:` path in the session bootstrap context (HOST: devin), or the parent of the `skills/` folder that contains this SKILL.md",
  );

  const rendered = renderDevinText(
    [
      'use the Agent tool with `subagent_type: "coding-friend:<agent>"`.',
      '`subagent_type: "coding-friend:cf-explorer"`',
      "Use the **Agent tool** here, or the Agent tool there.",
      'bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-x/scripts/run.sh"',
      "/cf-plan stays bare",
    ].join("\n"),
  );

  assert.equal(
    rendered,
    [
      "use the `run_subagent` tool with profile `coding-friend:<agent>`.",
      "`run_subagent` profile `coding-friend:cf-explorer`",
      "Use the `run_subagent` tool here, or the `run_subagent` tool there.",
      'bash "<plugin-root>/skills/cf-x/scripts/run.sh"',
      "/cf-plan stays bare",
    ].join("\n"),
  );
  assert.doesNotMatch(rendered, /subagent_type/);
  assert.doesNotMatch(rendered, /\bAgent tool\b/);
  assert.doesNotMatch(rendered, /\{\{cf:/);
  assert.doesNotMatch(rendered, /\$\{CLAUDE_PLUGIN_ROOT\}/);
});

test("keeps CLAUDE_PLUGIN_ROOT in hook scripts but not skill text", () => {
  const hookScript = renderDevinFile(
    "/repo/plugin/hooks/session-init.sh",
    '#!/usr/bin/env bash\necho "${CLAUDE_PLUGIN_ROOT}"\n',
  );
  assert.match(hookScript, /\$\{CLAUDE_PLUGIN_ROOT\}/);
  assert.doesNotMatch(hookScript, /<plugin-root>/);

  const skill = renderDevinFile(
    "/repo/plugin/skills/cf-commit/SKILL.md",
    'bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-commit/scripts/analyze-changes.sh"',
  );
  assert.match(
    skill,
    /bash "<plugin-root>\/skills\/cf-commit\/scripts\/analyze-changes\.sh"/,
  );
  assert.doesNotMatch(skill, /\$\{CLAUDE_PLUGIN_ROOT\}/);
});

test("rewrites skill script plugin-root to a dirname-relative path", () => {
  const script = renderDevinFile(
    "/repo/plugin/skills/cf-commit/scripts/analyze-changes.sh",
    'ROOT="${CLAUDE_PLUGIN_ROOT}"\necho "$ROOT"\n',
  );
  assert.match(
    script,
    /ROOT="\$\(cd "\$\(dirname "\$0"\)\/\.\.\/\.\.\/\.\." && pwd\)"/,
  );
  assert.doesNotMatch(script, /CLAUDE_PLUGIN_ROOT|<plugin-root>/);

  const nestedCjs = renderDevinFile(
    "/repo/plugin/skills/cf-commit/scripts/helper.cjs",
    "const root = process.env.CLAUDE_PLUGIN_ROOT;\n",
  );
  assert.match(
    nestedCjs,
    /require\("node:path"\)\.resolve\(__dirname, "\.\.\/\.\.\/\.\."\)/,
  );
  assert.doesNotMatch(nestedCjs, /CLAUDE_PLUGIN_ROOT/);
});

test("keeps Claude skill frontmatter and appends the plugin-root note", () => {
  const skill = renderDevinFile(
    "/repo/plugin/skills/cf-hidden/SKILL.md",
    [
      "---",
      "name: cf-hidden",
      "description: Auto-only helper",
      "user-invocable: false",
      "disable-model-invocation: true",
      "model: haiku",
      "argument-hint: <task>",
      "---",
      "",
      "Body stays.",
      "",
    ].join("\n"),
  );
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(frontmatter, "rendered skill is missing YAML frontmatter");
  assert.match(frontmatter[1], /^user-invocable: false$/m);
  assert.match(frontmatter[1], /^disable-model-invocation: true$/m);
  assert.match(frontmatter[1], /^model: haiku$/m);
  assert.match(frontmatter[1], /^argument-hint: <task>$/m);
  assert.match(skill, /Body stays\./);
  assert.match(
    skill,
    /> Plugin root: the `PLUGIN_ROOT:` path in the session bootstrap context \(HOST: devin\), or the parent of the `skills\/` folder that contains this SKILL\.md\. Replace `<plugin-root>` with it when running bundled scripts\.\n$/,
  );
});

test("replaces cf-session with a Devin native-resume stub", () => {
  const session = renderDevinFile(
    "/repo/plugin/skills/cf-session/SKILL.md",
    "Claude session implementation",
  );
  assert.match(session, /^name: cf-session$/m);
  assert.match(session, /devin -r <id>/);
  assert.match(session, /devin -c/);
  assert.match(session, /devin list/);
  assert.doesNotMatch(session, /Claude session implementation/);
});

test("renders Devin agent markdown keeping tools and dropping inherit/haiku models", () => {
  const markdown = renderDevinAgentMarkdown(`---
name: cf-example
description: >
  Example agent for testing conversion.
model: haiku
tools: Read, Write, Bash
created: 2026-01-01
updated: 2026-09-09
---

# Example

Use {{cf:slash cf-review}}.
`);

  assert.match(markdown, /^name: cf-example$/m);
  assert.match(markdown, /^description: >/m);
  assert.match(markdown, /^tools: Read, Write, Bash$/m);
  assert.doesNotMatch(markdown, /^model:/m);
  assert.doesNotMatch(markdown, /^(created|updated):/m);
  assert.match(markdown, /Use \/cf-review\./);

  const inherited = renderDevinAgentMarkdown(`---
name: cf-example
description: Example
model: inherit
---

Body.
`);
  assert.doesNotMatch(inherited, /^model:/m);

  const sonnet = renderDevinAgentMarkdown(`---
name: cf-example
description: Example
model: sonnet
tools: Read
---

Body.
`);
  assert.match(sonnet, /^model: sonnet$/m);

  const opus = renderDevinAgentMarkdown(`---
name: cf-example
description: Example
model: opus
---

Body.
`);
  assert.match(opus, /^model: opus$/m);

  assert.throws(
    () => renderDevinAgentMarkdown("# no frontmatter\n"),
    /missing frontmatter name/,
  );
});

test("generates Devin hooks.json with the allowed events only", () => {
  const hooks = transformDevinHooks();
  assert.deepEqual(Object.keys(hooks), ["hooks"]);

  const events = Object.keys(hooks.hooks);
  for (const event of events) {
    assert.ok(
      DEVIN_HOOK_EVENTS.has(event),
      `unexpected Devin hook event: ${event}`,
    );
  }
  assert.ok(events.includes("SessionStart"));
  assert.ok(events.includes("UserPromptSubmit"));
  assert.ok(events.includes("PreToolUse"));
  assert.ok(events.includes("PermissionRequest"));
  assert.ok(events.includes("Stop"));
  assert.ok(events.includes("PostCompaction"));
  for (const dropped of [
    "PostToolUse",
    "SessionEnd",
    "TaskCreated",
    "TaskCompleted",
    "SubagentStart",
    "SubagentStop",
    "PreCompact",
  ]) {
    assert.equal(
      dropped in hooks.hooks,
      false,
      `hooks.json must not emit ${dropped}`,
    );
  }

  for (const [event, entries] of Object.entries(hooks.hooks)) {
    for (const entry of entries) {
      if (DEVIN_NON_TOOL_EVENTS.has(event)) {
        assert.equal(entry.matcher, "", `${event} must not set a matcher`);
      }
    }
  }
  assert.equal(
    hooks.hooks.PreToolUse[0].matcher,
    "^(read|write|edit|glob|grep)$",
  );

  const commands = collectHookCommands(hooks);
  assert.ok(commands.length > 0);
  for (const command of commands) {
    assert.match(command, /^CF_HOST=devin /);
    assert.match(command, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\//);
  }
  assert.equal(
    hooks.hooks.SessionStart[0].hooks[0].command,
    "CF_HOST=devin ${CLAUDE_PLUGIN_ROOT}/hooks/session-init.sh",
  );
  assert.equal(
    hooks.hooks.UserPromptSubmit[0].hooks[0].command,
    "CF_HOST=devin ${CLAUDE_PLUGIN_ROOT}/hooks/rules-reminder.devin.sh",
  );
  assert.deepEqual(
    hooks.hooks.PreToolUse[0].hooks.map((hook) => hook.command),
    [
      "CF_HOST=devin ${CLAUDE_PLUGIN_ROOT}/hooks/block-adapter.devin.sh privacy-block.sh",
      "CF_HOST=devin ${CLAUDE_PLUGIN_ROOT}/hooks/block-adapter.devin.sh scout-block.cjs",
    ],
  );
  assert.equal(
    hooks.hooks.PermissionRequest[0].hooks[0].command,
    "CF_HOST=devin ${CLAUDE_PLUGIN_ROOT}/hooks/auto-approve.devin.cjs",
  );
  assert.equal(
    hooks.hooks.Stop[0].hooks[0].command,
    "CF_HOST=devin ${CLAUDE_PLUGIN_ROOT}/hooks/session-log.sh",
  );
  assert.equal(
    hooks.hooks.PostCompaction[0].hooks[0].command,
    "CF_HOST=devin ${CLAUDE_PLUGIN_ROOT}/hooks/memory-capture.devin.sh",
  );
});

test("creates stamped Devin plugin manifest from the source manifest", () => {
  const manifest = createDevinPluginManifest({
    version: "1.2.3",
    sourceManifest: {
      name: "coding-friend",
      version: "0.0.1",
      description: "Lean toolkit for disciplined engineering workflows",
      author: { name: "Fixture Author" },
      keywords: ["skills"],
    },
  });
  assert.equal(manifest.name, "coding-friend");
  assert.equal(manifest.version, "1.2.3");
  assert.equal(
    manifest.description,
    "Lean toolkit for disciplined engineering workflows — for Devin CLI (beta)",
  );
  assert.deepEqual(manifest.author, { name: "Fixture Author" });
  assert.deepEqual(manifest.keywords, ["skills"]);

  const minimal = createDevinPluginManifest({
    version: "1.2.3",
    sourceManifest: { description: "Toolkit" },
  });
  assert.equal("author" in minimal, false);
  assert.equal("keywords" in minimal, false);
});

test("creates Devin MCP config with the no-arg mcp-serve form", () => {
  assert.deepEqual(createDevinMcpConfig(), {
    mcpServers: {
      "coding-friend-memory": {
        command: "npx",
        args: ["-y", "coding-friend-cli", "mcp-serve"],
      },
    },
  });
});

test("excludes Claude-only and other-host sources from the Devin artifact", () => {
  for (const rel of [
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
  ]) {
    assert.ok(
      DEVIN_EXCLUDED_SOURCE_PATHS.has(rel),
      `expected Devin builder to exclude ${rel}`,
    );
  }
  for (const kept of [
    "hooks/auto-approve.cjs",
    "hooks/auto-approve.devin.cjs",
    "hooks/block-adapter.devin.sh",
    "hooks/memory-capture.devin.sh",
    "hooks/rules-reminder.devin.sh",
    "hooks/privacy-block.sh",
    "hooks/scout-block.cjs",
    "hooks/rules-reminder.sh",
    "hooks/memory-capture.sh",
    "hooks/session-init.sh",
    "hooks/session-log.sh",
    "lib/devin-tool-map.cjs",
    "skills/cf-review/scripts/run-codex-review.sh",
    "skills/cf-review/scripts/normalize-codex-review.sh",
    "skills/cf-review/references/external-reviewers.md",
  ]) {
    assert.equal(
      DEVIN_EXCLUDED_SOURCE_PATHS.has(kept),
      false,
      `expected Devin builder to copy ${kept}`,
    );
  }
});

test("builds Devin plugin fixture idempotently", async () => {
  const repoRoot = await createFixtureRepo();
  const devinPluginDir = path.join(repoRoot, "plugin-devin");

  await buildDevinPlugin({ repoRoot });
  const firstSnapshot = await snapshotTree(devinPluginDir);

  await buildDevinPlugin({ repoRoot });
  const secondSnapshot = await snapshotTree(devinPluginDir);

  assert.deepEqual(secondSnapshot, firstSnapshot);
  assert.deepEqual(
    firstSnapshot.map((entry) => entry.path),
    [
      ".claude-plugin/plugin.json",
      ".mcp.json",
      "agents/cf-example.md",
      "context/bootstrap.md",
      "hooks/auto-approve.cjs",
      "hooks/auto-approve.devin.cjs",
      "hooks/block-adapter.devin.sh",
      "hooks/hooks.json",
      "hooks/memory-capture.devin.sh",
      "hooks/memory-capture.sh",
      "hooks/privacy-block.sh",
      "hooks/rules-reminder.devin.sh",
      "hooks/rules-reminder.sh",
      "hooks/scout-block.cjs",
      "hooks/session-init.sh",
      "hooks/session-log.sh",
      "lib/devin-tool-map.cjs",
      "lib/helper.js",
      "lib/protocols/implementer-result.md",
      "README.md",
      "skills/cf-example/scripts/run.sh",
      "skills/cf-example/SKILL.md",
      "skills/cf-session/SKILL.md",
    ],
  );

  const paths = firstSnapshot.map((entry) => entry.path);
  assert.equal(paths.includes("hooks/statusline.sh"), false);
  assert.equal(paths.includes("hooks/task-tracker.sh"), false);
  assert.equal(paths.includes("hooks/agent-tracker.sh"), false);
  assert.equal(paths.includes("CHANGELOG.md"), false);
  assert.equal(paths.includes("lib/agy-hook-io.sh"), false);
  assert.equal(
    paths.some((entryPath) =>
      entryPath.startsWith("skills/cf-session/scripts"),
    ),
    false,
  );
  assert.equal(
    paths.some(
      (entryPath) => entryPath === "omp" || entryPath.startsWith("omp/"),
    ),
    false,
  );
  assert.equal(
    paths.some(
      (entryPath) =>
        entryPath.includes(".codex.") ||
        entryPath.includes(".agy.") ||
        entryPath.includes("agy-"),
    ),
    false,
    "plugin-devin must not ship codex/antigravity files",
  );

  const hooks = JSON.parse(
    await fs.readFile(path.join(devinPluginDir, "hooks", "hooks.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(hooks.hooks).sort(), [
    "PermissionRequest",
    "PostCompaction",
    "PreToolUse",
    "SessionStart",
    "Stop",
    "UserPromptSubmit",
  ]);
  for (const command of collectHookCommands(hooks)) {
    assert.match(command, /^CF_HOST=devin /);
  }

  const manifest = JSON.parse(
    await fs.readFile(
      path.join(devinPluginDir, ".claude-plugin", "plugin.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.name, "coding-friend");
  assert.equal(manifest.version, "9.8.7");
  assert.match(manifest.description, / — for Devin CLI \(beta\)$/);
  assert.deepEqual(manifest.author, { name: "Fixture Author" });
  assert.deepEqual(manifest.keywords, ["skills", "fixture"]);

  const mcp = JSON.parse(
    await fs.readFile(path.join(devinPluginDir, ".mcp.json"), "utf8"),
  );
  assert.deepEqual(mcp, {
    mcpServers: {
      "coding-friend-memory": {
        command: "npx",
        args: ["-y", "coding-friend-cli", "mcp-serve"],
      },
    },
  });

  const readme = await fs.readFile(
    path.join(devinPluginDir, "README.md"),
    "utf8",
  );
  assert.match(readme, /# Coding Friend — Devin CLI \(beta\)/);
  assert.match(
    readme,
    /devin plugins install dinhanhthi\/coding-friend#plugin-devin/,
  );
  assert.match(readme, /devin plugins install --local/);
  assert.match(readme, /\/coding-friend:cf-plan/);
  assert.match(readme, /## Known Differences/);
  assert.doesNotMatch(readme, /\{\{cf:|\bAgent tool\b|subagent_type/);

  const skill = await fs.readFile(
    path.join(devinPluginDir, "skills", "cf-example", "SKILL.md"),
    "utf8",
  );
  const skillFrontmatter = skill.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(skillFrontmatter);
  assert.match(skillFrontmatter[1], /^model: haiku$/m);
  assert.match(skillFrontmatter[1], /^allowed-tools: \[Read\]$/m);
  assert.match(skillFrontmatter[1], /^disable-model-invocation: true$/m);
  assert.match(skill, /Use \/cf-review\./);
  assert.match(skill, /`run_subagent` tool/);
  assert.match(skill, /<plugin-root>\/skills\/cf-example\/scripts\/run\.sh/);
  assert.match(skill, /> Plugin root: the `PLUGIN_ROOT:` path/);
  assert.doesNotMatch(skill, /\$\{CLAUDE_PLUGIN_ROOT\}|subagent_type|\{\{cf:/);

  const skillScript = await fs.readFile(
    path.join(devinPluginDir, "skills", "cf-example", "scripts", "run.sh"),
    "utf8",
  );
  assert.match(
    skillScript,
    /\$\(cd "\$\(dirname "\$0"\)\/\.\.\/\.\.\/\.\." && pwd\)/,
  );
  assert.doesNotMatch(skillScript, /CLAUDE_PLUGIN_ROOT/);

  const session = await fs.readFile(
    path.join(devinPluginDir, "skills", "cf-session", "SKILL.md"),
    "utf8",
  );
  assert.match(session, /devin -r <id>/);
  assert.doesNotMatch(session, /Claude session implementation/);

  const agent = await fs.readFile(
    path.join(devinPluginDir, "agents", "cf-example.md"),
    "utf8",
  );
  const agentFrontmatter = agent.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(agentFrontmatter);
  assert.doesNotMatch(agentFrontmatter[1], /^model:/m);
  assert.match(agentFrontmatter[1], /^tools: Read, Bash$/m);
  assert.doesNotMatch(agentFrontmatter[1], /^(created|updated):/m);

  const bootstrap = await fs.readFile(
    path.join(devinPluginDir, "context", "bootstrap.md"),
    "utf8",
  );
  assert.match(
    bootstrap,
    /use the `run_subagent` tool with profile `coding-friend:<agent>`/,
  );
  assert.doesNotMatch(bootstrap, /\bAgent tool\b|subagent_type|\{\{cf:/);

  const sessionInitMode = (
    await fs.stat(path.join(devinPluginDir, "hooks", "session-init.sh"))
  ).mode;
  assert.equal(sessionInitMode & 0o111, 0o111);
  const adapterMode = (
    await fs.stat(path.join(devinPluginDir, "hooks", "block-adapter.devin.sh"))
  ).mode;
  assert.equal(adapterMode & 0o111, 0o111);

  const sessionInit = await fs.readFile(
    path.join(devinPluginDir, "hooks", "session-init.sh"),
    "utf8",
  );
  assert.match(sessionInit, /\$\{CLAUDE_PLUGIN_ROOT\}/);
});

test("fails when a referenced hook script is missing from the tree", async () => {
  const repoRoot = await createFixtureRepo();
  await fs.rm(path.join(repoRoot, "plugin", "hooks", "privacy-block.sh"));

  await assert.rejects(
    () => buildDevinPlugin({ repoRoot }),
    /privacy-block\.sh/,
  );
});

test("fails fast when plugin source directory is missing", async () => {
  const repoRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "cf-devin-missing-"),
  );
  await writeText(
    path.join(repoRoot, "package.json"),
    JSON.stringify({ version: "1.0.0" }),
  );

  await assert.rejects(
    () => buildDevinPlugin({ repoRoot }),
    new RegExp(
      `Missing plugin source directory: ${path.join(repoRoot, "plugin").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ),
  );
});

/* ---------------------------------------------------------------------------
 * Live-tree assertions on the committed plugin-devin/ artifact
 * ------------------------------------------------------------------------ */

const liveRepoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

test("live Devin tree keeps 28 skills, 12 agents and no foreign-host paths", async () => {
  const devinPluginDir = path.join(liveRepoRoot, "plugin-devin");
  const snapshot = await snapshotTree(devinPluginDir);
  const paths = snapshot.map((entry) => entry.path);

  const skillDirs = new Set(
    paths
      .filter((entryPath) => /^skills\/cf-[^/]+\/SKILL\.md$/.test(entryPath))
      .map((entryPath) => entryPath.split("/")[1]),
  );
  assert.equal(skillDirs.size, 28);

  const agents = paths.filter((entryPath) =>
    /^agents\/cf-.*\.md$/.test(entryPath),
  );
  assert.equal(agents.length, 12);

  assert.equal(
    paths.some(
      (entryPath) =>
        entryPath.includes(".codex.") ||
        entryPath.includes(".agy.") ||
        entryPath.includes("agy-"),
    ),
    false,
  );

  const hooks = JSON.parse(
    await fs.readFile(path.join(devinPluginDir, "hooks", "hooks.json"), "utf8"),
  );
  for (const event of Object.keys(hooks.hooks)) {
    assert.ok(DEVIN_HOOK_EVENTS.has(event), `unexpected event ${event}`);
  }

  for (const agentPath of agents) {
    const markdown = await fs.readFile(
      path.join(devinPluginDir, agentPath),
      "utf8",
    );
    const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    assert.doesNotMatch(
      frontmatter,
      /^model: (?:inherit|haiku)$/m,
      `${agentPath} must drop inherit/haiku models`,
    );
    assert.doesNotMatch(
      frontmatter,
      /^(created|updated):/m,
      `${agentPath} must strip created/updated`,
    );
  }
});
