import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

const dirs = vi.hoisted(() => ({ global: "", local: "" }));

vi.mock("../paths.js", async (orig) => ({
  ...(await orig<typeof import("../paths.js")>()),
  globalConfigPath: () => dirs.global,
  localConfigPath: () => dirs.local,
}));

import { getConfigView, setConfigValue } from "../config-ops.js";
import { CliError } from "../output.js";

let root: string;

function write(path: string, data: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function read(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    if (err instanceof CliError) return err.code;
    throw err;
  }
  return undefined;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cf-config-ops-"));
  dirs.global = join(root, "home", ".coding-friend", "config.json");
  dirs.local = join(root, "proj", ".coding-friend", "config.json");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("getConfigView", () => {
  it("returns global, local, effective and paths without a key", () => {
    write(dirs.global, { language: "vi", custom: 1 });
    write(dirs.local, { tdd: true });
    const view = getConfigView();
    expect(view).toMatchObject({
      global: { language: "vi", custom: 1 },
      local: { tdd: true },
      effective: { language: "vi", tdd: true, docsDir: "docs", custom: 1 },
      paths: { global: dirs.global, local: dirs.local },
    });
  });

  it("resolves the source of a dotted key: local > global > default > null", () => {
    write(dirs.global, { language: "vi", review: { maxRounds: 3 } });
    write(dirs.local, { review: { withCodex: true } });
    expect(getConfigView("review.withCodex")).toEqual({
      key: "review.withCodex",
      value: true,
      source: "local",
    });
    expect(getConfigView("review.maxRounds")).toEqual({
      key: "review.maxRounds",
      value: 3,
      source: "global",
    });
    expect(getConfigView("docsDir")).toEqual({
      key: "docsDir",
      value: "docs",
      source: "default",
    });
    expect(getConfigView("nope.x")).toEqual({
      key: "nope.x",
      value: null,
      source: null,
    });
  });

  it("ignores inherited properties like toString", () => {
    expect(getConfigView("toString")).toEqual({
      key: "toString",
      value: null,
      source: null,
    });
  });

  it("rejects prototype-polluting key segments", () => {
    for (const k of ["__proto__.tdd", "a.prototype", "constructor"]) {
      expect(codeOf(() => getConfigView(k))).toBe("INVALID_ARGS");
    }
  });

  it("reads only the given scope when one is passed", () => {
    write(dirs.global, { language: "vi" });
    write(dirs.local, { language: "fr" });
    expect(getConfigView("language", "global")).toEqual({
      key: "language",
      value: "vi",
      source: "global",
    });
    expect(getConfigView("docsDir", "local")).toEqual({
      key: "docsDir",
      value: null,
      source: null,
    });
  });
});

describe("setConfigValue", () => {
  it("requires a scope", () => {
    expect(codeOf(() => setConfigValue(undefined, "tdd", "true"))).toBe(
      "INVALID_ARGS",
    );
  });

  it("parses JSON values and creates the file and parent objects", () => {
    const res = setConfigValue("local", "review.maxRounds", "4");
    expect(res).toEqual({
      scope: "local",
      path: dirs.local,
      key: "review.maxRounds",
      value: 4,
      warnings: [],
    });
    expect(read(dirs.local)).toEqual({ review: { maxRounds: 4 } });
  });

  it("stores a non-JSON value as a string", () => {
    setConfigValue("global", "docsDir", "my-docs");
    expect(read(dirs.global)).toEqual({ docsDir: "my-docs" });
  });

  it("writes an unknown key with a warning and keeps other unknown keys", () => {
    write(dirs.local, { legacy: { a: 1 }, review: { oldFlag: true } });
    const res = setConfigValue("local", "brandNew", "1");
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain("brandNew");
    expect(read(dirs.local)).toEqual({
      legacy: { a: 1 },
      review: { oldFlag: true },
      brandNew: 1,
    });
  });

  it("rejects __proto__ on set without touching Object.prototype", () => {
    expect(codeOf(() => setConfigValue("local", "__proto__.tdd", "true"))).toBe(
      "INVALID_ARGS",
    );
    expect(({} as Record<string, unknown>).tdd).toBeUndefined();
    expect(existsSync(dirs.local)).toBe(false);
  });

  it("warns on an unknown nested key under a plain sub-schema", () => {
    const res = setConfigValue("local", "memory.typo", "1");
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toContain("memory.typo");
    expect(read(dirs.local)).toEqual({ memory: { typo: 1 } });
    expect(setConfigValue("local", "memory.tier", "lite").warnings).toEqual([]);
  });

  it("deletes the key when the value is null", () => {
    write(dirs.local, { tdd: true, review: { maxRounds: 2, withCodex: true } });
    setConfigValue("local", "review.maxRounds", "null");
    expect(read(dirs.local)).toEqual({
      tdd: true,
      review: { withCodex: true },
    });
  });

  it("rejects an invalid value for a known key and leaves the file untouched", () => {
    write(dirs.local, { tdd: true });
    const before = readFileSync(dirs.local, "utf-8");
    expect(codeOf(() => setConfigValue("local", "review.maxRounds", "0"))).toBe(
      "INVALID_VALUE",
    );
    expect(codeOf(() => setConfigValue("local", "tdd", "yes"))).toBe(
      "INVALID_VALUE",
    );
    expect(readFileSync(dirs.local, "utf-8")).toBe(before);
  });

  it("ignores pre-existing invalid values on other paths", () => {
    write(dirs.local, { tdd: "bad" });
    setConfigValue("local", "planAuto", "true");
    expect(read(dirs.local)).toEqual({ tdd: "bad", planAuto: true });
  });

  it("refuses to overwrite a config file that is not valid JSON", () => {
    mkdirSync(join(dirs.local, ".."), { recursive: true });
    writeFileSync(dirs.local, "{ broken");
    expect(codeOf(() => setConfigValue("local", "tdd", "true"))).toBe(
      "INVALID_VALUE",
    );
    expect(readFileSync(dirs.local, "utf-8")).toBe("{ broken");
    expect(existsSync(dirs.global)).toBe(false);
  });
});
