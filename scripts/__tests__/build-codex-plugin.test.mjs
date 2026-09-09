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
  agentMarkdownToToml,
  buildCodexPlugin,
  CODEX_EXCLUDED_SOURCE_PATHS,
  createCodexPluginManifest,
  createCodexMcpConfig,
  renderCodexFile,
  renderCodexInstructionText,
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
    [
      "---",
      "name: cf-example",
      "description: Example",
      "model: haiku",
      "allowed-tools: [Read]",
      "---",
      "",
      'Use /cf-review and the Agent tool with `subagent_type: "coding-friend:cf-writer"`.',
      "",
      "The model: keep this body example",
      "",
    ].join("\n"),
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
    "#!/usr/bin/env bash\necho Claude Code\n",
    0o755,
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
    path.join(repoRoot, "plugin", "context", "notes.md"),
    "Run /cf-plan before dispatch.\n",
  );
  await writeText(
    path.join(repoRoot, "plugin", "README.md"),
    'Use the Agent tool with `subagent_type: "coding-friend:cf-explorer"`.\n',
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
      "Use /cf-review.",
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

test("renders Claude-native Coding Friend references for Codex", () => {
  const rendered = renderCodexInstructionText(
    [
      "/cf-review",
      "/cf-plan",
      "${CLAUDE_PLUGIN_ROOT}/hooks/rules-reminder.sh",
      "process.env.CLAUDE_PLUGIN_ROOT",
      "Use cf-writer (sonnet) and read CLAUDE.md.",
    ].join("\n"),
  );

  assert.equal(
    rendered,
    [
      "$cf-review",
      "$cf-plan",
      "${PLUGIN_ROOT}/hooks/rules-reminder.sh",
      "process.env.PLUGIN_ROOT",
      "Use cf-writer (medium reasoning effort) and read AGENTS.md.",
    ].join("\n"),
  );
});

test("renders Codex-native plan and session alternatives", () => {
  const planInput = [
    "Track progress: one item per task.",
    "Ask the user each round.",
    "Dispatch `cf-implementer` once per task, all in one message; wait for all results.",
  ].join("\n");
  const plan = renderCodexFile(
    "/repo/plugin/skills/cf-plan/SKILL.md",
    planInput,
  );
  assert.equal(plan, planInput);
  assert.doesNotMatch(plan, /TaskCreate|AskUserQuestion|run_in_background/);

  const modelFlag = renderCodexFile(
    "/repo/plugin/skills/cf-plan/SKILL.md",
    [
      "   1d. **`--model` flag** <!-- cf-plan-model-flag -->",
      "   Accept both `--model <alias>` (two tokens, e.g. `--model opus`) AND `--model=<alias>` (one token, e.g. `--model=sonnet`). Valid aliases: `opus`, `sonnet`, `haiku`, `fable` — the Agent tool `model` param enum.",
      "2. **Auto-detect** — scan the task for signals (need 2+ to trigger):",
    ].join("\n"),
  );
  assert.match(modelFlag, /`--model`/);
  assert.match(modelFlag, /gpt-5\.5/);
  assert.match(modelFlag, /2\. \*\*Auto-detect\*\*/);
  assert.doesNotMatch(modelFlag, /Agent tool/);
  assert.doesNotMatch(modelFlag, /opus|sonnet|haiku|fable/);

  const session = renderCodexFile(
    "/repo/plugin/skills/cf-session/SKILL.md",
    "Claude session implementation",
  );
  assert.match(session, /codex resume/);
  assert.match(session, /codex fork/);
  assert.doesNotMatch(session, /Claude session implementation/);
});

test("rewrites cf-plan --model spawn and cf-help for Codex", async () => {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const planSource = await fs.readFile(
    path.join(repoRoot, "plugin/skills/cf-plan/SKILL.md"),
    "utf8",
  );
  const plan = renderCodexFile(
    "/repo/plugin/skills/cf-plan/SKILL.md",
    planSource,
  );
  const step3Start = plan.indexOf("### Step 3:");
  const step3End = plan.indexOf("### Step 4:");
  assert.notEqual(step3Start, -1);
  assert.notEqual(step3End, -1);
  const step3 = plan.slice(step3Start, step3End);
  assert.match(step3, /explicit spawn model/);
  assert.doesNotMatch(step3, /subagent_type|context: fork|model: <alias>/);
  assert.match(plan, /`--model` vs resolved fast mode/);
  assert.match(plan, /<!-- cf-plan-model-flag -->/);
  assert.match(plan, /2\. \*\*Auto-detect\*\*/);
  assert.match(planSource, /Read now: `modes\/brainstorm\.md` at Step 1 rounds/);
  assert.match(
    planSource,
    /Read now: `templates\/plan-templates\.md` for Step 2\/3 prompts AND when writing the plan file/,
  );

  const helpSource = await fs.readFile(
    path.join(repoRoot, "plugin/skills/cf-help/SKILL.md"),
    "utf8",
  );
  const help = renderCodexFile(
    "/repo/plugin/skills/cf-help/SKILL.md",
    helpSource,
  );
  assert.doesNotMatch(help, /`--model <alias>`/);
  assert.match(help, /`--model <name>`/);
  assert.match(help, /gpt-5\.5/);
  assert.doesNotMatch(help, /Flags: `--with-codex`/);
  assert.match(
    help,
    /`--with-codex`\/`--codex` and `review\.withCodex` are ignored on Codex/,
  );
});

test("rewrites cf-review for Codex", async () => {
  const reviewFixture = renderCodexFile(
    "/repo/plugin/skills/cf-review/SKILL.md",
    [
      "**Codex dual-review flag:**",
      "",
      "- If `$ARGUMENTS` contains `--with-codex`, set `codex=true`.",
      "",
      "### Step 2: Gather the diff",
      "",
      "### Step 2.5: Spawn Codex review in the background (only when `codex=true`)",
      "",
      "bash run-codex-review.sh",
      "",
      "### Step 3: Assess change size",
      "",
      "### Step 6.5: Collect & normalize the Codex review (only when `codex=true`)",
      "",
      "bash normalize-codex-review.sh",
      "",
      "### Step 6.7: Emit `--out` prompt file (only when `out=true`)",
      "",
      "Emit --out",
      "",
      "### Step 7: Collect the report",
      "",
      "When any external source survived, merge.",
      "",
      "### Step 8: Mark review complete and display status",
      "",
      "Display the cf-reviewer's report first, then append the appropriate banner. When any external source contributed, add a `· Reviewed by: <in-session> + …` suffix. Omit the suffix when only the in-session reviewer ran.",
      "",
      "MUST: display the full report and the status banner in **one message**; do NOT split them.",
    ].join("\n"),
  );
  assert.match(reviewFixture, /Codex host behavior/);
  assert.match(reviewFixture, /Ignore `--with-codex`/);
  assert.match(
    reviewFixture,
    /The result of Step 6 is the final formatted report/,
  );
  assert.doesNotMatch(reviewFixture, /Codex dual-review flag/);
  assert.doesNotMatch(reviewFixture, /Step 2\.5: Spawn Codex review/);
  assert.doesNotMatch(
    reviewFixture,
    /Step 6\.5: Collect & normalize the Codex review/,
  );
  assert.doesNotMatch(reviewFixture, /run-codex-review\.sh/);
  assert.doesNotMatch(reviewFixture, /normalize-codex-review\.sh/);
  assert.doesNotMatch(reviewFixture, /When any external source contributed/);
  assert.match(reviewFixture, /Step 6\.7: Emit `--out`/);
  assert.match(reviewFixture, /one message/);

  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const reviewSource = await fs.readFile(
    path.join(repoRoot, "plugin/skills/cf-review/SKILL.md"),
    "utf8",
  );
  const review = renderCodexFile(
    "/repo/plugin/skills/cf-review/SKILL.md",
    reviewSource,
  );
  assert.match(review, /Codex host behavior/);
  assert.match(review, /Ignore `--with-codex`/);
  assert.match(review, /The result of Step 6 is the final formatted report/);
  assert.doesNotMatch(review, /Codex dual-review flag/);
  assert.doesNotMatch(review, /Step 2\.5: Spawn Codex review/);
  assert.doesNotMatch(
    review,
    /Step 6\.5: Collect & normalize the Codex review/,
  );
  assert.doesNotMatch(
    review,
    /run-codex-review\.sh|normalize-codex-review\.sh/,
  );
  assert.doesNotMatch(review, /codex=(?:true|false)/);
  assert.doesNotMatch(review, /When any external source contributed/);
  assert.doesNotMatch(review, /references\/external-reviewers\.md/);
  assert.match(review, /Step 6\.7/);
  assert.match(review, /Flag parse:/);
  assert.match(review, /`--out`/);
  assert.match(review, /`--claude`/);
  assert.match(reviewSource, /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/cf-review\/scripts\/run-codex-review\.sh/);
  assert.match(reviewSource, /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/cf-review\/scripts\/run-agent-review\.sh/);
  assert.match(reviewSource, /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/cf-review\/scripts\/normalize-codex-review\.sh/);
  assert.match(reviewSource, /or when `out=true`/);
  assert.match(reviewSource, /CF_AGENT/);
  assert.match(reviewSource, /one message/);
  assert.match(review, /one message/);
  assert.match(
    reviewSource,
    /`run-codex-review\.sh` only when `codex=true` and `out=false`/,
  );
  assert.match(
    reviewSource,
    /`run-agent-review\.sh` only when `agents` is non-empty and `out=false`/,
  );
  assert.match(
    reviewSource,
    /Collect `CF_CODEX` only when a Codex job was spawned/,
  );
  assert.match(
    reviewSource,
    /collect `CF_AGENT` only when agent jobs were spawned/,
  );
  assert.match(reviewSource, /`--gemini` alone must NOT spawn Codex/);
  assert.match(
    reviewSource,
    /`--with-codex` alone must NOT run `run-agent-review\.sh` with literal `<agent>`/,
  );
  assert.match(reviewSource, /HOST.*is `claude`|`--claude` when `HOST` is `claude`/);
  assert.match(
    reviewSource,
    /Read now: `references\/external-reviewers\.md` before parsing flags/,
  );

  const askSource = await fs.readFile(
    path.join(repoRoot, "plugin/skills/cf-ask/SKILL.md"),
    "utf8",
  );
  const scanSource = await fs.readFile(
    path.join(repoRoot, "plugin/skills/cf-scan/SKILL.md"),
    "utf8",
  );
  assert.match(
    askSource,
    /Never use relative paths in write specs \(nested git repos\); always `\{CF_DOCS_ROOT\}` \/ absolute/,
  );
  assert.match(
    scanSource,
    /Never use relative paths in write specs \(nested git repos\); always `\{CF_DOCS_ROOT\}` \/ absolute/,
  );
  assert.match(
    askSource,
    /Read the top 2–3 most relevant matched files/,
  );

  const fixSource = await fs.readFile(
    path.join(repoRoot, "plugin/skills/cf-fix/SKILL.md"),
    "utf8",
  );
  const fix = renderCodexFile("/repo/plugin/skills/cf-fix/SKILL.md", fixSource);
  assert.doesNotMatch(fix, /runs a Codex second opinion/);
  assert.match(fix, /ignores the Claude-only `review\.withCodex` setting/);
});

test("excludes cf-review external-reviewers from Codex artifact", () => {
  assert.ok(
    CODEX_EXCLUDED_SOURCE_PATHS.has(
      "skills/cf-review/references/external-reviewers.md",
    ),
  );
  for (const kept of [
    "skills/cf-plan/modes/brainstorm.md",
    "skills/cf-plan/templates/plan-templates.md",
    "skills/cf-scan/references/scan-templates.md",
    "skills/cf-ask/references/ask-templates.md",
  ]) {
    assert.equal(
      CODEX_EXCLUDED_SOURCE_PATHS.has(kept),
      false,
      `expected Codex builder to copy ${kept}`,
    );
  }
});

test("copies plan/ask/scan templates into Codex dest and keeps external-reviewers excluded", async () => {
  const repoRoot = await createFixtureRepo();
  const kept = [
    ["skills/cf-plan/modes/brainstorm.md", "Official solutions first"],
    ["skills/cf-plan/templates/plan-templates.md", "Plan file skeletons"],
    ["skills/cf-scan/references/scan-templates.md", "Scan templates"],
    ["skills/cf-ask/references/ask-templates.md", "[Idle] --start--> [Running]"],
  ];
  for (const [rel, body] of kept) {
    await writeText(path.join(repoRoot, "plugin", rel), `${body}\n`);
  }
  await writeText(
    path.join(
      repoRoot,
      "plugin/skills/cf-review/references/external-reviewers.md",
    ),
    "should not copy\n",
  );

  await buildCodexPlugin({ repoRoot });

  for (const [rel, body] of kept) {
    const dest = await fs.readFile(path.join(repoRoot, "plugin-codex", rel), "utf8");
    assert.match(dest, new RegExp(body.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  await assert.rejects(
    () =>
      fs.readFile(
        path.join(
          repoRoot,
          "plugin-codex/skills/cf-review/references/external-reviewers.md",
        ),
      ),
    { code: "ENOENT" },
  );
});

test("live Codex tree copies distinctive brainstorm and ask-templates strings", async () => {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const brainstorm = await fs.readFile(
    path.join(repoRoot, "plugin-codex/skills/cf-plan/modes/brainstorm.md"),
    "utf8",
  );
  const askTemplates = await fs.readFile(
    path.join(repoRoot, "plugin-codex/skills/cf-ask/references/ask-templates.md"),
    "utf8",
  );
  assert.match(brainstorm, /Official solutions first/);
  assert.match(askTemplates, /\[Idle\] --start--> \[Running\]/);
});

test("rewrites fenced run_in_background outside cf-plan", () => {
  const rendered = renderCodexFile(
    "/repo/plugin/skills/cf-plan-review/SKILL.md",
    "```\nrun_in_background: true\nbash x\n```",
  );
  assert.match(rendered, /run in the background/);
  assert.doesNotMatch(rendered, /run_in_background/);
});

test("renders Codex instruction rewrites on skill sub-files", () => {
  const executeInput =
    "Dispatch `cf-implementer` once per task, all in one message; wait for all results.";
  const execute = renderCodexFile(
    "/repo/plugin/skills/cf-plan/modes/execute.md",
    executeInput,
  );
  assert.equal(execute, executeInput);
  assert.doesNotMatch(execute, /run_in_background/);

  const tddMode = renderCodexFile(
    "/repo/plugin/skills/cf-tdd/modes/x.md",
    "Claude does NOT need",
  );
  assert.equal(tddMode, "Codex does NOT need");
});

test("rewrites bootstrap Dispatch verb for Codex", async () => {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const source = await fs.readFile(
    path.join(repoRoot, "plugin/context/bootstrap.md"),
    "utf8",
  );
  const rendered = renderCodexFile(
    "/repo/plugin/context/bootstrap.md",
    source,
  );
  assert.match(rendered, /spawn the `<agent>` custom agent/);
  assert.doesNotMatch(rendered, /subagent_type/);
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
  assert.match(toml, /model_reasoning_effort = "low"/);
  assert.doesNotMatch(toml, /^model =/m);
  assert.doesNotMatch(toml, /^tools =/m);
  assert.match(
    toml,
    /developer_instructions = '''\n# Example\n\nUse \$cf-review and cf-writer\.\n'''/,
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
      "lib/protocols/implementer-result.md",
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
  assert.match(
    readme,
    /Codex subagent workflow with `cf-explorer` custom agent/,
  );
  assert.doesNotMatch(readme, /\{\{cf:/);

  const skill = await fs.readFile(
    path.join(codexPluginDir, "skills", "cf-example", "SKILL.md"),
    "utf8",
  );
  assert.match(
    skill,
    /Use \$cf-review and the Codex subagent workflow with `cf-writer` custom agent\./,
  );
  const skillFrontmatter = skill.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(skillFrontmatter);
  assert.doesNotMatch(skillFrontmatter[1], /^model:|^allowed-tools:/m);
  assert.match(skill, /The model: keep this body example/);

  const shellMode = (
    await fs.stat(path.join(codexPluginDir, "hooks", "privacy-block.sh"))
  ).mode;
  assert.equal(shellMode & 0o111, 0o111);

  const protocol = await fs.readFile(
    path.join(codexPluginDir, "lib/protocols/implementer-result.md"),
    "utf8",
  );
  assert.match(protocol, /CF-RESULT-FIXTURE-PROTOCOL/);
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

test("live Codex tree includes implementer-result protocol", async () => {
  const repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const source = await fs.readFile(
    path.join(repoRoot, "plugin/lib/protocols/implementer-result.md"),
    "utf8",
  );
  const artifact = await fs.readFile(
    path.join(repoRoot, "plugin-codex/lib/protocols/implementer-result.md"),
    "utf8",
  );
  assert.match(source, /previous_failure/);
  assert.match(artifact, /previous_failure/);
});

test("Codex builder no longer ships dead Claude tool phrase replaces", async () => {
  const source = await fs.readFile(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../build-codex-plugin.js"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /TaskCreate|AskUserQuestion|Skill tool|WebFetch|Write tool/,
  );
});
