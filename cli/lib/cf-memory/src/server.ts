import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoryBackend } from "./lib/backend.js";
import { registerStore } from "./tools/store.js";
import { registerSearch } from "./tools/search.js";
import { registerRetrieve } from "./tools/retrieve.js";
import { registerList } from "./tools/list.js";
import { registerUpdate } from "./tools/update.js";
import { registerDelete } from "./tools/delete.js";

export interface ToolRegistrationContext {
  docsDir: string;
  dbPath?: string | null;
}

export function registerAllTools(
  server: McpServer,
  backend: MemoryBackend,
  ctx?: ToolRegistrationContext,
): void {
  registerStore(server, backend, ctx);
  registerSearch(server, backend);
  registerRetrieve(server, backend);
  registerList(server, backend);
  registerUpdate(server, backend, ctx);
  registerDelete(server, backend);
}
