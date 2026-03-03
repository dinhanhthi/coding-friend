import { describe, it, expect } from "vitest";
import { homedir } from "os";
import { resolve, join } from "path";
import {
  resolvePath,
  marketplaceCachePath,
  marketplaceClonePath,
  globalConfigDir,
} from "../paths.js";

describe("resolvePath", () => {
  it("returns absolute paths unchanged", () => {
    expect(resolvePath("/usr/local/bin")).toBe("/usr/local/bin");
  });

  it("expands ~/ to the home directory", () => {
    expect(resolvePath("~/projects")).toBe(join(homedir(), "projects"));
  });

  it("expands ~/ with nested path", () => {
    expect(resolvePath("~/.claude/settings.json")).toBe(
      join(homedir(), ".claude", "settings.json"),
    );
  });

  it("resolves relative paths against cwd by default", () => {
    expect(resolvePath("foo/bar")).toBe(resolve(process.cwd(), "foo/bar"));
  });

  it("resolves relative paths against a provided base", () => {
    expect(resolvePath("bar", "/tmp/base")).toBe("/tmp/base/bar");
  });

  it("resolves . to the base directory", () => {
    expect(resolvePath(".", "/tmp/base")).toBe("/tmp/base");
  });
});

describe("marketplaceCachePath", () => {
  it("returns the marketplace cache directory under ~/.claude", () => {
    expect(marketplaceCachePath()).toBe(
      join(
        homedir(),
        ".claude",
        "plugins",
        "cache",
        "coding-friend-marketplace",
      ),
    );
  });
});

describe("marketplaceClonePath", () => {
  it("returns the marketplace clone directory under ~/.claude", () => {
    expect(marketplaceClonePath()).toBe(
      join(
        homedir(),
        ".claude",
        "plugins",
        "marketplaces",
        "coding-friend-marketplace",
      ),
    );
  });
});

describe("globalConfigDir", () => {
  it("returns ~/.coding-friend", () => {
    expect(globalConfigDir()).toBe(join(homedir(), ".coding-friend"));
  });
});
