import { describe, it, expect } from "vitest";
import {
  contentHash,
  prepareEmbeddingText,
} from "../backends/sqlite/embeddings.js";

describe("contentHash()", () => {
  it("returns a 16-character hex string", () => {
    const hash = contentHash("hello world");
    expect(hash).toHaveLength(16);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("returns consistent hashes for the same input", () => {
    const h1 = contentHash("test content");
    const h2 = contentHash("test content");
    expect(h1).toBe(h2);
  });

  it("returns different hashes for different inputs", () => {
    const h1 = contentHash("content A");
    const h2 = contentHash("content B");
    expect(h1).not.toBe(h2);
  });
});

describe("prepareEmbeddingText()", () => {
  it("combines title, description, tags, and content", () => {
    const text = prepareEmbeddingText({
      title: "API Auth",
      description: "JWT tokens in httpOnly cookies",
      tags: ["auth", "jwt"],
      content: "The project uses JWT.",
    });

    expect(text).toContain("API Auth");
    expect(text).toContain("JWT tokens");
    expect(text).toContain("auth jwt");
    expect(text).toContain("The project uses JWT.");
  });

  it("handles empty tags", () => {
    const text = prepareEmbeddingText({
      title: "Title",
      description: "Desc",
      tags: [],
      content: "Content",
    });

    expect(text).toContain("Title");
    expect(text).toContain("Desc");
    expect(text).toContain("Content");
  });

  it("truncates long content to ~2000 chars", () => {
    const longContent = "a".repeat(5000);
    const text = prepareEmbeddingText({
      title: "T",
      description: "D",
      tags: [],
      content: longContent,
    });

    // Content portion should be truncated
    expect(text.length).toBeLessThan(2200);
  });

  it("filters empty fields", () => {
    const text = prepareEmbeddingText({
      title: "Title",
      description: "",
      tags: [],
      content: "Content",
    });

    // Should not have double newlines from empty fields
    expect(text).not.toContain("\n\n\n");
  });
});
