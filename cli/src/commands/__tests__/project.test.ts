import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { resolveMainRepoRoot } from "../../lib/project-root.js";

vi.mock("../../lib/project-root.js", () => ({
  resolveMainRepoRoot: vi.fn((p: string) => p),
}));

import {
  projectAddCommand,
  projectListCommand,
  projectRemoveCommand,
} from "../project.js";

let root: string;
let stdout: string[];
let logs: string[];

function envelope(): Record<string, any> {
  return JSON.parse(stdout.join(""));
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cf-project-cmd-"));
  vi.stubEnv("CF_PROJECTS_FILE", join(root, "projects.json"));
  stdout = [];
  logs = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(console, "log").mockImplementation((...args) => {
    logs.push(args.join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.mocked(resolveMainRepoRoot).mockImplementation((p: string) => p);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
  rmSync(root, { recursive: true, force: true });
});

describe("cf project", () => {
  it("add then list round-trips in json mode", async () => {
    const proj = join(root, "proj");
    mkdirSync(proj);
    await projectAddCommand(proj, { json: true });
    expect(envelope()).toMatchObject({
      ok: true,
      data: { project: { path: realpathSync(proj) } },
    });

    stdout = [];
    await projectListCommand({ json: true });
    expect(envelope().data.projects).toEqual([
      expect.objectContaining({ path: realpathSync(proj), exists: true }),
    ]);
  });

  it("add of a missing path is NOT_FOUND", async () => {
    await projectAddCommand(join(root, "nope"), { json: true });
    expect(envelope()).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(process.exitCode).toBe(1);
  });

  it("remove of an unregistered path is NOT_FOUND", async () => {
    await projectRemoveCommand(join(root, "nope"), { json: true });
    expect(envelope()).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("remove from a subdir removes the main repo root entry", async () => {
    const proj = join(root, "proj");
    const sub = join(proj, "cli");
    mkdirSync(sub, { recursive: true });
    vi.mocked(resolveMainRepoRoot).mockImplementation((p: string) =>
      p === sub || p === realpathSync(sub) ? proj : p,
    );
    await projectAddCommand(sub, { json: true });
    expect(envelope().data.project.path).toBe(realpathSync(proj));

    stdout = [];
    await projectRemoveCommand(sub, { json: true });
    expect(envelope()).toMatchObject({
      ok: true,
      data: { path: realpathSync(proj), removed: true },
    });
  });

  it("remove logs the error before exiting 1 in human mode", async () => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    await projectRemoveCommand(join(root, "nope"), {});
    expect(stdout).toEqual([]);
    expect(logs.join("\n")).toContain("not in the project registry");
    expect(exit).toHaveBeenCalledWith(1);
  });
});
