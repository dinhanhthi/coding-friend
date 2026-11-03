import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { readNote, replaceBody, resolveNotePath } from "../note-io.js";
import { CliError } from "../output.js";

let tmp: string;
let root: string;

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), "cf-note-io-")));
  root = join(tmp, "memory");
  mkdirSync(join(root, "bugs"), { recursive: true });
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

function note(name: string, text: string): string {
  const p = join(root, "bugs", name);
  writeFileSync(p, text);
  return p;
}

describe("replaceBody", () => {
  it("keeps quoted frontmatter bytes and only updates the updated: line", () => {
    const fm =
      '---\ntitle: "T"\ncreated: "2026-01-01"\nupdated: "2026-03-16"\n---\n';
    const p = note("a.md", fm + "old body\n");
    const res = replaceBody(p, "new body\n", readNote(p).sha256);

    expect(res.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(readFileSync(p, "utf8")).toBe(
      fm.replace('updated: "2026-03-16"', `updated: "${res.updated}"`) +
        "new body\n",
    );
    expect(res.sha256).toBe(readNote(p).sha256);
  });

  it("preserves CRLF and a BOM", () => {
    const fm = "﻿---\r\ntitle: T\r\nupdated: 2026-03-16 10:20\r\n---\r\n";
    const p = note("crlf.md", fm + "old\r\n");
    const res = replaceBody(p, "line 1\nline 2\n", readNote(p).sha256);

    expect(readFileSync(p, "utf8")).toBe(
      fm.replace("updated: 2026-03-16 10:20", `updated: ${res.updated}`) +
        "line 1\r\nline 2\r\n",
    );
    expect(readNote(p).frontmatter.updated).toBe(res.updated);
  });

  it("only replaces the body of a file without frontmatter", () => {
    const p = note("plain.md", "# Old\n");
    replaceBody(p, "# New\n", readNote(p).sha256);
    expect(readFileSync(p, "utf8")).toBe("# New\n");
  });

  it("refuses a stale ifMatch with CONFLICT and leaves the file unchanged", () => {
    const p = note("b.md", "---\nupdated: 2026-03-16\n---\nbody\n");
    const before = readFileSync(p);
    expect(codeOf(() => replaceBody(p, "x\n", "0".repeat(64)))).toBe(
      "CONFLICT",
    );
    expect(readFileSync(p).equals(before)).toBe(true);
  });
});

describe("resolveNotePath", () => {
  it("resolves ids with uppercase, underscore, spaces and parentheses", () => {
    mkdirSync(join(root, "Upper_Case"));
    const p = join(root, "Upper_Case", "foo (1).md");
    writeFileSync(p, "# x\n");
    expect(resolveNotePath(root, "Upper_Case/foo (1)")).toBe(p);
  });

  it("refuses ids that escape the root", () => {
    writeFileSync(join(tmp, "secret.md"), "secret\n");
    symlinkSync(join(tmp, "secret.md"), join(root, "bugs", "out.md"));
    expect(codeOf(() => resolveNotePath(root, "../secret"))).toBe(
      "INVALID_ARGS",
    );
    expect(codeOf(() => resolveNotePath(root, "bugs/../../secret"))).toBe(
      "INVALID_ARGS",
    );
    expect(codeOf(() => resolveNotePath(root, "bugs/out"))).toBe(
      "INVALID_VALUE",
    );
  });
});
