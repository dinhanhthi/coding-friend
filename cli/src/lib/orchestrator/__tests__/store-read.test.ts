import { describe, it, expect, vi, afterEach } from "vitest";
import type { Stats } from "fs";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// fstatSync passes through unless a test overrides it: lets a test simulate
// a writer that grows the file between fstat and the read.
const fstat = vi.hoisted(() => ({
  override: undefined as ((fd: number) => Stats | undefined) | undefined,
}));
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    fstatSync: (fd: number, ...rest: unknown[]) =>
      fstat.override?.(fd) ??
      (actual.fstatSync as (...a: unknown[]) => Stats)(fd, ...rest),
  };
});

import { readRegularFile } from "../store.js";

afterEach(() => {
  fstat.override = undefined;
});

describe("readRegularFile", () => {
  it("never reads past the cap when the file grows after fstat", () => {
    const dir = mkdtempSync(join(tmpdir(), "cf-store-read-"));
    try {
      const file = join(dir, "grown.json");
      writeFileSync(file, "0123456789");
      // fstat saw the file at 4 bytes (== cap); it is 10 bytes at read time.
      fstat.override = () => ({ size: 4, isFile: () => true }) as Stats;
      expect(readRegularFile(file, 4)).toBeUndefined();
      fstat.override = undefined;
      expect(readRegularFile(file, 10)?.toString()).toBe("0123456789");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
