import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

// Real fs, with spies: lstat reports one file as dataless, and every open or
// read is recorded so the test can prove placeholders are never opened.
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    lstatSync: vi.fn(actual.lstatSync),
    openSync: vi.fn(actual.openSync),
    readFileSync: vi.fn(actual.readFileSync),
  };
});

import { resolveNotePath } from "../note-io.js";
import { listNotes, resolveLearnNote } from "../learn-notes.js";

const savedPlatform = process.platform;
let home: string;
let outputDir: string;
let dataless: string;
let icloud: string;

function note(rel: string, title: string): void {
  writeFileSync(
    join(outputDir, rel),
    `---\ntitle: ${title}\ntags: [a]\ncreated: 2026-01-01\n---\n\nbody\n`,
  );
}

function opened(path: string): boolean {
  return [vi.mocked(openSync), vi.mocked(readFileSync)].some((fn) =>
    fn.mock.calls.some(([p]) => String(p) === path),
  );
}

beforeEach(async () => {
  home = realpathSync(mkdtempSync(join(tmpdir(), "cf-learn-notes-")));
  // os.homedir() reads HOME; stubEnv keeps the real process.env object.
  vi.stubEnv("HOME", home);
  Object.defineProperty(process, "platform", { value: "darwin" });
  outputDir = join(
    home,
    "Library",
    "Mobile Documents",
    "com~apple~CloudDocs",
    "coding-friend-learn",
  );
  mkdirSync(join(outputDir, "concepts"), { recursive: true });
  note("concepts/foo.md", "Foo");
  note("concepts/foo (1).md", "Foo copy");
  writeFileSync(join(outputDir, "concepts", "README.md"), "# index\n");
  icloud = join(outputDir, "concepts", ".cloud.md.icloud");
  writeFileSync(icloud, "bplist");
  dataless = join(outputDir, "concepts", "evicted.md");
  writeFileSync(dataless, "---\ntitle: Evicted\n---\n");

  const actual = await vi.importActual<typeof import("fs")>("fs");
  vi.mocked(lstatSync).mockImplementation(((p: string) => {
    const st = actual.lstatSync(p);
    if (String(p) !== dataless) return st;
    return Object.assign(Object.create(Object.getPrototypeOf(st)), st, {
      size: 4096,
      blocks: 0,
    });
  }) as typeof lstatSync);
  vi.mocked(openSync).mockClear();
  vi.mocked(readFileSync).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  Object.defineProperty(process, "platform", { value: savedPlatform });
  rmSync(home, { recursive: true, force: true });
});

describe("learn notes", () => {
  it("lists cloud placeholders without opening them and refuses show/edit on them", () => {
    const { notes, placeholders } = listNotes(outputDir);
    expect(placeholders).toEqual([
      { id: "concepts/cloud", file: icloud },
      { id: "concepts/evicted", file: dataless },
    ]);
    expect(notes.map((n) => n.id)).not.toContain("concepts/evicted");
    expect(opened(icloud) || opened(dataless)).toBe(false);

    for (const id of ["concepts/cloud", "concepts/evicted"]) {
      expect(() => resolveLearnNote(outputDir, id)).toThrow(/not downloaded/);
    }
    expect(opened(icloud) || opened(dataless)).toBe(false);
  });

  it("skips category README.md and flags a showable conflict copy", () => {
    const { notes } = listNotes(outputDir);
    expect(notes.map((n) => n.id).sort()).toEqual([
      "concepts/foo",
      "concepts/foo (1)",
    ]);
    const copy = notes.find((n) => n.slug === "foo (1)");
    expect(copy?.possibleConflictOf).toBe("concepts/foo");
    expect(copy?.title).toBe("Foo copy");
    expect(notes.find((n) => n.slug === "foo")?.possibleConflictOf).toBe(
      undefined,
    );
    expect(() => resolveNotePath(outputDir, "concepts/foo (1)")).not.toThrow();
    expect(resolveLearnNote(outputDir, "concepts/foo (1)")).toBe(
      realpathSync(join(outputDir, "concepts", "foo (1).md")),
    );
  });
});
