import fs from "node:fs";
import matter from "gray-matter";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDoc, readDoc, updateDoc } from "../lib/docs.js";

/**
 * Place a valid .md file outside docsDir so traversal attempts
 * actually find a file — this proves the guard blocks the read,
 * not just "file not found".
 */
function placeTrapFile(dir: string, name: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, name);
  const content = matter.stringify("SECRET CONTENT", {
    title: "Trap",
    category: "trap",
    tags: [],
    created: "2026-01-01",
    updated: "2026-01-01",
  });
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

describe("docs path traversal protection", () => {
  let tmpDir: string;
  let docsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "learn-mcp-test-"));
    docsDir = path.join(tmpDir, "docs");
    fs.mkdirSync(docsDir, { recursive: true });

    // Create a legitimate doc for testing
    createDoc(docsDir, "javascript", "test-doc", ["test"], "Hello world");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("readDoc", () => {
    it("reads legitimate docs normally", () => {
      const doc = readDoc(docsDir, "javascript", "test-doc");
      expect(doc).not.toBeNull();
      expect(doc!.content).toContain("Hello world");
    });

    it("rejects path traversal in category", () => {
      // Place a trap file at tmpDir/secret.md (one level above docsDir)
      placeTrapFile(tmpDir, "secret.md");
      const doc = readDoc(docsDir, "..", "secret");
      expect(doc).toBeNull();
    });

    it("rejects path traversal in slug", () => {
      placeTrapFile(tmpDir, "secret.md");
      const doc = readDoc(docsDir, "javascript", "../../secret");
      expect(doc).toBeNull();
    });

    it("rejects path traversal with nested sequences", () => {
      placeTrapFile(tmpDir, "secret.md");
      const doc = readDoc(docsDir, "javascript/../../..", "secret");
      expect(doc).toBeNull();
    });
  });

  describe("createDoc", () => {
    it("creates legitimate docs normally", () => {
      const filePath = createDoc(
        docsDir,
        "python",
        "New Doc",
        ["tag1"],
        "Content",
      );
      expect(filePath).toContain(docsDir);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it("rejects path traversal in category", () => {
      expect(() =>
        createDoc(docsDir, "../escape", "title", [], "content"),
      ).toThrow();
      // Verify no file was created outside docsDir
      expect(fs.existsSync(path.join(tmpDir, "escape"))).toBe(false);
    });
  });

  describe("updateDoc", () => {
    it("updates legitimate docs normally", () => {
      const result = updateDoc(docsDir, "javascript", "test-doc", {
        title: "Updated",
      });
      expect(result).not.toBeNull();
    });

    it("rejects path traversal in category", () => {
      placeTrapFile(tmpDir, "secret.md");
      const result = updateDoc(docsDir, "..", "secret", {
        title: "hack",
      });
      expect(result).toBeNull();
    });

    it("rejects path traversal in slug", () => {
      placeTrapFile(tmpDir, "secret.md");
      const result = updateDoc(docsDir, "javascript", "../../secret", {
        title: "hack",
      });
      expect(result).toBeNull();
    });
  });
});
