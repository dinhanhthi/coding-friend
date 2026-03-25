import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./server.js";

const rawDir = process.argv[2] ?? process.env.LEARN_DOCS_DIR ?? "./docs/learn";
const docsDir = path.resolve(rawDir);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cliPkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../package.json"), "utf-8"),
);

const server = new McpServer({
  name: "coding-friend-learn",
  version: cliPkg.version,
});

registerAllTools(server, docsDir);

const transport = new StdioServerTransport();
await server.connect(transport);
