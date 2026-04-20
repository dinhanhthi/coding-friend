import { spawn } from "child_process";
import { join } from "path";
import { getLibPath } from "../lib/lib-path.js";
import { log } from "../lib/log.js";

/**
 * Start the cf-memory MCP server as a long-lived stdio process.
 * This is invoked by `cf mcp-serve <memoryDir>` and is referenced in .mcp.json
 * via `npx -y coding-friend-cli mcp-serve <memoryDir>`.
 */
export async function mcpServeCommand(memoryDir: string): Promise<void> {
  const mcpDir = getLibPath("cf-memory");
  const serverPath = join(mcpDir, "dist", "index.js");

  const child = spawn("node", [serverPath, memoryDir], {
    stdio: "inherit",
  });

  child.on("error", (err) => {
    log.error(`Failed to start memory MCP server: ${err.message}`);
    process.exit(1);
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}
