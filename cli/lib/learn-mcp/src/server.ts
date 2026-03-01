import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListCategories } from "./tools/list-categories.js";
import { registerListDocs } from "./tools/list-docs.js";
import { registerReadDoc } from "./tools/read-doc.js";
import { registerSearchDocs } from "./tools/search-docs.js";
import { registerCreateDoc } from "./tools/create-doc.js";
import { registerUpdateDoc } from "./tools/update-doc.js";
import { registerImproveDoc } from "./tools/improve-doc.js";
import { registerTrackKnowledge } from "./tools/track-knowledge.js";
import { registerGetReviewList } from "./tools/get-review-list.js";

export function registerAllTools(server: McpServer, docsDir: string): void {
  registerListCategories(server, docsDir);
  registerListDocs(server, docsDir);
  registerReadDoc(server, docsDir);
  registerSearchDocs(server, docsDir);
  registerCreateDoc(server, docsDir);
  registerUpdateDoc(server, docsDir);
  registerImproveDoc(server, docsDir);
  registerTrackKnowledge(server, docsDir);
  registerGetReviewList(server, docsDir);
}
