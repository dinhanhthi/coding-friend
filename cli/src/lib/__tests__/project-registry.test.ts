import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { projectsRegistryPath } from "../paths.js";
import {
  listProjects,
  readRegistry,
  removeProject,
  upsertProject,
} from "../project-registry.js";

let root: string;
let file: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cf-registry-"));
  file = join(root, "reg", "projects.json");
  vi.stubEnv("CF_PROJECTS_FILE", file);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  rmSync(root, { recursive: true, force: true });
});

function readFile(): Record<string, unknown> {
  return JSON.parse(readFileSync(file, "utf-8"));
}

describe("projectsRegistryPath", () => {
  it("honors CF_PROJECTS_FILE", () => {
    expect(projectsRegistryPath()).toBe(file);
  });
});

describe("readRegistry", () => {
  it("returns an empty registry when the file is missing", () => {
    expect(readRegistry().registry).toEqual({
      schemaVersion: 1,
      projects: [],
    });
  });

  it("returns an empty registry plus a warning when the file is corrupt", () => {
    mkdirSync(join(root, "reg"));
    writeFileSync(file, "{not json");
    const res = readRegistry();
    expect(res.registry).toEqual({ schemaVersion: 1, projects: [] });
    expect(res.warning).toMatch(/projects\.json/);
  });

  it("treats an invalid shape as corrupt", () => {
    mkdirSync(join(root, "reg"));
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, projects: "x" }));
    const res = readRegistry();
    expect(res.registry.projects).toEqual([]);
    expect(res.warning).toBeDefined();
  });
});

describe("upsertProject", () => {
  it("adds, merges hosts uniquely, keeps firstSeen and updates lastSeen", () => {
    const proj = join(root, "proj");
    mkdirSync(proj);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    upsertProject(proj, "claude");
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    upsertProject(proj, "codex");
    upsertProject(proj, "claude");

    expect(readFile()).toEqual({
      schemaVersion: 1,
      projects: [
        {
          path: realpathSync(proj),
          hosts: ["claude", "codex"],
          firstSeen: "2026-01-01T00:00:00.000Z",
          lastSeen: "2026-02-01T00:00:00.000Z",
        },
      ],
    });
  });

  it("canonicalizes existing paths so aliases do not duplicate", () => {
    const proj = join(root, "proj");
    mkdirSync(proj);
    upsertProject(proj);
    upsertProject(join(proj, "..", "proj"));
    upsertProject(realpathSync(proj));
    expect(listProjects().projects).toHaveLength(1);
  });
});

describe("removeProject", () => {
  it("removes a registered path and reports whether it was present", () => {
    const proj = join(root, "proj");
    mkdirSync(proj);
    upsertProject(proj);
    expect(removeProject(proj)).toBe(true);
    expect(removeProject(proj)).toBe(false);
    expect(readFile().projects).toEqual([]);
  });
});

describe("write paths on an unreadable registry", () => {
  for (const [name, content] of [
    ["corrupt JSON", "{not json"],
    ["schemaVersion 2", JSON.stringify({ schemaVersion: 2, projects: [] })],
  ] as const) {
    it(`refuse to overwrite a registry with ${name}`, () => {
      mkdirSync(join(root, "reg"));
      writeFileSync(file, content);
      const proj = join(root, "proj");
      mkdirSync(proj);
      expect(() => upsertProject(proj)).toThrow(
        expect.objectContaining({ code: "INVALID_VALUE" }),
      );
      expect(() => removeProject(proj)).toThrow(
        expect.objectContaining({ code: "INVALID_VALUE" }),
      );
      expect(readFileSync(file, "utf-8")).toBe(content);
    });
  }
});

describe("listProjects", () => {
  it("adds a computed exists flag without persisting it", () => {
    const proj = join(root, "proj");
    mkdirSync(proj);
    upsertProject(proj);
    upsertProject(join(root, "gone"));

    const { projects } = listProjects();
    expect(projects.map((p) => p.exists)).toEqual([true, false]);
    for (const p of readFile().projects as Record<string, unknown>[]) {
      expect(p).not.toHaveProperty("exists");
    }
  });
});
