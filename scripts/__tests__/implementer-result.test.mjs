import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const SOURCE = "plugin/lib/protocols/implementer-result.md";
const CODEX = "plugin-codex/lib/protocols/implementer-result.md";
const AGY = "plugin-antigravity/lib/protocols/implementer-result.md";

test("implementer-result protocol exists in source and both host artifacts", async () => {
  const source = await fs.readFile(path.join(repoRoot, SOURCE), "utf8");
  assert.match(source, /CF-RESULT/);
  assert.match(source, /empty-output/);
  assert.match(source, /previous_failure/);
  assert.match(source, /Cleanup:.*success/s);

  for (const relativePath of [SOURCE, CODEX, AGY]) {
    const text = await fs.readFile(path.join(repoRoot, relativePath), "utf8");
    assert.match(
      text,
      /previous_failure/,
      `${relativePath} should contain previous_failure`,
    );
  }
});
