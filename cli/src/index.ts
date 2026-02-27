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
  .description("coding-friend CLI — host learning docs, setup MCP, init projects")
  .version(pkg.version, "-v, --version");

program
  .command("init")
  .description("Initialize coding-friend in current project")
  .action(async () => {
    const { initCommand } = await import("./commands/init.js");
    await initCommand();
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
  .action(async (opts) => {
    const { updateCommand } = await import("./commands/update.js");
    await updateCommand(opts);
  });

const dev = program
  .command("dev")
  .description("Switch between local and remote plugin for development");

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
  .description("Copy local source files to plugin cache (no version bump needed)")
  .action(async () => {
    const { devSyncCommand } = await import("./commands/dev.js");
    await devSyncCommand();
  });

dev
  .command("restart")
  .description("Reinstall local dev plugin (off + on)")
  .argument("[path]", "path to local coding-friend repo (default: saved path or cwd)")
  .action(async (path?: string) => {
    const { devRestartCommand } = await import("./commands/dev.js");
    await devRestartCommand(path);
  });

program.parse();
