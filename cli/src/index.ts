#!/usr/bin/env node

import { Command, CommanderError } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { installedPluginsPath } from "./lib/paths.js";
import { isJsonArgv } from "./lib/output.js";
import { shouldSkipPostAction, toUsageEnvelope } from "./lib/json-guard.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
);

/** Read the installed Coding Friend plugin version from installed_plugins.json. */
function getInstalledPluginVersion(): string | null {
  try {
    const data = JSON.parse(readFileSync(installedPluginsPath(), "utf-8"));
    const plugins = (data.plugins ?? data) as Record<string, unknown>;
    for (const [key, value] of Object.entries(plugins)) {
      if (!key.includes("coding-friend")) continue;
      if (Array.isArray(value) && value.length > 0) {
        const entry = value[0] as Record<string, unknown>;
        if (typeof entry.version === "string") return entry.version;
      }
      if (typeof value === "object" && value !== null && "version" in value) {
        return (value as { version: string }).version;
      }
    }
  } catch {
    // file missing or unreadable
  }
  return null;
}

/** Build the version string. Plugin lookup only runs when -v/--version is requested. */
function buildVersionString(): string {
  const pluginVersion = getInstalledPluginVersion();
  return [
    `CLI    ${pkg.version}`,
    `plugin ${pluginVersion ?? "(not installed)"}`,
  ].join("\n");
}

const wantsVersion =
  process.argv.includes("-v") || process.argv.includes("--version");

const program = new Command();

// JSON mode: turn commander usage errors into an envelope instead of exiting.
// Must run before any .command(): commander copies exitOverride to
// subcommands only when they are created.
const jsonMode = isJsonArgv(process.argv);
if (jsonMode) program.exitOverride();

program
  .name("cf")
  .description(
    "coding-friend CLI — host learning docs, setup MCP, init projects",
  )
  .version(wantsVersion ? buildVersionString() : pkg.version, "-v, --version");

program
  .command("install")
  .description("Install the Coding Friend plugin into a supported host")
  .option("--user", "Install at user scope (all projects)")
  .option("--global", "Install at user scope (all projects)")
  .option("--project", "Install at project scope (shared via git)")
  .option("--local", "Install at local scope (this machine only)")
  .option(
    "--agent <agent>",
    "Operate on host agent: claude, codex, omp, agy, or devin",
  )
  .option("--codex", "Alias for --agent codex")
  .option("--omp", "Alias for --agent omp")
  .option("--agy", "Shortcut for --agent agy (beta)")
  .option("--devin", "Shortcut for --agent devin (beta)")
  .option("--yes", "Skip prompts (default scope: user)")
  .option("--json", "Output a JSON envelope (requires --yes or a scope flag)")
  .action(async (opts) => {
    const { installCommand } = await import("./commands/install.js");
    await installCommand(opts);
  });

program
  .command("uninstall")
  .description("Uninstall the Coding Friend plugin from a supported host")
  .option("--user", "Uninstall from user scope (all projects)")
  .option("--global", "Uninstall from user scope (all projects)")
  .option("--project", "Uninstall from project scope")
  .option("--local", "Uninstall from local scope")
  .option(
    "--agent <agent>",
    "Operate on host agent: claude, codex, omp, agy, or devin",
  )
  .option("--codex", "Alias for --agent codex")
  .option("--omp", "Alias for --agent omp")
  .option("--agy", "Shortcut for --agent agy (beta)")
  .option("--devin", "Shortcut for --agent devin (beta)")
  .option(
    "--remove-marketplace",
    "Also remove the host marketplace registration",
  )
  .action(async (opts) => {
    const { uninstallCommand } = await import("./commands/uninstall.js");
    await uninstallCommand(opts);
  });

program
  .command("disable")
  .description("Disable the Coding Friend plugin without uninstalling")
  .option("--user", "Disable at user scope (all projects)")
  .option("--global", "Disable at user scope (all projects)")
  .option("--project", "Disable at project scope")
  .option("--local", "Disable at local scope")
  .option(
    "--agent <agent>",
    "Operate on host agent: claude, codex, omp, agy, or devin",
  )
  .option("--codex", "Alias for --agent codex")
  .option("--omp", "Alias for --agent omp")
  .option("--agy", "Shortcut for --agent agy (beta)")
  .option("--devin", "Shortcut for --agent devin (beta)")
  .action(async (opts) => {
    const { disableCommand } = await import("./commands/disable.js");
    await disableCommand(opts);
  });

program
  .command("enable")
  .description("Re-enable the Coding Friend plugin")
  .option("--user", "Enable at user scope (all projects)")
  .option("--global", "Enable at user scope (all projects)")
  .option("--project", "Enable at project scope")
  .option("--local", "Enable at local scope")
  .option(
    "--agent <agent>",
    "Operate on host agent: claude, codex, omp, agy, or devin",
  )
  .option("--codex", "Alias for --agent codex")
  .option("--omp", "Alias for --agent omp")
  .option("--agy", "Shortcut for --agent agy (beta)")
  .option("--devin", "Shortcut for --agent devin (beta)")
  .action(async (opts) => {
    const { enableCommand } = await import("./commands/enable.js");
    await enableCommand(opts);
  });

program
  .command("init")
  .description("Initialize coding-friend in current project")
  .option(
    "--agent <agent>",
    "Operate on host agent: claude, codex, omp, agy, or devin",
  )
  .option("--codex", "Alias for --agent codex")
  .option("--omp", "Alias for --agent omp")
  .option("--agy", "Shortcut for --agent agy (beta)")
  .option("--devin", "Shortcut for --agent devin (beta)")
  .option(
    "--trust-project",
    "For Codex, mark the current project trusted in ~/.codex/config.toml",
  )
  .action(async (opts) => {
    const { initCommand } = await import("./commands/init.js");
    await initCommand(opts);
  });

const config = program
  .command("config")
  .description("Manage Coding Friend configuration");

// Hidden default: bare `cf config` still opens the interactive menu.
config
  .command("menu", { isDefault: true, hidden: true })
  .description("Interactive configuration menu")
  .action(async () => {
    const { configCommand } = await import("./commands/config.js");
    await configCommand();
  });

config
  .command("get [key]")
  .description("Show config (all, or one dotted key) and where it comes from")
  .option("--global", "Read only the global config")
  .option("--local", "Read only the local project config")
  .option("--json", "Output a JSON envelope")
  .action(async (key: string | undefined, opts) => {
    const { configGetCommand } =
      await import("./commands/config-subcommands.js");
    await configGetCommand(key, opts);
  });

config
  .command("set <key> <value>")
  .description("Set a dotted config key (JSON value or string; null deletes)")
  .option("--global", "Write the global config")
  .option("--local", "Write the local project config")
  .option("--json", "Output a JSON envelope")
  .action(async (key: string, value: string, opts) => {
    const { configSetCommand } =
      await import("./commands/config-subcommands.js");
    await configSetCommand(key, value, opts);
  });

config
  .command("schema")
  .description("Print the JSON Schema of the config file")
  .option("--json", "Output a JSON envelope")
  .action(async (opts) => {
    const { configSchemaCommand } =
      await import("./commands/config-subcommands.js");
    await configSchemaCommand(opts);
  });

const learn = program
  .command("learn")
  .description("Manage learning docs — host as a website or push to git");

program.addHelpText(
  "after",
  `
Learn subcommands:
  learn host [path]   Build and serve learning docs as a static website
  learn push [path]   Commit and push learning docs (only if learn dir is the git root)`,
);

learn
  .command("host")
  .description("Build and serve learning docs as a static website")
  .argument("[path]", "path to docs folder")
  .option("-p, --port <port>", "port number", "3333")
  .action(async (path, opts) => {
    const { hostCommand } = await import("./commands/host.js");
    await hostCommand(path, opts);
  });

learn
  .command("push")
  .description("Commit and push learning docs to origin")
  .argument("[path]", "path to docs folder")
  .action(async (path) => {
    const { learnPushCommand } = await import("./commands/learn.js");
    await learnPushCommand(path);
  });

// Legacy alias for `cf learn host` — kept working but hidden from help.
program
  .command("host", { hidden: true })
  .argument("[path]", "path to docs folder")
  .option("-p, --port <port>", "port number", "3333")
  .action(async (path, opts) => {
    const { hostCommand } = await import("./commands/host.js");
    await hostCommand(path, opts);
  });

program
  .command("mcp")
  .description("Setup MCP server for learning docs")
  .option("--json", "Output a JSON envelope")
  .action(async (opts) => {
    const { mcpCommand } = await import("./commands/mcp.js");
    await mcpCommand(opts);
  });

program
  .command("mcp-serve")
  .description(
    "Start the cf-memory MCP server (used internally by npx). When memoryDir is omitted, resolves from CLAUDE_PROJECT_DIR at runtime.",
  )
  .argument("[memoryDir]", "path to memory directory (optional)")
  .action(async (memoryDir: string | undefined) => {
    const { mcpServeCommand } = await import("./commands/mcp-serve.js");
    await mcpServeCommand(memoryDir);
  });

program
  .command("mcp-serve-learn")
  .description("Start the learn MCP server (used internally by npx)")
  .argument("<docsDir>", "path to docs directory")
  .action(async (docsDir: string) => {
    const { mcpServeLearnCommand } =
      await import("./commands/mcp-serve-learn.js");
    await mcpServeLearnCommand(docsDir);
  });

program
  .command("permission")
  .description("Manage host permission and approval settings for Coding Friend")
  .option("--all", "Apply all recommended permissions without prompts")
  .option("--user", "Save to user-level settings (~/.claude/settings.json)")
  .option(
    "--project",
    "Save to project-level settings (.claude/settings.local.json)",
  )
  .option(
    "--agent <agent>",
    "Operate on host agent: claude, codex, omp, agy, or devin",
  )
  .option("--codex", "Alias for --agent codex")
  .option("--omp", "Alias for --agent omp")
  .option("--agy", "Shortcut for --agent agy (beta)")
  .option("--devin", "Shortcut for --agent devin (beta)")
  .option(
    "--enable-auto-approve",
    "For Codex, enable deterministic Coding Friend auto-approve",
  )
  .option(
    "--disable-auto-approve",
    "For Codex, disable deterministic Coding Friend auto-approve",
  )
  .action(async (opts) => {
    const { permissionCommand } = await import("./commands/permission.js");
    await permissionCommand(opts);
  });

program
  .command("statusline")
  .description("Setup coding-friend statusline in Claude Code")
  .action(async () => {
    const { statuslineCommand } = await import("./commands/statusline.js");
    await statuslineCommand();
  });

program
  .command("update")
  .description("Update coding-friend plugin, CLI, and statusline")
  .option("--cli", "Update only the CLI (npm package)")
  .option("--plugin", "Update only the host plugin")
  .option("--statusline", "Update only the statusline")
  .option("--user", "Update plugin at user scope (all projects)")
  .option("--global", "Update plugin at user scope (all projects)")
  .option("--project", "Update plugin at project scope")
  .option("--local", "Update plugin at local scope")
  .option(
    "--agent <agent>",
    "Operate on host agent: claude, codex, omp, agy, or devin",
  )
  .option("--codex", "Alias for --agent codex")
  .option("--omp", "Alias for --agent omp")
  .option("--agy", "Shortcut for --agent agy (beta)")
  .option("--devin", "Shortcut for --agent devin (beta)")
  .option("--check", "Only report installed vs latest versions (read-only)")
  .option("--json", "Output a JSON envelope (requires --check)")
  .action(async (opts) => {
    const { updateCommand } = await import("./commands/update.js");
    await updateCommand(opts);
  });

program
  .command("status")
  .description("Show comprehensive Coding Friend status")
  .option("--json", "Output a JSON envelope")
  .action(async (opts) => {
    const { statusCommand } = await import("./commands/status.js");
    await statusCommand(opts);
  });

program
  .command("version")
  .description("Show CLI and per-host plugin versions")
  .option("--json", "Output a JSON envelope")
  .action(async (opts) => {
    const { versionCommand } = await import("./commands/version.js");
    await versionCommand(pkg.version, opts);
  });

const project = program
  .command("project")
  .description("Manage the registry of known projects");

project
  .command("list")
  .description("List registered projects")
  .option("--json", "Output a JSON envelope")
  .action(async (opts) => {
    const { projectListCommand } = await import("./commands/project.js");
    await projectListCommand(opts);
  });

project
  .command("add [path]")
  .description("Register a project (default: current directory's repo root)")
  .option("--json", "Output a JSON envelope")
  .action(async (path: string | undefined, opts) => {
    const { projectAddCommand } = await import("./commands/project.js");
    await projectAddCommand(path, opts);
  });

project
  .command("remove <path>")
  .description("Remove a project from the registry")
  .option("--json", "Output a JSON envelope")
  .action(async (path: string, opts) => {
    const { projectRemoveCommand } = await import("./commands/project.js");
    await projectRemoveCommand(path, opts);
  });

program
  .command("ask <question>")
  .description("Ask the user a question from a task and wait for the answer")
  .option("--task <id>", "Task id (default: $CF_TASK_ID)")
  .option("--timeout <seconds>", "Seconds to wait for an answer (default: 100)")
  .option("--json", "Output a JSON envelope")
  .action(async (question: string, opts) => {
    const { askCommand } = await import("./commands/ask.js");
    await askCommand(question, opts);
  });

program
  .command("reply <qid> <answer>")
  .description("Answer a question asked by a task")
  .option("--task <id>", "Task that asked the question")
  .option("--json", "Output a JSON envelope")
  .action(async (qid: string, answer: string, opts) => {
    const { replyCommand } = await import("./commands/reply.js");
    await replyCommand(qid, answer, opts);
  });

program
  .command("done")
  .description("Mark a task finished with an outcome and summary")
  .option("--task <id>", "Task id (default: $CF_TASK_ID)")
  .option("--outcome <outcome>", "succeeded or failed")
  .option("--summary <text>", "Short summary of the result")
  .option("--handoff <path>", "Path to a handoff file")
  .option("--json", "Output a JSON envelope")
  .action(async (opts) => {
    const { doneCommand } = await import("./commands/done.js");
    await doneCommand(opts);
  });

const taskCmd = program
  .command("task")
  .description("Run and manage sandboxed worker tasks (Claude, Codex)");

taskCmd
  .command("run <prompt>")
  .description("Start a detached worker task in the current checkout")
  .option("--provider <name>", "Worker CLI: claude or codex")
  .option("--read-only", "Worker may not edit the checkout (no writer lease)")
  .option(
    "--no-fallback",
    "On a quota limit, wait for the reset instead of switching provider",
  )
  .option("--json", "Output a JSON envelope")
  .action(async (prompt: string, opts) => {
    const { taskRunCommand } = await import("./commands/task.js");
    await taskRunCommand(prompt, opts);
  });

taskCmd
  .command("_run <id>", { hidden: true })
  .description("Internal: per-task runner")
  .action(async (id: string) => {
    const { taskRunnerCommand } = await import("./commands/task.js");
    await taskRunnerCommand(id);
  });

taskCmd
  .command("list")
  .description("List tasks, newest first")
  .option("--json", "Output a JSON envelope")
  .action(async (opts) => {
    const { taskListCommand } = await import("./commands/task.js");
    await taskListCommand(opts);
  });

taskCmd
  .command("show <id>")
  .description("Show a task's state, questions and result")
  .option("--json", "Output a JSON envelope")
  .action(async (id: string, opts) => {
    const { taskShowCommand } = await import("./commands/task.js");
    await taskShowCommand(id, opts);
  });

taskCmd
  .command("cancel <id>")
  .description("Cancel a running or paused task")
  .option("--json", "Output a JSON envelope")
  .action(async (id: string, opts) => {
    const { taskCancelCommand } = await import("./commands/task.js");
    await taskCancelCommand(id, opts);
  });

const supervisorCmd = program
  .command("supervisor")
  .description("Resume paused tasks in the background (launchd on macOS)");

supervisorCmd
  .command("install")
  .description(
    "Install the launchd agent that runs `supervisor tick` every minute",
  )
  .option(
    "--label <label>",
    "launchd label (default: com.coding-friend.supervisor)",
  )
  .option("--json", "Output a JSON envelope")
  .action(async (opts) => {
    const { supervisorInstallCommand } =
      await import("./commands/supervisor.js");
    await supervisorInstallCommand(opts);
  });

supervisorCmd
  .command("uninstall")
  .description("Unload the launchd agent and remove its plist")
  .option(
    "--label <label>",
    "launchd label (default: com.coding-friend.supervisor)",
  )
  .option("--json", "Output a JSON envelope")
  .action(async (opts) => {
    const { supervisorUninstallCommand } =
      await import("./commands/supervisor.js");
    await supervisorUninstallCommand(opts);
  });

supervisorCmd
  .command("status")
  .description("Show the agent, the last tick and paused tasks")
  .option(
    "--label <label>",
    "launchd label (default: com.coding-friend.supervisor)",
  )
  .option("--json", "Output a JSON envelope")
  .action(async (opts) => {
    const { supervisorStatusCommand } =
      await import("./commands/supervisor.js");
    await supervisorStatusCommand(opts);
  });

supervisorCmd
  .command("tick")
  .description("Adopt paused tasks whose runner is gone (run by launchd/cron)")
  .option("--json", "Output a JSON envelope")
  .action(async (opts) => {
    const { supervisorTickCommand } = await import("./commands/supervisor.js");
    await supervisorTickCommand(opts);
  });

program
  .command("clean")
  .description("Clean files generated by Coding Friend in docs/")
  .action(async () => {
    const { cleanCommand } = await import("./commands/clean.js");
    await cleanCommand();
  });

const session = program
  .command("session")
  .description("[beta] Save and load Claude Code sessions across machines");

program.addHelpText(
  "after",
  `
Session subcommands (beta):
  session save        Save current session to sync folder (use /cf-session inside a conversation)
  session load        Load a saved session from sync folder and print resume command`,
);

session
  .command("save")
  .description("Save current Claude Code session to sync folder")
  .option(
    "-s, --session-id <id>",
    "session UUID to save (default: auto-detect newest)",
  )
  .option("-l, --label <label>", "label for this session")
  .action(async (opts) => {
    const { sessionSaveCommand } = await import("./commands/session.js");
    await sessionSaveCommand(opts);
  });

session
  .command("load")
  .description("Load a saved session from sync folder")
  .action(async () => {
    const { sessionLoadCommand } = await import("./commands/session.js");
    await sessionLoadCommand();
  });

const memory = program
  .command("memory")
  .description("AI memory system — store and search project knowledge");

program.addHelpText(
  "after",
  `
Memory subcommands:
  memory status       Show memory system status (tier, doc count, daemon)
  memory search       Search memories by query
  memory list         List memories in current project (--projects for all DBs)
  memory rm           Remove a project database (--project-id <id>, --all, or --prune)
  memory init         Initialize memory system (interactive wizard)
  memory config       Configure memory system settings
  memory start-daemon  Start the memory daemon (Tier 2)
  memory stop-daemon   Stop the memory daemon
  memory rebuild      Rebuild the daemon search index
  memory mcp          Show MCP server setup instructions`,
);

memory
  .command("status")
  .description("Show memory system status")
  .option("--json", "Output a JSON envelope")
  .action(async (opts: { json?: boolean }) => {
    const { memoryStatusCommand } = await import("./commands/memory.js");
    await memoryStatusCommand(opts);
  });

memory
  .command("search")
  .description("Search memories by query")
  .argument("<query>", "search query")
  .option("--json", "Output a JSON envelope")
  .action(async (query: string, opts: { json?: boolean }) => {
    const { memorySearchCommand } = await import("./commands/memory.js");
    await memorySearchCommand(query, opts);
  });

memory
  .command("list")
  .description(
    "List memories in current project, or all projects with --projects",
  )
  .option("--projects", "List all project databases with size and metadata")
  .option("--json", "Output a JSON envelope")
  .action(async (opts: { projects?: boolean; json?: boolean }) => {
    const { memoryListCommand } = await import("./commands/memory.js");
    await memoryListCommand(opts);
  });

memory
  .command("init")
  .description(
    "Initialize memory system — interactive wizard (first time) or config menu",
  )
  .action(async () => {
    const { memoryInitCommand } = await import("./commands/memory.js");
    await memoryInitCommand();
  });

memory
  .command("config")
  .description("Configure memory system settings")
  .action(async () => {
    const { memoryConfigCommand } = await import("./commands/memory.js");
    await memoryConfigCommand();
  });

memory
  .command("start-daemon")
  .description("Start the memory daemon (Tier 2 — MiniSearch)")
  .action(async () => {
    const { memoryStartDaemonCommand } = await import("./commands/memory.js");
    await memoryStartDaemonCommand();
  });

memory
  .command("stop-daemon")
  .description("Stop the memory daemon")
  .action(async () => {
    const { memoryStopDaemonCommand } = await import("./commands/memory.js");
    await memoryStopDaemonCommand();
  });

memory
  .command("rebuild")
  .description("Rebuild the daemon search index")
  .action(async () => {
    const { memoryRebuildCommand } = await import("./commands/memory.js");
    await memoryRebuildCommand();
  });

memory
  .command("mcp")
  .description("Show MCP server setup instructions")
  .action(async () => {
    const { memoryMcpCommand } = await import("./commands/memory.js");
    await memoryMcpCommand();
  });

memory
  .command("rm")
  .description("Remove a project database")
  .option("--project-id <id>", "Project ID to remove")
  .option("--all", "Remove all project databases")
  .option(
    "--prune",
    "Remove orphaned projects (source dir missing or 0 memories)",
  )
  .action(
    async (opts: { projectId?: string; all?: boolean; prune?: boolean }) => {
      const { memoryRmCommand } = await import("./commands/memory.js");
      await memoryRmCommand(opts);
    },
  );

const guide = program
  .command("guide")
  .description("Manage custom skill guides");

guide
  .command("create")
  .description("Create a custom guide for a skill")
  .argument("<skill-name>", "skill to create guide for (e.g. cf-commit)")
  .action(async (skillName: string) => {
    const { guideCreateCommand } = await import("./commands/guide.js");
    guideCreateCommand(skillName);
  });

guide
  .command("list")
  .description("List existing custom guides")
  .action(async () => {
    const { guideListCommand } = await import("./commands/guide.js");
    guideListCommand();
  });

const dev = program.command("dev").description("Development mode commands");

program.addHelpText(
  "after",
  `
Dev subcommands:
  dev on [path]       Switch to local plugin source
  dev off             Switch back to remote marketplace
  dev status          Show current dev mode
  dev sync            Copy local source to plugin cache
  dev restart [path]  Reinstall local dev plugin (off + on)
  dev update [path]   Update local dev plugin to latest version`,
);

dev
  .command("on")
  .description("Switch to local plugin source")
  .argument("[path]", "path to local coding-friend repo (default: cwd)")
  .action(async (path) => {
    const { devOnCommand } = await import("./commands/dev.js");
    await devOnCommand(path);
  });

dev
  .command("off")
  .description("Switch back to remote marketplace")
  .action(async () => {
    const { devOffCommand } = await import("./commands/dev.js");
    await devOffCommand();
  });

dev
  .command("status")
  .description("Show current dev mode")
  .action(async () => {
    const { devStatusCommand } = await import("./commands/dev.js");
    await devStatusCommand();
  });

dev
  .command("sync")
  .description(
    "Copy local source files to plugin cache (no version bump needed)",
  )
  .action(async () => {
    const { devSyncCommand } = await import("./commands/dev.js");
    await devSyncCommand();
  });

dev
  .command("restart")
  .description("Reinstall local dev plugin (off + on)")
  .argument(
    "[path]",
    "path to local coding-friend repo (default: saved path or cwd)",
  )
  .action(async (path?: string) => {
    const { devRestartCommand } = await import("./commands/dev.js");
    await devRestartCommand(path);
  });

dev
  .command("update")
  .description(
    "Refresh local dev plugin via uninstall + reinstall (fast, no remote round-trip)",
  )
  .argument(
    "[path]",
    "path to local coding-friend repo (default: saved path or cwd)",
  )
  .action(async (path?: string) => {
    const { devUpdateCommand } = await import("./commands/dev.js");
    await devUpdateCommand(path);
  });

// Post-command: check for CLI updates (cached, 24h TTL)
// Skips for 'update' command (handles its own), worker commands (stdout is
// captured by the worker's shell), the hidden task runner, the supervisor
// tick (run by launchd), --json runs, and
// version/help flags
program.hook("postAction", async (_this, actionCommand) => {
  if (shouldSkipPostAction(actionCommand)) return;
  const topCmd = process.argv[2];
  if (["update", "ask", "reply", "done"].includes(topCmd)) return;
  if (topCmd === "task" && process.argv[3] === "_run") return;
  if (topCmd === "supervisor" && process.argv[3] === "tick") return;

  const { checkAndNotifyCliUpdate } = await import("./lib/update-check.js");
  checkAndNotifyCliUpdate(pkg.version);
});

try {
  await program.parseAsync();
} catch (err) {
  if (!jsonMode || !(err instanceof CommanderError)) throw err;
  const envelope = toUsageEnvelope(err);
  if (envelope) {
    process.stdout.write(JSON.stringify(envelope) + "\n");
    process.exitCode = 1;
  } else {
    process.exitCode = err.exitCode;
  }
}
