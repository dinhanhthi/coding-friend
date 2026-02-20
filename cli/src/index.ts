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
  .version(pkg.version);

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

program.parse();
