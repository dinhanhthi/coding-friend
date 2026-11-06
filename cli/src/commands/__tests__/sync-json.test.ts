import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { syncStatusCommand } from "../sync.js";

describe("sync status --json", () => {
  let tmp: string;
  let origCwd: string;
  const files: string[] = [];

  /** A fixture file nobody may read: opening it would throw EACCES. */
  function unreadable(path: string): void {
    writeFileSync(path, "x");
    chmodSync(path, 0o000);
    files.push(path);
  }

  beforeEach(() => {
    process.exitCode = undefined;
    vi.spyOn(console, "error").mockImplementation(() => {});
    origCwd = process.cwd();
    tmp = realpathSync(mkdtempSync(join(tmpdir(), "cf-syncjson-")));
    const home = join(tmp, "home");
    mkdirSync(join(home, ".coding-friend"), { recursive: true });
    vi.stubEnv("HOME", home);
    vi.stubEnv("CLAUDE_CONFIG_DIR", join(tmp, "claude"));
    writeFileSync(
      join(home, ".coding-friend", "config.json"),
      JSON.stringify({
        learn: { outputDir: join(tmp, "learn") },
        session: { dir: join(tmp, "sessions") },
      }),
    );
    // A local config must not move the stores (global config only).
    const proj = join(tmp, "proj");
    mkdirSync(join(proj, ".coding-friend"), { recursive: true });
    writeFileSync(
      join(proj, ".coding-friend", "config.json"),
      JSON.stringify({
        learn: { outputDir: join(tmp, "other-learn") },
        session: { dir: join(tmp, "other-sessions") },
      }),
    );
    process.chdir(proj);

    const notes = join(tmp, "learn", "notes");
    mkdirSync(notes, { recursive: true });
    unreadable(join(notes, ".x.md.icloud"));
    unreadable(join(notes, "x 2.md"));
    unreadable(join(notes, "y.md"));
    for (const folder of ["my-label", "my-label 2"]) {
      const dir = join(tmp, "sessions", folder);
      mkdirSync(dir, { recursive: true });
      unreadable(join(dir, "meta.json"));
      unreadable(join(dir, "session.jsonl"));
    }
  });

  afterEach(() => {
    for (const f of files.splice(0)) chmodSync(f, 0o644);
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    process.exitCode = undefined;
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("counts placeholders and conflict copies without opening a file", async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    try {
      await syncStatusCommand({ json: true });
    } finally {
      vi.mocked(process.stdout.write).mockRestore();
    }

    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0])).toEqual({
      contractVersion: 1,
      ok: true,
      error: null,
      data: {
        kinds: [
          {
            kind: "learn",
            dir: join(tmp, "learn"),
            exists: true,
            cloud: null,
            files: 3,
            placeholders: 1,
            conflicts: 1,
            truncated: false,
          },
          {
            kind: "sessions",
            dir: join(tmp, "sessions"),
            exists: true,
            cloud: null,
            files: 2,
            placeholders: 0,
            conflicts: 1,
            truncated: false,
          },
        ],
        notSynced: ["globalConfig", "projectList"],
      },
    });
    expect(process.exitCode).toBeUndefined();
  });
});
