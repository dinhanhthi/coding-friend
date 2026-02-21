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
  .option("--global", "Install into global config of selected platforms")
  .action(async (opts) => {
    const { initCommand } = await import("./commands/init.js");
    await initCommand(opts);
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

program
  .command("adapt")
  .description("Generate platform-specific files from coding-friend skills/hooks")
  .option("--global", "Regenerate global config files")
  .option("--platform <id>", "Regenerate for a specific platform only")
  .option("--dry-run", "Show what would be generated without writing")
  .action(async (opts) => {
    const { adaptCommand } = await import("./commands/adapt.js");
    await adaptCommand(opts);
  });

program
  .command("remove")
  .description("Remove coding-friend files from platforms")
  .option("--global", "Remove from global config")
  .option("--platform <id>", "Remove from a specific platform only")
  .option("-y, --yes", "Skip confirmation prompt")
  .action(async (opts) => {
    const { removeCommand } = await import("./commands/remove.js");
    await removeCommand(opts);
  });

program.parse();
