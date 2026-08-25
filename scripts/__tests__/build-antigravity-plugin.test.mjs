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
  buildAntigravityPlugin,
  createAntigravityMcpConfig,
  createAntigravityPluginManifest,
  renderAgyAgentMarkdown,
  renderAgyFile,
  renderAgyInstructionText,
  renderAgyText,
  stripClaudeSkillFrontmatter,
  transformAgyHooks,
} = require("../build-antigravity-plugin.js");

const AGY_HOOK_EVENTS = new Set([
  "PreInvocation",
  "PostInvocation",
  "PreToolUse",
  "PostToolUse",
  "Stop",
]);

async function writeText(filePath, content, mode) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  if (mode) await fs.chmod(filePath, mode);
}

async function createFixtureRepo() {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cf-agy-build-"));
  await writeText(
    path.join(repoRoot, "package.json"),
    JSON.stringify({ version: "9.8.7" }),
  );
  await writeText(
    path.join(repoRoot, "plugin", "skills", "cf-example", "SKILL.md"),
    [
      "---",
      "name: cf-example",
      "description: Example",
      "model: haiku",
      "allowed-tools: [Read]",
      "---",
      "",
      "Use {{cf:slash cf-review}}.",
      'Use the **Agent tool** with `subagent_type: "coding-friend:cf-writer"`.',
      'bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-example/scripts/run.sh"',
      "",
      "The model: keep this body example",
      "",
    ].join("\n"),
  );
  await writeText(
    path.join(repoRoot, "plugin", "hooks", "hooks.json"),
    JSON.stringify({
      hooks: {
        SessionStart: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "session-init.sh" }],
          },
        ],
      },
    }),
  );
  await writeText(
    path.join(repoRoot, "plugin", "hooks", "statusline.sh"),
    "#!/usr/bin/env bash\necho statusline\n",
    0o755,
  );
  await writeText(
    path.join(repoRoot, "plugin", "hooks", "session-init.sh"),
    "#!/usr/bin/env bash\necho Claude session-init\n",
    0o755,
  );
  await writeText(
    path.join(repoRoot, "plugin", "hooks", "session-init.agy.sh"),
    "#!/usr/bin/env bash\necho agy session-init\n",
    0o755,
  );
  await writeText(
    path.join(repoRoot, "plugin", "hooks", "auto-approve.cjs"),
    "module.exports = { keep: true };\n",
  );
  await writeText(
    path.join(repoRoot, "plugin", "lib", "helper.js"),
    "export const root = process.env.CLAUDE_PLUGIN_ROOT;\n",
  );
  await writeText(
    path.join(repoRoot, "plugin", "context", "bootstrap.md"),
    [
      "# coding-friend",
      "",
      "Follow {{cf:slash cf-review}} and read CLAUDE.md.",
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
    "Fixed CLAUDE.md and haiku model notes.\n",
  );
  await writeText(
    path.join(repoRoot, "plugin", "agents", "cf-example.md"),
    [
      "---",
      "name: cf-example",
      "description: Example fixture agent.",
      "model: haiku",
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

test("renders Claude-native Coding Friend references for Antigravity", () => {
  assert.equal(renderAgyText("{{cf:slash cf-review}}"), "/cf-review");
  assert.equal(
    renderAgyText(
      '{{cf:dispatch agent=cf-explorer prompt="Explore the repo"}}',
    ),
    "Call `invoke_subagent` with agent `cf-explorer` and this task: Explore the repo",
  );
  assert.equal(
    renderAgyText(
      'Use the **Agent tool** with `subagent_type: "coding-friend:cf-explorer"`.',
    ),
    "Call `invoke_subagent` with agent `cf-explorer`.",
  );
  assert.equal(
    renderAgyText("{{cf:plugin_root}}"),
    "the plugin directory (the parent of the `skills/` folder that contains this SKILL.md)",
  );

  const rendered = renderAgyInstructionText(
    [
      "{{cf:slash cf-review}}",
      '{{cf:dispatch agent=cf-explorer prompt="Explore the repo"}}',
      'Use the **Agent tool** with `subagent_type: "coding-friend:cf-explorer"`.',
      "use the Skill tool with skill name `coding-friend:cf-learn`",
      "{{cf:slash cf-plan}}",
      "${CLAUDE_PLUGIN_ROOT}/hooks/rules-reminder.sh",
      "Use cf-writer (sonnet) and read CLAUDE.md.",
    ].join("\n"),
  );

  assert.equal(
    rendered,
    [
      "/cf-review",
      "Call `invoke_subagent` with agent `cf-explorer` and this task: Explore the repo",
      "Call `invoke_subagent` with agent `cf-explorer`.",
      "activate the `cf-learn` skill (type `/cf-learn`)",
      "/cf-plan",
      "<plugin-root>/hooks/rules-reminder.sh",
      "Use cf-writer (pro) and read AGENTS.md.",
    ].join("\n"),
  );
  assert.doesNotMatch(rendered, /subagent_type/);
  assert.doesNotMatch(rendered, /\{\{cf:/);
  assert.doesNotMatch(rendered, /\$\{CLAUDE_PLUGIN_ROOT\}/);
  assert.doesNotMatch(rendered, /\bAGY_PLUGIN_ROOT\b/);
  assert.doesNotMatch(rendered, /bash "\.\/skills\//);
});

test("rewrites skill plugin-root for workspace cwd, not plugin cwd", () => {
  const skill = renderAgyFile(
    "/repo/plugin/skills/cf-commit/SKILL.md",
    [
      "---",
      "name: cf-commit",
      "---",
      'bash "${CLAUDE_PLUGIN_ROOT}/skills/cf-commit/scripts/analyze-changes.sh"',
    ].join("\n"),
  );
  assert.match(
    skill,
    /bash "<plugin-root>\/skills\/cf-commit\/scripts\/analyze-changes\.sh"/,
  );
  assert.doesNotMatch(skill, /bash "\.\/skills\//);
  assert.doesNotMatch(skill, /\$\{CLAUDE_PLUGIN_ROOT\}|\bAGY_PLUGIN_ROOT\b/);

  const script = renderAgyFile(
    "/repo/plugin/skills/cf-commit/scripts/analyze-changes.sh",
    'ROOT="${CLAUDE_PLUGIN_ROOT}"\necho "$ROOT"\n',
  );
  assert.match(
    script,
    /ROOT="\$\(cd "\$\(dirname "\$0"\)\/\.\.\/\.\.\/\.\." && pwd\)"/,
  );
  assert.doesNotMatch(script, /CLAUDE_PLUGIN_ROOT|AGY_PLUGIN_ROOT|<plugin-root>/);

  const nestedCjs = renderAgyFile(
    "/repo/plugin/skills/cf-commit/scripts/helper.cjs",
    "const root = process.env.CLAUDE_PLUGIN_ROOT;\n",
  );
  assert.match(
    nestedCjs,
    /require\("node:path"\)\.resolve\(__dirname, "\.\.\/\.\.\/\.\."\)/,
  );
  assert.doesNotMatch(nestedCjs, /CLAUDE_PLUGIN_ROOT|AGY_PLUGIN_ROOT/);

  const lib = renderAgyFile(
    "/repo/plugin/lib/cf-paths.sh",
    ': "${CLAUDE_PLUGIN_ROOT:=${PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}}"\n',
  );
  assert.match(lib, /CLAUDE_PLUGIN_ROOT:=/);
  assert.match(lib, /BASH_SOURCE\[0\]/);
});

test("renders AGY-native plan and session alternatives", () => {
  const plan = renderAgyFile(
    "/repo/plugin/skills/cf-plan/SKILL.md",
    [
      "Use TaskCreate to create a task list.",
      "Use `AskUserQuestion` for each round.",
      "Spawn one cf-implementer **per task** with `run_in_background: true` — all in a **single message block**.",
    ].join("\n"),
  );
  assert.match(plan, /Create a task checklist and keep it updated/);
  assert.match(plan, /a direct user question/);
  assert.doesNotMatch(plan, /`a direct user question`/);
  assert.match(
    plan,
    /Call `invoke_subagent` with agent `cf-implementer` once per task in parallel/,
  );
  assert.doesNotMatch(plan, /TaskCreate|AskUserQuestion|run_in_background/);

  const modelFlag = renderAgyFile(
    "/repo/plugin/skills/cf-plan/SKILL.md",
    [
      "   1d. **`--model` flag** <!-- cf-plan-model-flag -->",
      "   Accept both `--model <alias>` (two tokens, e.g. `--model opus`) AND `--model=<alias>` (one token, e.g. `--model=sonnet`). Valid aliases: `opus`, `sonnet`, `haiku`, `fable` — the Agent tool `model` param enum.",
      "2. **Auto-detect** — scan the task for signals (need 2+ to trigger):",
    ].join("\n"),
  );
  assert.match(modelFlag, /`--model`/);
  assert.match(modelFlag, /inherit\|flash\|pro/);
  assert.match(modelFlag, /2\. \*\*Auto-detect\*\*/);
  assert.doesNotMatch(modelFlag, /Agent tool/);

  const session = renderAgyFile(
    "/repo/plugin/skills/cf-session/SKILL.md",
    "Claude session implementation",
  );
  assert.match(session, /agy --continue/);
  assert.match(session, /\/resume/);
  assert.doesNotMatch(session, /Claude session implementation/);
});

test("rewrites cf-plan --model spawn and cf-help for Antigravity", async () => {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const planSource = await fs.readFile(
    path.join(repoRoot, "plugin/skills/cf-plan/SKILL.md"),
    "utf8",
  );
  const plan = renderAgyFile(
    "/repo/plugin/skills/cf-plan/SKILL.md",
    planSource,
  );
  const step3Start = plan.indexOf("### Step 3:");
  const step3End = plan.indexOf("### Step 4:");
  assert.notEqual(step3Start, -1);
  assert.notEqual(step3End, -1);
  const step3 = plan.slice(step3Start, step3End);
  assert.match(step3, /explicit model/);
  assert.doesNotMatch(step3, /subagent_type|context: fork|model: <alias>/);
  assert.match(plan, /`--model` vs resolved fast mode/);
  assert.match(plan, /<plugin-root>\/lib\/load-custom-guide\.sh/);
  assert.doesNotMatch(plan, /bash "\.\/(?:skills|lib)\//);
  assert.doesNotMatch(plan, /\$\{CLAUDE_PLUGIN_ROOT\}|\bAGY_PLUGIN_ROOT\b/);

  const helpSource = await fs.readFile(
    path.join(repoRoot, "plugin/skills/cf-help/SKILL.md"),
    "utf8",
  );
  const help = renderAgyFile(
    "/repo/plugin/skills/cf-help/SKILL.md",
    helpSource,
  );
  assert.match(help, /Google Antigravity/);
  assert.match(
    help,
    /`--model <alias>` pin the model for cf-planner at the brainstorm step \(valid: `inherit`, `flash`, `pro`\)/,
  );
  assert.doesNotMatch(help, /cf dev sync/);

  for (const skillName of ["cf-commit", "cf-review"]) {
    const source = await fs.readFile(
      path.join(repoRoot, "plugin/skills", skillName, "SKILL.md"),
      "utf8",
    );
    const renderedSkill = renderAgyFile(
      `/repo/plugin/skills/${skillName}/SKILL.md`,
      source,
    );
    assert.doesNotMatch(renderedSkill, /bash "\.\/skills\//);
    assert.match(renderedSkill, /<plugin-root>\//);
    assert.doesNotMatch(
      renderedSkill,
      /\$\{CLAUDE_PLUGIN_ROOT\}|\bAGY_PLUGIN_ROOT\b/,
    );
  }
});

test("creates stamped Antigravity plugin manifest", () => {
  const manifest = createAntigravityPluginManifest({ version: "1.2.3" });
  assert.equal(manifest.name, "coding-friend");
  assert.equal(manifest.version, "1.2.3");
  assert.match(manifest.description, /Google Antigravity \(beta\)/);
  assert.equal(manifest.license, "MIT");
  assert.ok(manifest.keywords.includes("antigravity"));
  assert.equal(manifest.skills, undefined);
  assert.equal(manifest.hooks, undefined);
});

test("creates Antigravity MCP config for shared memory server", () => {
  assert.deepEqual(createAntigravityMcpConfig(), {
    mcpServers: {
      "coding-friend-memory": {
        command: "npx",
        args: ["-y", "coding-friend-cli", "mcp-serve", "docs/memory"],
        env: {},
      },
    },
  });
});

test("renders AGY agent markdown with mapped models and no tools", () => {
  const markdown = renderAgyAgentMarkdown(`---
name: cf-example
description: >
  Example agent for testing conversion.
model: haiku
tools: Read, Write, Bash
---

# Example

Use {{cf:slash cf-review}} and {{cf:agent_ref cf-writer}}.
`);

  assert.match(markdown, /^name: cf-example$/m);
  assert.match(markdown, /^model: flash$/m);
  assert.doesNotMatch(markdown, /^tools:/m);
  assert.match(markdown, /Use \/cf-review and cf-writer\./);

  const inherited = renderAgyAgentMarkdown(`---
name: cf-example
description: Example
---

Body.
`);
  assert.match(inherited, /^model: inherit$/m);

  const pro = renderAgyAgentMarkdown(`---
name: cf-example
description: Example
model: sonnet
---

Body.
`);
  assert.match(pro, /^model: pro$/m);
});

test("generates AGY hooks with coding-friend group and host-relative commands", () => {
  const hooks = transformAgyHooks();
  assert.deepEqual(Object.keys(hooks), ["coding-friend"]);

  const group = hooks["coding-friend"];
  const events = Object.keys(group);
  for (const event of events) {
    assert.ok(
      AGY_HOOK_EVENTS.has(event),
      `unexpected AGY hook event: ${event}`,
    );
  }
  assert.ok(events.includes("PreInvocation"));
  assert.ok(events.includes("PreToolUse"));
  assert.ok(events.includes("Stop"));
  assert.equal("SessionStart" in group, false);
  assert.equal("UserPromptSubmit" in group, false);
  assert.equal("PreCompact" in group, false);

  const commands = collectHookCommands(group);
  assert.ok(commands.length > 0);
  for (const command of commands) {
    assert.match(command, /^CF_HOST=agy /);
    assert.match(command, /\.\/hooks\//);
  }
  assert.equal(
    group.PreInvocation[0].command,
    "CF_HOST=agy ./hooks/session-init.agy.sh",
  );
  assert.equal(group.Stop[0].command, "CF_HOST=agy ./hooks/session-log.agy.sh");
});

test("strips Claude skill frontmatter when closing fence has no trailing newline", () => {
  const withoutNewline = [
    "---",
    "name: cf-example",
    "description: Example",
    "model: haiku",
    "allowed-tools: [Read]",
    "---",
  ].join("\n");

  assert.equal(withoutNewline.endsWith("\n"), false);
  assert.equal(
    stripClaudeSkillFrontmatter(withoutNewline),
    ["---", "name: cf-example", "description: Example", "---", ""].join("\n"),
  );
});

test("builds Antigravity plugin fixture idempotently", async () => {
  const repoRoot = await createFixtureRepo();
  const agyPluginDir = path.join(repoRoot, "plugin-antigravity");

  await buildAntigravityPlugin({ repoRoot });
  const firstSnapshot = await snapshotTree(agyPluginDir);

  await buildAntigravityPlugin({ repoRoot });
  const secondSnapshot = await snapshotTree(agyPluginDir);

  assert.deepEqual(secondSnapshot, firstSnapshot);
  assert.deepEqual(
    firstSnapshot.map((entry) => entry.path),
    [
      "agents/cf-example.md",
      "CHANGELOG.md",
      "hooks/auto-approve.cjs",
      "hooks/session-init.agy.sh",
      "hooks.json",
      "lib/helper.js",
      "mcp_config.json",
      "plugin.json",
      "README.md",
      "rules/AGENTS.md",
      "skills/cf-example/SKILL.md",
    ],
  );

  const paths = firstSnapshot.map((entry) => entry.path);
  assert.equal(paths.includes("hooks/statusline.sh"), false);
  assert.equal(paths.includes("hooks/hooks.json"), false);
  assert.equal(paths.includes("hooks/session-init.sh"), false);
  assert.equal(
    paths.some(
      (entryPath) => entryPath === "omp" || entryPath.startsWith("omp/"),
    ),
    false,
  );
  assert.equal(
    paths.some((entryPath) => entryPath.startsWith("context/")),
    false,
  );

  const hooks = JSON.parse(
    await fs.readFile(path.join(agyPluginDir, "hooks.json"), "utf8"),
  );
  assert.deepEqual(Object.keys(hooks), ["coding-friend"]);
  assert.deepEqual(Object.keys(hooks["coding-friend"]), [
    "PreInvocation",
    "PreToolUse",
    "Stop",
  ]);
  for (const command of collectHookCommands(hooks["coding-friend"])) {
    assert.match(command, /^CF_HOST=agy /);
    assert.match(command, /\.\/hooks\//);
  }
  assert.equal("SessionStart" in hooks["coding-friend"], false);
  assert.equal("UserPromptSubmit" in hooks["coding-friend"], false);
  assert.equal("PreCompact" in hooks["coding-friend"], false);

  const readme = await fs.readFile(
    path.join(agyPluginDir, "README.md"),
    "utf8",
  );
  assert.match(readme, /invoke_subagent/);
  assert.doesNotMatch(readme, /\{\{cf:/);
  assert.doesNotMatch(readme, /subagent_type/);

  const skill = await fs.readFile(
    path.join(agyPluginDir, "skills", "cf-example", "SKILL.md"),
    "utf8",
  );
  assert.match(skill, /Use \/cf-review\./);
  assert.match(skill, /Call `invoke_subagent` with agent `cf-writer`\./);
  assert.match(
    skill,
    /bash "<plugin-root>\/skills\/cf-example\/scripts\/run\.sh"/,
  );
  assert.doesNotMatch(skill, /bash "\.\/skills\//);
  assert.doesNotMatch(skill, /\$\{CLAUDE_PLUGIN_ROOT\}|\bAGY_PLUGIN_ROOT\b/);
  const skillFrontmatter = skill.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(skillFrontmatter);
  assert.doesNotMatch(skillFrontmatter[1], /^model:|^allowed-tools:/m);
  assert.match(skill, /The model: keep this body example/);

  const agent = await fs.readFile(
    path.join(agyPluginDir, "agents", "cf-example.md"),
    "utf8",
  );
  const agentFrontmatter = agent.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(agentFrontmatter);
  assert.match(agentFrontmatter[1], /^model: (?:flash|pro|inherit)$/m);
  assert.doesNotMatch(agentFrontmatter[1], /^tools:/m);

  const sourceChangelog = await fs.readFile(
    path.join(repoRoot, "plugin", "CHANGELOG.md"),
    "utf8",
  );
  const builtChangelog = await fs.readFile(
    path.join(agyPluginDir, "CHANGELOG.md"),
    "utf8",
  );
  assert.equal(builtChangelog, sourceChangelog);
  assert.match(builtChangelog, /CLAUDE\.md and haiku/);

  const agentsMd = await fs.readFile(
    path.join(agyPluginDir, "rules", "AGENTS.md"),
    "utf8",
  );
  assert.ok(agentsMd.length < 12000);
  assert.match(agentsMd, /# Coding Friend \(Antigravity, beta\)/);
  assert.match(agentsMd, /HOST: agy/);
  assert.match(
    agentsMd,
    /Plugin root: the directory that contains the `skills\/` folder this SKILL\.md lives in\. Replace `<plugin-root>` with that path when running bundled scripts\./,
  );
  assert.match(agentsMd, /Follow \/cf-review/);
  assert.doesNotMatch(agentsMd, /CLAUDE\.md|\{\{cf:/);

  const pluginJson = JSON.parse(
    await fs.readFile(path.join(agyPluginDir, "plugin.json"), "utf8"),
  );
  assert.equal(pluginJson.version, "9.8.7");

  const shellMode = (
    await fs.stat(path.join(agyPluginDir, "hooks", "session-init.agy.sh"))
  ).mode;
  assert.equal(shellMode & 0o111, 0o111);
});

test("fails fast when plugin source directory is missing", async () => {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cf-agy-missing-"));
  await writeText(
    path.join(repoRoot, "package.json"),
    JSON.stringify({ version: "1.0.0" }),
  );

  await assert.rejects(
    () => buildAntigravityPlugin({ repoRoot }),
    new RegExp(
      `Missing plugin source directory: ${path.join(repoRoot, "plugin").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ),
  );
});
