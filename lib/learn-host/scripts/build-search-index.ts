import fs from "node:fs";
import path from "node:path";
import { buildSearchIndex } from "../src/lib/search";

const index = buildSearchIndex();
const outPath = path.join(process.cwd(), "src/app/search/search-index.json");

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(index, null, 2));

console.log(`Search index built: ${index.length} entries -> ${outPath}`);
