import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync } from "child_process";

let testDir: string;
let counter = 0;

const scriptPath = join(
  import.meta.dirname,
  "../../scripts/migrate-frontmatter.ts",
);

beforeEach(() => {
  testDir = join(tmpdir(), `cf-memory-migration-${Date.now()}-${++counter}`);
  mkdirSync(join(testDir, "features"), { recursive: true });
  mkdirSync(join(testDir, "conventions"), { recursive: true });
  mkdirSync(join(testDir, "decisions"), { recursive: true });
  mkdirSync(join(testDir, "bugs"), { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function runMigration(): string {
  return execFileSync("npx", ["tsx", scriptPath, testDir], {
    encoding: "utf-8",
    timeout: 15000,
  });
}

describe("migrate-frontmatter script", () => {
  it("adds type, importance, source fields to a features file", () => {
    writeFileSync(
      join(testDir, "features", "test.md"),
      `---
title: "Test Feature"
description: "A test feature"
tags: [test, feature]
created: 2026-01-01
updated: 2026-03-05
---

# Test Feature
Content here.
`,
    );

    const output = runMigration();
    expect(output).toContain("Updated: features/test.md");

    const content = readFileSync(join(testDir, "features", "test.md"), "utf-8");
    expect(content).toContain("type: fact");
    expect(content).toContain("importance: 3");
    expect(content).toContain("source: conversation");
  });

  it("maps conventions to preference type", () => {
    writeFileSync(
      join(testDir, "conventions", "naming.md"),
      `---
title: "Naming Convention"
description: "How we name things"
tags: [naming]
created: 2026-01-01
updated: 2026-01-01
---

# Naming
`,
    );

    runMigration();

    const content = readFileSync(
      join(testDir, "conventions", "naming.md"),
      "utf-8",
    );
    expect(content).toContain("type: preference");
  });

  it("maps decisions to context type", () => {
    writeFileSync(
      join(testDir, "decisions", "arch.md"),
      `---
title: "Architecture Decision"
description: "Why we chose X"
tags: [architecture]
created: 2026-01-01
updated: 2026-01-01
---

# Decision
`,
    );

    runMigration();

    const content = readFileSync(
      join(testDir, "decisions", "arch.md"),
      "utf-8",
    );
    expect(content).toContain("type: context");
  });

  it("maps bugs to episode type", () => {
    writeFileSync(
      join(testDir, "bugs", "crash.md"),
      `---
title: "App Crash"
description: "Fix for the crash bug"
tags: [bug]
created: 2026-01-01
updated: 2026-01-01
---

# Bug
`,
    );

    runMigration();

    const content = readFileSync(join(testDir, "bugs", "crash.md"), "utf-8");
    expect(content).toContain("type: episode");
  });

  it("preserves existing content unchanged", () => {
    const originalContent = "# Test\n\nSome **bold** content with `code`.";
    writeFileSync(
      join(testDir, "features", "preserve.md"),
      `---
title: "Preserve Test"
description: "Should preserve content"
tags: [test]
created: 2026-01-01
updated: 2026-01-01
---

${originalContent}
`,
    );

    runMigration();

    const content = readFileSync(
      join(testDir, "features", "preserve.md"),
      "utf-8",
    );
    expect(content).toContain(originalContent);
  });

  it("is idempotent — running twice produces same result", () => {
    writeFileSync(
      join(testDir, "features", "idempotent.md"),
      `---
title: "Idempotent Test"
description: "Should be idempotent"
tags: [test]
created: 2026-01-01
updated: 2026-01-01
---

# Test
`,
    );

    runMigration();
    const afterFirst = readFileSync(
      join(testDir, "features", "idempotent.md"),
      "utf-8",
    );

    const output2 = runMigration();
    const afterSecond = readFileSync(
      join(testDir, "features", "idempotent.md"),
      "utf-8",
    );

    expect(afterSecond).toBe(afterFirst);
    expect(output2).toContain("Skipped: features/idempotent.md");
  });

  it("preserves date format (no ISO conversion)", () => {
    writeFileSync(
      join(testDir, "features", "dates.md"),
      `---
title: "Date Test"
description: "Should preserve dates"
tags: [test]
created: 2026-01-01
updated: 2026-03-05
---

# Test
`,
    );

    runMigration();

    const content = readFileSync(
      join(testDir, "features", "dates.md"),
      "utf-8",
    );
    expect(content).toContain("created: 2026-01-01");
    expect(content).toContain("updated: 2026-03-05");
    expect(content).not.toContain("T00:00:00");
  });

  it("skips files that already have all fields", () => {
    writeFileSync(
      join(testDir, "features", "complete.md"),
      `---
title: "Complete"
description: "Already complete"
type: fact
tags: [test]
importance: 4
created: 2026-01-01
updated: 2026-01-01
source: manual
---

# Complete
`,
    );

    const output = runMigration();
    expect(output).toContain("Skipped: features/complete.md");
  });

  it("handles root-level markdown files", () => {
    writeFileSync(
      join(testDir, "root-doc.md"),
      `---
title: "Root Doc"
description: "A root level doc"
tags: [root]
created: 2026-01-01
updated: 2026-01-01
---

# Root
`,
    );

    runMigration();

    const content = readFileSync(join(testDir, "root-doc.md"), "utf-8");
    expect(content).toContain("type: fact");
    expect(content).toContain("importance: 3");
    expect(content).toContain("source: conversation");
  });
});
