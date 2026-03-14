#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
);

const program = new Command();

program
  .name("cf")
  .description(
    "coding-friend CLI — host learning docs, setup MCP, init projects",
  )
  .version(pkg.version, "-v, --version");

program
  .command("install")
  .description("Install the Coding Friend plugin into Claude Code")
  .option("--user", "Install at user scope (all projects)")
  .option("--global", "Install at user scope (all projects)")
  .option("--project", "Install at project scope (shared via git)")
  .option("--local", "Install at local scope (this machine only)")
  .action(async (opts) => {
    const { installCommand } = await import("./commands/install.js");
    await installCommand(opts);
  });

program
  .command("uninstall")
  .description("Uninstall the Coding Friend plugin from Claude Code")
  .option("--user", "Uninstall from user scope (all projects)")
  .option("--global", "Uninstall from user scope (all projects)")
  .option("--project", "Uninstall from project scope")
  .option("--local", "Uninstall from local scope")
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
  .action(async (opts) => {
    const { enableCommand } = await import("./commands/enable.js");
    await enableCommand(opts);
  });

program
  .command("init")
  .description("Initialize coding-friend in current project")
  .action(async () => {
    const { initCommand } = await import("./commands/init.js");
    await initCommand();
  });

program
  .command("config")
  .description("Manage Coding Friend configuration")
  .action(async () => {
    const { configCommand } = await import("./commands/config.js");
    await configCommand();
  });

program
  .command("host")
  .description("Build and serve learning docs as a static website")
  .argument("[path]", "path to docs folder")
  .option("-p, --port <port>", "port number", "3333")
  .action(async (path, opts) => {
    const { hostCommand } = await import("./commands/host.js");
    await hostCommand(path, opts);
  });

program
  .command("mcp")
  .description("Setup MCP server for learning docs")
  .argument("[path]", "path to docs folder")
  .action(async (path) => {
    const { mcpCommand } = await import("./commands/mcp.js");
    await mcpCommand(path);
  });

program
  .command("permission")
  .description("Manage Claude Code permission rules for Coding Friend")
  .option("--all", "Apply all recommended permissions without prompts")
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
  .option("--plugin", "Update only the Claude Code plugin")
  .option("--statusline", "Update only the statusline")
  .option("--user", "Update plugin at user scope (all projects)")
  .option("--global", "Update plugin at user scope (all projects)")
  .option("--project", "Update plugin at project scope")
  .option("--local", "Update plugin at local scope")
  .action(async (opts) => {
    const { updateCommand } = await import("./commands/update.js");
    await updateCommand(opts);
  });

const session = program
  .command("session")
  .description("Save and load Claude Code sessions across machines");

program.addHelpText(
  "after",
  `
Session subcommands:
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
  memory list         List all stored memories
  memory init         Initialize Tier 1 (install SQLite deps, import existing memories)
  memory start        Start the memory daemon (Tier 2)
  memory stop         Stop the memory daemon
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
  .description("List all stored memories")
  .action(async () => {
    const { memoryListCommand } = await import("./commands/memory.js");
    await memoryListCommand();
  });

memory
  .command("init")
  .description(
    "Initialize Tier 1 — install SQLite deps and import existing memories",
  )
  .action(async () => {
    const { memoryInitCommand } = await import("./commands/memory.js");
    await memoryInitCommand();
  });

memory
  .command("start")
  .description("Start the memory daemon (Tier 2 — MiniSearch)")
  .action(async () => {
    const { memoryStartCommand } = await import("./commands/memory.js");
    await memoryStartCommand();
  });

memory
  .command("stop")
  .description("Stop the memory daemon")
  .action(async () => {
    const { memoryStopCommand } = await import("./commands/memory.js");
    await memoryStopCommand();
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
  .description("Update local dev plugin to latest version (off + on)")
  .argument(
    "[path]",
    "path to local coding-friend repo (default: saved path or cwd)",
  )
  .action(async (path?: string) => {
    const { devUpdateCommand } = await import("./commands/dev.js");
    await devUpdateCommand(path);
  });

program.parse();
