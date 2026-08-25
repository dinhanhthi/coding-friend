#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { parseFrontmatter } = require("./lib/agent-md-to-toml.js");
const {
  assertSourceDir,
  copyFilePreservingMode,
  copyRenderedTree,
  stableJson,
  stripClaudeSkillFrontmatter,
} = require("./lib/plugin-build-common.js");

const REPO_ROOT = path.resolve(__dirname, "..");
const PLUGIN_SOURCE_DIR = path.join(REPO_ROOT, "plugin");
const AGY_PLUGIN_DIR = path.join(REPO_ROOT, "plugin-antigravity");

// Claude-only and Codex-only files (relative to plugin/) that would ship as
// dead or self-contradictory weight in the Antigravity artifact. `.agy.*`
// adapters and the shared helpers they require (`auto-approve.cjs`,
// `scout-block.cjs`, `lib/agy-hook-io.sh`) stay. session-init.agy.sh injects
// only the dynamic header, so `context/` is excluded (bootstrap lands in
// rules/AGENTS.md instead).
const AGY_EXCLUDED_SOURCE_PATHS = new Set([
  "context",
  "omp",
  "hooks/statusline.sh",
  "hooks/auto-approve.codex.cjs",
  "hooks/memory-capture.sh",
  "hooks/memory-capture.codex.sh",
  "hooks/task-tracker.sh",
  "hooks/agent-tracker.sh",
  "hooks/session-log.sh",
  "hooks/rules-reminder.sh",
  "hooks/session-init.sh",
  "hooks/privacy-block.sh",
  "hooks/hooks.json",
  "skills/cf-session/scripts",
  "skills/cf-review/scripts/run-codex-review.sh",
  "skills/cf-review/scripts/normalize-codex-review.sh",
]);

const AGY_AGENT_MODELS = {
  haiku: "flash",
  flash: "flash",
  sonnet: "pro",
  pro: "pro",
  opus: "pro",
  inherit: "inherit",
};

// AGY has no plugin-root env. Skill `run_command` uses workspace cwd, so `./`
// would resolve under the project, not ~/.gemini/config/plugins/coding-friend/.
// Instruction text uses the `<plugin-root>` token (defined in rules/AGENTS.md).
const AGY_PLUGIN_ROOT_TOKEN = "<plugin-root>";
const AGY_PLUGIN_ROOT_PHRASE =
  "the plugin directory (the parent of the `skills/` folder that contains this SKILL.md)";
const AGY_PLUGIN_ROOT_NOTE =
  "Plugin root: the directory that contains the `skills/` folder this SKILL.md lives in. Replace `<plugin-root>` with that path when running bundled scripts.";

function skillRelativePosixPath(normalizedPath) {
  const idx = normalizedPath.lastIndexOf("/skills/");
  if (idx !== -1) return normalizedPath.slice(idx + 1);
  if (normalizedPath.startsWith("skills/")) return normalizedPath;
  return null;
}

function isAgySkillExecutable(normalizedPath) {
  const relative = skillRelativePosixPath(normalizedPath);
  return Boolean(relative) && /\.(?:sh|cjs)$/.test(relative);
}

function agyPluginRootFromScript(normalizedPath) {
  const relative = skillRelativePosixPath(normalizedPath);
  if (!relative) return null;
  const dirParts = relative.split("/").slice(0, -1);
  if (dirParts.length === 0) return ".";
  return dirParts.map(() => "..").join("/");
}

function rewriteAgySkillScriptPluginRoot(normalizedPath, input) {
  const up = agyPluginRootFromScript(normalizedPath);
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

function renderAgyText(input) {
  return input
    .replace(/\{\{cf:slash\s+([a-z0-9-]+)\}\}/g, (_match, name) => `/${name}`)
    .replace(/\{\{cf:agent_ref\s+([a-z0-9-]+)\}\}/g, (_match, name) => name)
    .replace(
      /\{\{cf:skill_invoke\s+([a-z0-9-]+)\}\}/g,
      (_match, name) => `activate the \`${name}\` skill (type \`/${name}\`)`,
    )
    .replace(/\{\{cf:plugin_root\}\}/g, AGY_PLUGIN_ROOT_PHRASE)
    .replace(/\{\{cf:host\}\}/g, "Google Antigravity")
    .replace(
      /\{\{cf:dispatch\s+agent=([a-z0-9-]+)\s+prompt="([^"]*)"\}\}/g,
      (_match, agent, prompt) =>
        `Call \`invoke_subagent\` with agent \`${agent}\` and this task: ${prompt}`,
    )
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}\//g, `${AGY_PLUGIN_ROOT_TOKEN}/`)
    .replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, AGY_PLUGIN_ROOT_TOKEN)
    .replace(/\bCLAUDE\.md\b/g, "AGENTS.md")
    .replace(
      /use the Skill tool with skill name `coding-friend:(cf-[a-z0-9-]+)`/g,
      (_match, name) => `activate the \`${name}\` skill (type \`/${name}\`)`,
    )
    .replace(
      /Use the \*\*Agent tool\*\* with `subagent_type: "coding-friend:(cf-[a-z0-9-]+)"`\./g,
      (_match, name) => `Call \`invoke_subagent\` with agent \`${name}\`.`,
    )
    .replace(
      /via the \*\*Agent tool\*\* with `subagent_type: "coding-friend:(cf-[a-z0-9-]+)"`/g,
      (_match, name) => `by calling \`invoke_subagent\` with agent \`${name}\``,
    )
    .replace(
      /\(Agent tool, `subagent_type: "coding-friend:(cf-[a-z0-9-]+)"`\)/g,
      (_match, name) => `(\`invoke_subagent\` with agent \`${name}\`)`,
    )
    .replace(
      /`subagent_type: "coding-friend:(cf-[a-z0-9-]+)"`/g,
      (_match, name) => `\`invoke_subagent\` with agent \`${name}\``,
    );
}

function renderAgyInstructionText(input) {
  return renderAgyText(input)
    .replace(/\busing the Agent tool\b/gi, "using `invoke_subagent`")
    .replace(/\*\*Agent tool\*\*/g, "`invoke_subagent`")
    .replace(/\bAgent tool\b/g, "`invoke_subagent`")
    .replace(/`AskUserQuestion`/g, "a direct user question")
    .replace(/\bAskUserQuestion\b/g, "a direct user question")
    .replace(
      /tracked via TaskCreate/g,
      "tracked with an inline checklist",
    )
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
      /with a `TaskUpdate` on the matching task/g,
      "with a checklist update on the matching task",
    )
    .replace(/`TaskCreate`/g, "an inline checklist")
    .replace(/\bTaskCreate\b/g, "an inline checklist")
    .replace(/`TaskUpdate`/g, "the inline checklist")
    .replace(/\bTaskUpdate\b/g, "the inline checklist")
    .replace(
      /Spawn one cf-implementer \*\*per task\*\* with `run_in_background: true` — all in a \*\*single message block\*\*\./g,
      "Call `invoke_subagent` with agent `cf-implementer` once per task in parallel, wait for all agents, and collect each result.",
    )
    .replace(/\(haiku\)/g, "(flash)")
    .replace(/\(sonnet\)/g, "(pro)")
    .replace(/\(opus\)/g, "(pro)")
    .replace(/\bWebSearch and WebFetch\b/g, "search_web and read_url_content")
    .replace(/\bWebSearch\b/g, "search_web")
    .replace(/\bWebFetch\b/g, "read_url_content")
    .replace(
      /Use the Write tool for new files/g,
      "Create new files with write_to_file",
    )
    .replace(
      /Use the Edit tool for appending to or updating existing files/g,
      "Edit existing files with replace_file_content",
    )
    .replace(/\bEdit tool calls?\b/g, "file edits")
    .replace(/\bEdit calls?\b/g, "file edits")
    .replace(
      /it runs on Haiku for cost\s+efficiency\./gi,
      "It uses flash for cost efficiency.",
    )
    .replace(
      /Runs on Haiku for speed\./g,
      "Uses flash for speed.",
    )
    .replace(
      /Runs on Sonnet for deeper reasoning\s+than Haiku\./g,
      "Uses pro for deeper analysis.",
    )
    .replace(/\(model: sonnet\)/g, "(model: pro)")
    .replace(/\(model: haiku\)/g, "(model: flash)")
    .replace(/\(model: opus\)/g, "(model: pro)")
    .replace(
      /Launch the `cf-reviewer-reducer` agent \(model: haiku by default — honor the `CF_REDUCER_MODEL` environment variable if set to `sonnet` or `opus`, to let users upgrade reducer quality without editing agent files\)/g,
      "Launch the `cf-reviewer-reducer` agent (model: flash by default — honor the `CF_REDUCER_MODEL` environment variable if set to `pro`, to let users upgrade reducer quality without editing agent files)",
    )
    .replace(
      /re-run with `CF_REDUCER_MODEL=sonnet` for a more conservative merge/g,
      "re-run with `CF_REDUCER_MODEL=pro` for a more conservative merge",
    )
    .replace(/helps Claude produce/g, "helps Antigravity produce")
    .replace(/phase file Claude re-opens/g, "phase file Antigravity re-opens")
    .replace(/if Claude finds itself/g, "if Antigravity finds itself")
    .replace(/Claude does NOT need/g, "Antigravity does NOT need")
    .replace(/\bCLAUDE_PLUGIN_ROOT\b/g, "the plugin directory")
    .replace(
      /> If `review\.withCodex: true` is set in the config, cf-review automatically runs a Codex second-opinion review alongside Claude's and merges both — no flag needed here \(cf-review reads the config itself\)\./g,
      "> On Google Antigravity, cf-review uses the native Coding Friend multi-agent review and ignores the Claude-only `review.withCodex` second-opinion setting.",
    )
    .replace(
      /\(If `review\.withCodex: true` is set in the config, cf-review automatically adds a Codex second-opinion review and merges both — no flag needed here\.\)/g,
      "(On Google Antigravity, cf-review uses the native Coding Friend multi-agent review and ignores the Claude-only `review.withCodex` setting.)",
    );
}

function renderAgyPlanSkill(input) {
  return input
    .replace(
      / <!-- cf-plan-model-flag -->[\s\S]*?(?=\n2\. \*\*Auto-detect\*\*)/g,
      [
        "",
        "   Accept both `--model <alias>` (two tokens, e.g. `--model pro`) AND `--model=<alias>` (one token, e.g. `--model=flash`). **Strip both the flag and the value** from the task description before using the remainder. This is the first two-token flag in this skill — every other flag is a boolean one-token flag, so a naive \"strip the flag\" would leave the value behind (e.g. leftover `pro` would leak into the task description and get passed to cf-explorer). Example: `/cf-plan --model pro Add a healthz endpoint` → remaining task description is exactly `Add a healthz endpoint`. Valid aliases: `inherit`, `flash`, `pro`. Do not accept Claude aliases (`opus`, `sonnet`, `haiku`, `fable`) or full model IDs. Invalid value → print this exact warning then CONTINUE (do NOT stop): `> ⚠️ --model <value> is not a valid Antigravity model alias (inherit|flash|pro). Ignoring it; cf-planner inherits the session model.` If `--fast`/`--quick` is already in `$ARGUMENTS`, print this exact warning then CONTINUE: `> ⚠️ --model bị bỏ qua ở fast mode (Step 3 không dispatch cf-planner).` Auto-detected fast is not known yet — item 4 re-checks after mode is resolved (steps 2–3). `--hard` still dispatches cf-planner, so the flag remains effective in hard mode. When a valid alias is parsed, it is used at Step 3 unless skipped as fast.",
      ].join("\n"),
    )
    .replace(
      / <!-- cf-plan-model-spawn -->[\s\S]*?(?=\n\n> Plan:)/g,
      [
        "",
        "When a valid alias was parsed in 1d, call `invoke_subagent` with agent `cf-planner` and that explicit model (`inherit`, `flash`, or `pro`). If no `--model` was given, or the value was invalid/skipped (fast mode), omit an explicit spawn model so `cf-planner` inherits the session model.",
      ].join("\n"),
    );
}

function renderAgyReviewSkill(input) {
  return input
    .replace(
      /\*\*Codex dual-review flag:\*\*[\s\S]*?(?=\n### Step 2: Gather the diff)/,
      [
        "**Antigravity host behavior:**",
        "",
        "- This skill already runs inside Google Antigravity. Ignore `--with-codex`, its `--codex` alias, and `review.withCodex`; do not launch a nested `codex review` subprocess.",
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

function renderAgySessionSkill() {
  return `---
name: cf-session
description: >
  Continue or resume Google Antigravity conversations with the native session
  controls. Use when the user asks to resume, continue, or restore an Antigravity
  session. Antigravity owns its transcript format, so Coding Friend does not copy
  or rewrite session files.
---

# /cf-session

Google Antigravity provides native session management:

- Use \`/resume\` in the IDE or run \`agy --continue\` to continue a saved conversation.

Do not run Coding Friend's Claude session scripts or parse Antigravity session files.
If the user needs cross-machine continuity, explain that native Antigravity session
availability is the supported path and keep durable project knowledge in \`docs/memory/\`.
`;
}

function isAgyInstructionFile(normalizedPath) {
  if (normalizedPath.endsWith("/CHANGELOG.md")) return false;
  if (normalizedPath.endsWith("/SKILL.md")) return true;
  if (normalizedPath.endsWith("/README.md")) return true;
  if (normalizedPath.includes("/context/")) return true;
  if (normalizedPath.includes("/agents/")) return true;
  if (normalizedPath.includes("/rules/")) return true;
  return normalizedPath.includes("/skills/") && normalizedPath.endsWith(".md");
}

function renderAgyFile(sourcePath, input) {
  const normalizedPath = sourcePath.split(path.sep).join("/");
  const isSkill = normalizedPath.endsWith("/SKILL.md");
  const source = isAgySkillExecutable(normalizedPath)
    ? rewriteAgySkillScriptPluginRoot(normalizedPath, input)
    : input;
  let rendered = isAgyInstructionFile(normalizedPath)
    ? renderAgyInstructionText(source)
    : renderAgyText(source);

  if (isSkill) {
    rendered = stripClaudeSkillFrontmatter(rendered);
  }

  if (normalizedPath.includes("/skills/cf-plan/")) {
    rendered = renderAgyPlanSkill(rendered);
  } else if (normalizedPath.endsWith("/skills/cf-review/SKILL.md")) {
    rendered = renderAgyReviewSkill(rendered);
  } else if (normalizedPath.endsWith("/skills/cf-session/SKILL.md")) {
    rendered = renderAgySessionSkill();
  } else if (normalizedPath.endsWith("/skills/cf-help/SKILL.md")) {
    rendered = rendered
      .replace(
        "Coding Friend is a lean toolkit for disciplined engineering workflows in Claude Code.",
        "Coding Friend is a lean toolkit for disciplined engineering workflows in Google Antigravity.",
      )
      .replace(
        / Flag: `--with-codex` runs a Codex second-opinion review in parallel and merges both into one report \(set `review\.withCodex: true` in config to enable by default; auto-skips with a warning if Codex is unavailable\)\./,
        "",
      )
      .replace(
        /Flags: `--with-codex`\/`--codex`, `--claude`, `--gemini`, `--cursor`, `--grok` run headless external reviewers in parallel and merge into one report; `--out` exports a `\/cf-review-out` prompt with Claude's findings embedded\. Set `review\.withCodex: true` in config to enable Codex by default; `review\.agentTimeout` \(default 300s\) bounds each external agent\. Unavailable agents are skipped with a warning\./,
        "Flags: `--claude`, `--gemini`, `--cursor`, `--grok` run headless external reviewers in parallel and merge into one report; `--out` exports a `/cf-review-out` prompt with in-session findings embedded. `--with-codex`/`--codex` and `review.withCodex` are ignored on Google Antigravity (do not spawn a nested Codex review). `review.agentTimeout` (default 300s) bounds each external agent. Unavailable agents are skipped with a warning.",
      )
      .replace(
        /\n- \*\*After editing plugin files\?\*\* Run `cf dev sync` to copy changes to the cached version\./,
        "",
      )
      .replace(
        /`--model <alias>` pin the model for cf-planner at the brainstorm step/,
        "`--model <alias>` pin the model for cf-planner at the brainstorm step (valid: `inherit`, `flash`, `pro`)",
      );
  } else if (
    normalizedPath.endsWith(
      "/skills/cf-review-out/scripts/build-review-prompt.sh",
    )
  ) {
    rendered = rendered.replace(
      /paste the following prompt to Claude Code to collect the results/,
      "paste the following prompt to Google Antigravity to collect the results",
    );
  } else if (normalizedPath.endsWith("/skills/cf-review-out/SKILL.md")) {
    rendered = rendered.replace(
      /> \*\*Using Codex\?\*\*[\s\S]*?(?=\n\n)/,
      "> **Using Google Antigravity?** Run `/cf-review` directly. The review-out/review-in round trip remains available for other external reviewers or humans.",
    );
  }

  return rendered;
}

function renderAgyAgentMarkdown(markdown) {
  const { frontmatter, body } = parseFrontmatter(markdown);
  if (!frontmatter.name) {
    throw new Error("Agent markdown is missing frontmatter name");
  }

  const model = AGY_AGENT_MODELS[frontmatter.model] ?? "inherit";
  const description = renderAgyInstructionText(
    frontmatter.description ?? "",
  ).trim();
  const renderedBody = renderAgyInstructionText(body).replace(/^\n+/, "");

  return [
    "---",
    `name: ${frontmatter.name}`,
    "description: >",
    `  ${description}`,
    `model: ${model}`,
    "---",
    "",
    renderedBody.trimEnd(),
    "",
  ].join("\n");
}

async function writeAgyAgents(sourceAgentDir, targetAgentDir) {
  await fs.mkdir(targetAgentDir, { recursive: true });
  const entries = await fs.readdir(sourceAgentDir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !/^cf-.*\.md$/.test(entry.name)) continue;
    const sourcePath = path.join(sourceAgentDir, entry.name);
    const markdown = await fs.readFile(sourcePath, "utf8");
    await fs.writeFile(
      path.join(targetAgentDir, entry.name),
      renderAgyAgentMarkdown(markdown),
    );
  }
}

function transformAgyHooks() {
  return {
    "coding-friend": {
      PreInvocation: [
        {
          type: "command",
          command: "CF_HOST=agy ./hooks/session-init.agy.sh",
          timeout: 15,
        },
        {
          type: "command",
          command: "CF_HOST=agy ./hooks/rules-reminder.agy.sh",
          timeout: 10,
        },
      ],
      PreToolUse: [
        {
          matcher:
            "view_file|grep_search|find_by_name|list_dir|write_to_file|replace_file_content|multi_replace_file_content|run_command",
          hooks: [
            {
              type: "command",
              command: "CF_HOST=agy ./hooks/privacy-block.agy.sh",
              timeout: 10,
            },
            {
              type: "command",
              command: "CF_HOST=agy ./hooks/scout-block.agy.cjs",
              timeout: 10,
            },
          ],
        },
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command: "CF_HOST=agy node ./hooks/auto-approve.agy.cjs",
              timeout: 15,
            },
          ],
        },
      ],
      Stop: [
        {
          type: "command",
          command: "CF_HOST=agy ./hooks/session-log.agy.sh",
          timeout: 10,
        },
      ],
    },
  };
}

function createAntigravityPluginManifest({ version }) {
  return {
    name: "coding-friend",
    version,
    description:
      "Lean toolkit for disciplined engineering workflows with Google Antigravity (beta)",
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
      "memory",
    ],
  };
}

function createAntigravityMcpConfig() {
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

async function writeAgyRules(pluginSourceDir, agyPluginDir) {
  const bootstrapPath = path.join(pluginSourceDir, "context", "bootstrap.md");
  const bootstrap = await fs.readFile(bootstrapPath, "utf8");
  const rendered = renderAgyInstructionText(bootstrap).replace(/^\uFEFF/, "");
  const content = [
    "# Coding Friend (Antigravity, beta)",
    "",
    "HOST: agy",
    "",
    AGY_PLUGIN_ROOT_NOTE,
    "",
    rendered.replace(/^\n+/, "").trimEnd(),
    "",
  ].join("\n");
  const targetPath = path.join(agyPluginDir, "rules", "AGENTS.md");
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, content);
}

async function buildAntigravityPlugin({ repoRoot = REPO_ROOT } = {}) {
  const pluginSourceDir = path.join(repoRoot, "plugin");
  const agyPluginDir = path.join(repoRoot, "plugin-antigravity");
  await assertSourceDir(pluginSourceDir);

  const packageJson = JSON.parse(
    await fs.readFile(path.join(repoRoot, "package.json"), "utf8"),
  );

  await fs.rm(agyPluginDir, { recursive: true, force: true });
  await fs.mkdir(agyPluginDir, { recursive: true });

  const treeOptions = {
    render: renderAgyFile,
    exclude: AGY_EXCLUDED_SOURCE_PATHS,
  };
  await copyRenderedTree(
    path.join(pluginSourceDir, "skills"),
    path.join(agyPluginDir, "skills"),
    { ...treeOptions, prefix: "skills" },
  );
  await copyRenderedTree(
    path.join(pluginSourceDir, "hooks"),
    path.join(agyPluginDir, "hooks"),
    { ...treeOptions, prefix: "hooks" },
  );
  await copyRenderedTree(
    path.join(pluginSourceDir, "lib"),
    path.join(agyPluginDir, "lib"),
    { ...treeOptions, prefix: "lib" },
  );

  const readmePath = path.join(pluginSourceDir, "README.md");
  await copyFilePreservingMode(
    readmePath,
    path.join(agyPluginDir, "README.md"),
    (content) => renderAgyFile(readmePath, content),
  );

  const changelogPath = path.join(pluginSourceDir, "CHANGELOG.md");
  await copyFilePreservingMode(
    changelogPath,
    path.join(agyPluginDir, "CHANGELOG.md"),
    (content) => content,
  );

  await writeAgyAgents(
    path.join(pluginSourceDir, "agents"),
    path.join(agyPluginDir, "agents"),
  );
  await writeAgyRules(pluginSourceDir, agyPluginDir);

  await fs.writeFile(
    path.join(agyPluginDir, "hooks.json"),
    stableJson(transformAgyHooks()),
  );
  await fs.writeFile(
    path.join(agyPluginDir, "plugin.json"),
    stableJson(
      createAntigravityPluginManifest({ version: packageJson.version }),
    ),
  );
  await fs.writeFile(
    path.join(agyPluginDir, "mcp_config.json"),
    stableJson(createAntigravityMcpConfig()),
  );

  const { findAntigravityArtifactLintIssues } = await import(
    pathToFileURL(path.join(__dirname, "placeholder-lint.mjs")).href
  );
  const lintIssues = await findAntigravityArtifactLintIssues(repoRoot);
  if (lintIssues.length > 0) {
    const details = lintIssues
      .map(
        (issue) => `${issue.file}:${issue.line}: ${issue.type}: ${issue.value}`,
      )
      .join("\n");
    throw new Error(
      `Generated Antigravity plugin contains unresolved or host-incompatible references:\n${details}`,
    );
  }
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
  renderAgyAgentMarkdown,
  renderAgyFile,
  renderAgyInstructionText,
  renderAgyText,
  stripClaudeSkillFrontmatter,
  transformAgyHooks,
};
