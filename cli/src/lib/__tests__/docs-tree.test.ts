import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "crypto";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { listDocs, readDoc, resolveProjectDocsDir } from "../docs-tree.js";
import { CliError } from "../output.js";

let tmp: string;
let docs: string;

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "cf-docs-tree-")));
  docs = join(tmp, "docs");
  mkdirSync(join(docs, "plans"), { recursive: true });
  writeFileSync(join(docs, "plans", "a.md"), "# A\n");
  writeFileSync(join(tmp, "outside.md"), "secret\n");
  symlinkSync(join(tmp, "outside.md"), join(docs, "out.md"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof CliError) return err.code;
    throw err;
  }
  return undefined;
}

describe("docs-tree", () => {
  it("skips a symlink pointing outside docsDir and refuses to read through it", () => {
    const res = listDocs(docs);
    expect(res.exists).toBe(true);
    expect(res.files.map((f) => f.path)).toEqual(["plans/a.md"]);
    expect(codeOf(() => readDoc(docs, "out.md"))).toBe("INVALID_VALUE");
  });

  it("refuses a relpath with ..", () => {
    expect(codeOf(() => readDoc(docs, "../outside.md"))).toBe("INVALID_ARGS");
  });

  it("reads a normal md file with its sha256", () => {
    const doc = readDoc(docs, "plans/a.md");
    expect(doc.content).toBe("# A\n");
    expect(doc.sha256).toBe(createHash("sha256").update("# A\n").digest("hex"));
  });
});

describe("resolveProjectDocsDir", () => {
  const origCwd = process.cwd();
  let project: string;
  let home: string;

  beforeEach(() => {
    project = join(tmp, "project");
    home = join(tmp, "home");
    mkdirSync(join(project, ".coding-friend"), { recursive: true });
    mkdirSync(join(home, ".coding-friend"), { recursive: true });
    vi.stubEnv("HOME", home);
    process.chdir(project);
  });

  afterEach(() => {
    process.chdir(origCwd);
    vi.unstubAllEnvs();
  });

  it("refuses a local docsDir outside the project but allows a global absolute one", () => {
    writeFileSync(
      join(home, ".coding-friend", "config.json"),
      JSON.stringify({ docsDir: docs }),
    );
    expect(resolveProjectDocsDir()).toBe(docs);

    writeFileSync(
      join(project, ".coding-friend", "config.json"),
      JSON.stringify({ docsDir: "../docs" }),
    );
    expect(codeOf(() => resolveProjectDocsDir())).toBe("INVALID_VALUE");
  });
});
