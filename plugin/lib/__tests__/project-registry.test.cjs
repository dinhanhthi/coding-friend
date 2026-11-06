"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SCRIPT = path.resolve(__dirname, "../project-registry.cjs");
const { record } = require(SCRIPT);

let root;
let home;
let file;

function makeProject(name, config) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  if (config) writeConfig(dir, config);
  return dir;
}

function writeConfig(dir, config) {
  fs.mkdirSync(path.join(dir, ".coding-friend"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, ".coding-friend", "config.json"),
    JSON.stringify(config),
  );
}

function readFile() {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cf-registry-cjs-"));
  home = path.join(root, "home");
  fs.mkdirSync(home);
  file = path.join(root, "reg", "projects.json");
  vi.stubEnv("HOME", home);
  vi.stubEnv("CF_PROJECTS_FILE", file);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("project-registry.cjs record", () => {
  it("creates the registry file with a canonical path", () => {
    const proj = makeProject("proj");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    record(proj, "claude");
    expect(readFile()).toEqual({
      schemaVersion: 1,
      projects: [
        {
          path: fs.realpathSync(proj),
          hosts: ["claude"],
          firstSeen: "2026-01-01T00:00:00.000Z",
          lastSeen: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
  });

  it("merges hosts and keeps firstSeen on a second record", () => {
    const proj = makeProject("proj");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    record(proj, "claude");
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    record(proj, "codex");
    record(path.join(proj, "..", "proj"), "claude");
    expect(readFile().projects).toEqual([
      {
        path: fs.realpathSync(proj),
        hosts: ["claude", "codex"],
        firstSeen: "2026-01-01T00:00:00.000Z",
        lastSeen: "2026-02-01T00:00:00.000Z",
      },
    ]);
  });

  it("does not write when local projectRegistry is false", () => {
    const proj = makeProject("proj", { projectRegistry: false });
    record(proj, "claude");
    expect(fs.existsSync(file)).toBe(false);
  });

  it("lets local projectRegistry:true override global false", () => {
    writeConfig(home, { projectRegistry: false });
    const off = makeProject("off");
    record(off, "claude");
    expect(fs.existsSync(file)).toBe(false);

    const on = makeProject("on", { projectRegistry: true });
    record(on, "claude");
    expect(readFile().projects.map((p) => p.path)).toEqual([
      fs.realpathSync(on),
    ]);
  });

  it("skips $HOME and /", () => {
    record(home, "claude");
    record("/", "claude");
    expect(fs.existsSync(file)).toBe(false);
  });
});

describe("project-registry.cjs CLI", () => {
  function run(proj) {
    return execFileSync(process.execPath, [SCRIPT, "record", proj, "claude"], {
      encoding: "utf8",
      env: { ...process.env, HOME: home, CF_PROJECTS_FILE: file },
    });
  }

  it("writes nothing to stdout and exits 0", () => {
    const proj = makeProject("proj");
    expect(run(proj)).toBe("");
    expect(readFile().projects).toHaveLength(1);
  });

  it("leaves a corrupt registry untouched and exits 0", () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    for (const content of [
      "{not json",
      JSON.stringify({ schemaVersion: 2, projects: [] }),
      JSON.stringify({ schemaVersion: 1, projects: [{ path: 1 }] }),
    ]) {
      fs.writeFileSync(file, content);
      expect(run(makeProject("proj"))).toBe("");
      expect(fs.readFileSync(file, "utf8")).toBe(content);
    }
  });
});
