import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const memoryTsSource = fs.readFileSync(
  path.join(__dirname, "..", "memory.ts"),
  "utf-8",
);
const lines = memoryTsSource.split("\n");

describe("memory.ts code injection protection", () => {
  it("uses JSON.stringify for memoryDir in node -e MarkdownBackend constructor", () => {
    // Find lines where memoryDir is passed to MarkdownBackend constructor
    const backendLines = lines.filter(
      (line) => line.includes("MarkdownBackend") && line.includes("memoryDir"),
    );

    expect(backendLines.length).toBeGreaterThan(0);

    for (const line of backendLines) {
      expect(line, `Unsafe memoryDir interpolation: ${line.trim()}`).toContain(
        "JSON.stringify(memoryDir)",
      );
    }
  });

  it("uses JSON.stringify for mcpDir import paths in node -e scripts", () => {
    // Find lines in inline node -e scripts that use `from` with mcpDir
    // (These are string literals inside template backticks, not real dynamic imports)
    // Pattern: `import ... from "${join(mcpDir, ...)}"` or `from ${JSON.stringify(...)}`
    const importLines = lines.filter(
      (line) =>
        line.includes("mcpDir") && line.includes("dist/backends/markdown"),
    );

    expect(importLines.length).toBeGreaterThan(0);

    for (const line of importLines) {
      expect(line, `Unsafe mcpDir interpolation: ${line.trim()}`).toContain(
        "JSON.stringify(",
      );
    }
  });
});
