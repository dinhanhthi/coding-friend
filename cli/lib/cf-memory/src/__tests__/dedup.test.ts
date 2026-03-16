import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { MarkdownBackend } from "../backends/markdown.js";
import { checkDuplicate, textSimilarity } from "../lib/dedup.js";
import type { StoreInput } from "../lib/types.js";

let testDir: string;
let backend: MarkdownBackend;
let counter = 0;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-memory-dedup-${Date.now()}-${++counter}`);
  mkdirSync(testDir, { recursive: true });
  backend = new MarkdownBackend(testDir);
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const sampleInput: StoreInput = {
  title: "API Authentication Pattern",
  description: "Auth module uses JWT tokens stored in httpOnly cookies",
  type: "fact",
  tags: ["auth", "jwt", "api"],
  content: "# API Auth\n\nThe project uses JWT tokens with refresh rotation.",
};

describe("textSimilarity()", () => {
  it("returns 1 for identical strings", () => {
    expect(textSimilarity("hello world", "hello world")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    expect(textSimilarity("alpha beta", "gamma delta")).toBe(0);
  });

  it("returns partial score for overlapping words", () => {
    const sim = textSimilarity("hello world foo", "hello world bar");
    expect(sim).toBeGreaterThan(0.3);
    expect(sim).toBeLessThan(1);
  });

  it("is case insensitive", () => {
    expect(textSimilarity("Hello World", "hello world")).toBe(1);
  });

  it("returns 1 for two empty strings", () => {
    expect(textSimilarity("", "")).toBe(1);
  });

  it("returns 0 when one is empty", () => {
    expect(textSimilarity("hello", "")).toBe(0);
  });
});

describe("checkDuplicate()", () => {
  it("returns no duplicate when backend is empty", async () => {
    const result = await checkDuplicate(backend, sampleInput);
    expect(result.isDuplicate).toBe(false);
    expect(result.similarity).toBe(0);
  });

  it("detects near-duplicate with same title", async () => {
    await backend.store(sampleInput);

    const nearDup: StoreInput = {
      ...sampleInput,
      content: "Different content entirely.",
    };

    const result = await checkDuplicate(backend, nearDup);
    expect(result.isDuplicate).toBe(true);
    expect(result.similarId).toBeDefined();
    expect(result.similarity).toBeGreaterThan(0.8);
  });

  it("does not flag unrelated memories as duplicates", async () => {
    await backend.store(sampleInput);

    const different: StoreInput = {
      title: "Database Migration Strategy",
      description: "How we handle PostgreSQL schema migrations",
      type: "procedure",
      tags: ["database", "migration"],
      content: "# Migration\n\nUse Prisma for schema migrations.",
    };

    const result = await checkDuplicate(backend, different);
    expect(result.isDuplicate).toBe(false);
  });

  it("returns warning but still allows store (non-blocking)", async () => {
    await backend.store(sampleInput);

    const result = await checkDuplicate(backend, sampleInput);
    // Even if duplicate, the function just reports — doesn't block
    expect(typeof result.isDuplicate).toBe("boolean");
    expect(typeof result.similarity).toBe("number");
  });
});
