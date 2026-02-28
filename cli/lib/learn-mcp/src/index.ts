import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./server.js";

const rawDir = process.argv[2] ?? process.env.LEARN_DOCS_DIR ?? "./docs/learn";
const docsDir = path.resolve(rawDir);

const server = new McpServer({
  name: "coding-friend-learn",
  version: "0.0.1",
});

registerAllTools(server, docsDir);

const transport = new StdioServerTransport();
await server.connect(transport);
