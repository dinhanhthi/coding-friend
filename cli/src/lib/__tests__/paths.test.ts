import { describe, it, expect } from "vitest";
import { homedir } from "os";
import { resolve, join } from "path";
import {
  resolvePath,
  marketplaceCachePath,
  marketplaceClonePath,
  globalConfigDir,
  encodeProjectPath,
  claudeProjectsDir,
  claudeSessionDir,
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

  it("resolves bare ~/ to the home directory", () => {
    expect(resolvePath("~/")).toBe(homedir());
  });
});

describe("resolvePath + encodeProjectPath integration", () => {
  it("tilde path encodes correctly after resolution", () => {
    const resolved = resolvePath("~/Downloads/test2");
    const encoded = encodeProjectPath(resolved);
    expect(encoded).toBe(
      join(homedir(), "Downloads", "test2").replace(/\//g, "-"),
    );
  });

  it("bare ~/ encodes to home directory, not literal tilde", () => {
    const resolved = resolvePath("~/");
    const encoded = encodeProjectPath(resolved);
    expect(encoded).not.toContain("~");
    expect(encoded).toBe(homedir().replace(/\//g, "-"));
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

describe("encodeProjectPath", () => {
  it("converts absolute path by replacing / with -", () => {
    expect(encodeProjectPath("/Users/alice/git/foo")).toBe(
      "-Users-alice-git-foo",
    );
  });

  it("handles trailing slash", () => {
    expect(encodeProjectPath("/Users/thi/git/foo/")).toBe(
      "-Users-thi-git-foo-",
    );
  });

  it("handles single-level path", () => {
    expect(encodeProjectPath("/tmp")).toBe("-tmp");
  });
});

describe("claudeProjectsDir", () => {
  it("returns ~/.claude/projects/", () => {
    expect(claudeProjectsDir()).toBe(join(homedir(), ".claude", "projects"));
  });
});

describe("claudeSessionDir", () => {
  it("returns ~/.claude/projects/<encodedPath>", () => {
    expect(claudeSessionDir("-Users-alice-git-foo")).toBe(
      join(homedir(), ".claude", "projects", "-Users-alice-git-foo"),
    );
  });
});
