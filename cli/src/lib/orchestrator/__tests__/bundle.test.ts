import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { buildContextBundle } from "../bundle.js";
import type { TaskRecord } from "../store.js";

let root: string;
let repo: string;
let taskDir: string;

const task = (): TaskRecord => ({
  schemaVersion: 1,
  id: "abcd1234",
  provider: "claude",
  prompt: "ORIGINAL-PROMPT fix the parser",
  readOnly: false,
  checkout: repo,
  createdAt: new Date().toISOString(),
});

const bundle = () => buildContextBundle({ task: task(), taskDir });

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "cf-bundle-")));
  repo = join(root, "repo");
  taskDir = join(root, "task");
  mkdirSync(repo);
  mkdirSync(taskDir);
  spawnSync("git", ["init", "-q"], { cwd: repo });
  writeFileSync(join(repo, "a.txt"), "a\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("buildContextBundle", () => {
  it("never runs git in the checkout (fsmonitor hook, clean filter driver)", () => {
    // One script per hook, each touching its own marker; the filter must
    // also pass the content through.
    const plant = (name: string, body: string) => {
      const marker = join(root, `${name}-ran`);
      const hook = join(root, `${name}.sh`);
      writeFileSync(hook, `#!/bin/sh\ntouch "${marker}"\n${body}`);
      chmodSync(hook, 0o755);
      return { marker, hook };
    };
    const fsmonitor = plant("fsmonitor", "");
    const filter = plant("filter", "cat\n");
    const git = (...args: string[]) => spawnSync("git", args, { cwd: repo });
    git("add", "a.txt");
    git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
    git("config", "core.fsmonitor", fsmonitor.hook);
    git("config", "filter.x.clean", filter.hook);
    writeFileSync(join(repo, ".gitattributes"), "* filter=x\n");
    // Same size, so status must re-hash the file (through the filter).
    writeFileSync(join(repo, "a.txt"), "b\n");

    // Positive control: plain git status runs the planted code.
    git("status", "--short");
    for (const { marker } of [fsmonitor, filter]) {
      expect(existsSync(marker)).toBe(true);
      unlinkSync(marker);
    }

    const text = bundle();
    expect(existsSync(fsmonitor.marker)).toBe(false);
    expect(existsSync(filter.marker)).toBe(false);
    expect(text).toContain("ORIGINAL-PROMPT fix the parser");
  });

  it("tells the next worker to inspect the checkout with git itself", () => {
    const text = bundle();
    expect(text).toContain("`git status --short`");
    expect(text).toContain("`git diff --stat`");
  });

  it("does not read a symlinked handoff.md", () => {
    const secret = join(root, "secret");
    writeFileSync(secret, "SECRET-CONTENT");
    symlinkSync(secret, join(taskDir, "handoff.md"));

    const text = bundle();
    expect(text).not.toContain("SECRET-CONTENT");
    expect(text).toContain("(no handoff notes)");
  });

  it("includes a regular handoff.md under the untrusted notes", () => {
    writeFileSync(join(taskDir, "handoff.md"), "HANDOFF-NOTE half done");
    const text = bundle();
    const notes = text.indexOf("## Untrusted worker notes");
    expect(notes).toBeGreaterThan(-1);
    expect(text.indexOf("HANDOFF-NOTE half done")).toBeGreaterThan(notes);
  });
});
