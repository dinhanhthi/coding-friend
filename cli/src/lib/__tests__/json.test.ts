import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { readJson, writeJson, mergeJson } from "../json.js";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `cf-json-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe("readJson", () => {
  it("reads and parses a valid JSON file", () => {
    const file = join(testDir, "data.json");
    writeFileSync(file, JSON.stringify({ key: "value" }), "utf-8");

    expect(readJson(file)).toEqual({ key: "value" });
  });

  it("returns null when file does not exist", () => {
    expect(readJson(join(testDir, "nonexistent.json"))).toBeNull();
  });

  it("returns null when file contains invalid JSON", () => {
    const file = join(testDir, "bad.json");
    writeFileSync(file, "{ not valid json }", "utf-8");

    expect(readJson(file)).toBeNull();
  });

  it("returns null for an empty file", () => {
    const file = join(testDir, "empty.json");
    writeFileSync(file, "", "utf-8");

    expect(readJson(file)).toBeNull();
  });

  it("preserves the generic type shape", () => {
    const file = join(testDir, "typed.json");
    writeFileSync(file, JSON.stringify({ count: 42, active: true }), "utf-8");

    const result = readJson<{ count: number; active: boolean }>(file);
    expect(result?.count).toBe(42);
    expect(result?.active).toBe(true);
  });
});

describe("writeJson", () => {
  it("writes an object as formatted JSON", () => {
    const file = join(testDir, "out.json");
    writeJson(file, { name: "test", value: 1 });

    const raw = readJson<{ name: string; value: number }>(file);
    expect(raw).toEqual({ name: "test", value: 1 });
  });

  it("creates parent directories that do not exist", () => {
    const file = join(testDir, "nested", "deep", "data.json");
    writeJson(file, { ok: true });

    expect(existsSync(file)).toBe(true);
    expect(readJson(file)).toEqual({ ok: true });
  });

  it("overwrites an existing file", () => {
    const file = join(testDir, "overwrite.json");
    writeJson(file, { version: 1 });
    writeJson(file, { version: 2 });

    expect(readJson<{ version: number }>(file)?.version).toBe(2);
  });

  it("ends the file with a newline", () => {
    const file = join(testDir, "newline.json");
    writeJson(file, { a: 1 });

    const raw = readFileSync(file, "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
  });
});

describe("mergeJson", () => {
  it("merges new keys into an existing file", () => {
    const file = join(testDir, "merge.json");
    writeJson(file, { a: 1, b: 2 });
    mergeJson(file, { c: 3 });

    expect(readJson(file)).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("overwrites existing keys with new values", () => {
    const file = join(testDir, "overwrite-key.json");
    writeJson(file, { a: 1, b: 2 });
    mergeJson(file, { b: 99 });

    expect(readJson<{ a: number; b: number }>(file)?.b).toBe(99);
  });

  it("creates the file if it does not exist", () => {
    const file = join(testDir, "new.json");
    mergeJson(file, { created: true });

    expect(readJson(file)).toEqual({ created: true });
  });

  it("handles merging into an empty file gracefully", () => {
    const file = join(testDir, "corrupt.json");
    writeFileSync(file, "", "utf-8");
    mergeJson(file, { recovered: true });

    expect(readJson(file)).toEqual({ recovered: true });
  });
});
