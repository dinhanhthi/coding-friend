import { spawn } from "child_process";
import { existsSync, statSync } from "fs";
import { join } from "path";
import { getLibPath } from "../lib/lib-path.js";
import { runWithStderr } from "../lib/exec.js";
import { log } from "../lib/log.js";

function ensureLearnBuilt(mcpDir: string): void {
  if (!existsSync(join(mcpDir, "node_modules"))) {
    log.step("Installing learn server dependencies (one-time setup)...");
    const result = runWithStderr("npm", ["install"], { cwd: mcpDir });
    if (result.exitCode !== 0) {
      log.error("Failed to install dependencies");
      if (result.stderr) log.error(result.stderr);
      process.exit(1);
    }
    log.success("Done.");
  }

  if (!existsSync(join(mcpDir, "dist"))) {
    log.step("Building learn server...");
    const result = runWithStderr("npm", ["run", "build"], { cwd: mcpDir });
    if (result.exitCode !== 0) {
      log.error("Failed to build learn server");
      if (result.stderr) log.error(result.stderr);
      process.exit(1);
    }
    log.success("Done.");
  }
}

/**
 * Start the learn-mcp MCP server as a long-lived stdio process.
 * Invoked by `cf mcp-serve-learn <docsDir>` — referenced in MCP client configs
 * via `npx -y coding-friend-cli mcp-serve-learn <docsDir>`. Bootstraps
 * learn-mcp dependencies on first run if not already installed.
 */
export async function mcpServeLearnCommand(docsDir: string): Promise<void> {
  if (!existsSync(docsDir) || !statSync(docsDir).isDirectory()) {
    log.error(`Docs directory not found: ${docsDir}`);
    process.exit(1);
    return;
  }

  const mcpDir = getLibPath("learn-mcp");
  ensureLearnBuilt(mcpDir);

  const serverPath = join(mcpDir, "dist", "index.js");

  const child = spawn("node", [serverPath, docsDir], {
    stdio: "inherit",
  });

  child.on("error", (err) => {
    log.error(`Failed to start learn MCP server: ${err.message}`);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}
