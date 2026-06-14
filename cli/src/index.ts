#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { installedPluginsPath } from "./lib/paths.js";

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
  .option("--agent <agent>", "Operate on host agent: claude or codex", "claude")
  .option("--codex", "Alias for --agent codex")
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
  .option("--agent <agent>", "Operate on host agent: claude or codex", "claude")
  .option("--codex", "Alias for --agent codex")
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
  .option("--agent <agent>", "Operate on host agent: claude or codex", "claude")
  .option("--codex", "Alias for --agent codex")
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
  .option("--agent <agent>", "Operate on host agent: claude or codex", "claude")
  .option("--codex", "Alias for --agent codex")
  .action(async (opts) => {
    const { enableCommand } = await import("./commands/enable.js");
    await enableCommand(opts);
  });

program
  .command("init")
  .description("Initialize coding-friend in current project")
  .option("--agent <agent>", "Operate on host agent: claude or codex", "claude")
  .option("--codex", "Alias for --agent codex")
  .option(
    "--trust-project",
    "For Codex, mark the current project trusted in ~/.codex/config.toml",
  )
  .action(async (opts) => {
    const { initCommand } = await import("./commands/init.js");
    await initCommand(opts);
  });

program
  .command("config")
  .description("Manage Coding Friend configuration")
  .action(async () => {
    const { configCommand } = await import("./commands/config.js");
    await configCommand();
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
  .action(async () => {
    const { mcpCommand } = await import("./commands/mcp.js");
    await mcpCommand();
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
  .option("--agent <agent>", "Operate on host agent: claude or codex", "claude")
  .option("--codex", "Alias for --agent codex")
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
  .option("--agent <agent>", "Operate on host agent: claude or codex", "claude")
  .option("--codex", "Alias for --agent codex")
  .action(async (opts) => {
    const { updateCommand } = await import("./commands/update.js");
    await updateCommand(opts);
  });

program
  .command("status")
  .description("Show comprehensive Coding Friend status")
  .action(async () => {
    const { statusCommand } = await import("./commands/status.js");
    await statusCommand();
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
  .action(async () => {
    const { memoryStatusCommand } = await import("./commands/memory.js");
    await memoryStatusCommand();
  });

memory
  .command("search")
  .description("Search memories by query")
  .argument("<query>", "search query")
  .action(async (query: string) => {
    const { memorySearchCommand } = await import("./commands/memory.js");
    await memorySearchCommand(query);
  });

memory
  .command("list")
  .description(
    "List memories in current project, or all projects with --projects",
  )
  .option("--projects", "List all project databases with size and metadata")
  .action(async (opts: { projects?: boolean }) => {
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
// Skips for 'update' command (handles its own) and version/help flags
program.hook("postAction", async () => {
  const topCmd = process.argv[2];
  if (topCmd === "update") return;

  const { checkAndNotifyCliUpdate } = await import("./lib/update-check.js");
  checkAndNotifyCliUpdate(pkg.version);
});

await program.parseAsync();
