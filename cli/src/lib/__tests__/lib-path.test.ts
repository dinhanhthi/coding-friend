import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getLibPath, getOmpExtensionPath } from "../lib-path.js";
import { pluginCachePath } from "../paths.js";

const STUB_EXTENSION = "export default function createExtension() {}\n";

let originalCwd: string;
const tmpDirs: string[] = [];

function makeTemp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function writeExtension(
  root: string,
  relative = join("plugin", "omp"),
): string {
  const file = join(root, relative, "extension.ts");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, STUB_EXTENSION);
  return file;
}

beforeEach(() => {
  originalCwd = process.cwd();
  const isolatedHome = makeTemp("cf-lib-path-home-");
  vi.stubEnv("CLAUDE_CONFIG_DIR", join(isolatedHome, "claude-config"));
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("getLibPath", () => {
  it("resolves a bundled CLI lib directory", () => {
    const memory = getLibPath("cf-memory");
    expect(existsSync(memory)).toBe(true);
    expect(memory).toMatch(/cf-memory$/);
  });
});

describe("getOmpExtensionPath", () => {
  it("resolves plugin/omp/extension.ts from repoRoot", () => {
    const repoRoot = makeTemp("cf-omp-ext-cwd-");
    writeExtension(repoRoot);
    process.chdir(repoRoot);

    expect(getOmpExtensionPath()).toBe(
      join(process.cwd(), "plugin", "omp", "extension.ts"),
    );
  });

  it("resolves plugin/omp/extension.ts from the parent of repoRoot", () => {
    const repoRoot = makeTemp("cf-omp-ext-parent-");
    writeExtension(repoRoot);
    const nested = join(repoRoot, "cli");
    mkdirSync(nested);
    process.chdir(nested);

    expect(getOmpExtensionPath()).toBe(
      resolve(process.cwd(), "..", "plugin", "omp", "extension.ts"),
    );
  });

  it("falls back to the latest cached plugin omp/extension.ts", () => {
    const cwd = makeTemp("cf-omp-ext-empty-");
    process.chdir(cwd);

    writeExtension(join(pluginCachePath(), "0.1.0"), "omp");
    const expected = writeExtension(join(pluginCachePath(), "0.40.3"), "omp");

    expect(getOmpExtensionPath()).toBe(resolve(expected));
  });

  it("returns null when no repo or cached extension.ts exists", () => {
    const cwd = makeTemp("cf-omp-ext-missing-");
    process.chdir(cwd);

    expect(getOmpExtensionPath()).toBeNull();
  });
});
