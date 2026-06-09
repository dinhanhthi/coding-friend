import { describe, it, expect } from "vitest";
import { buildStoreStatus, buildUpdateStatus } from "../lib/status-frame.js";

describe("buildStoreStatus", () => {
  it("returns a list with markdown and database info", () => {
    const result = buildStoreStatus({
      id: "features/auth-pattern",
      title: "Auth Pattern",
      markdownPath: "/docs/memory/features/auth-pattern.md",
      dbPath: "/home/.coding-friend/memory/projects/-foo/db.sqlite",
    });

    expect(result).toContain("features/auth-pattern");
    expect(result).toContain("Auth Pattern");
    expect(result).toContain("/docs/memory/features/auth-pattern.md");
    expect(result).toContain("db.sqlite");
    // No box-drawing characters
    expect(result).not.toContain("╭");
    expect(result).not.toContain("╰");
    expect(result).not.toContain("│");
  });

  it("shows markdown-only when dbPath is null", () => {
    const result = buildStoreStatus({
      id: "features/auth-pattern",
      title: "Auth Pattern",
      markdownPath: "/docs/memory/features/auth-pattern.md",
      dbPath: null,
    });

    expect(result).toContain("/docs/memory/features/auth-pattern.md");
    expect(result).not.toContain("db.sqlite");
  });

  it("shows project instructions updated when sync succeeds", () => {
    const result = buildStoreStatus({
      id: "conventions/code-style",
      title: "Code Style",
      markdownPath: "/docs/memory/conventions/code-style.md",
      dbPath: null,
      claudeMdUpdated: true,
    });

    expect(result).toContain("Project instructions updated");
  });

  it("omits project instructions line when sync did not run", () => {
    const result = buildStoreStatus({
      id: "features/auth-pattern",
      title: "Auth Pattern",
      markdownPath: "/docs/memory/features/auth-pattern.md",
      dbPath: null,
      claudeMdUpdated: false,
    });

    expect(result).not.toContain("Project instructions");
  });

  it("omits project instructions line when sync status is not provided", () => {
    const result = buildStoreStatus({
      id: "features/auth-pattern",
      title: "Auth Pattern",
      markdownPath: "/docs/memory/features/auth-pattern.md",
      dbPath: null,
    });

    expect(result).not.toContain("Project instructions");
  });

  it("includes duplicate warning when provided", () => {
    const result = buildStoreStatus({
      id: "features/auth-pattern",
      title: "Auth Pattern",
      markdownPath: "/docs/memory/features/auth-pattern.md",
      dbPath: null,
      warning: "Near-duplicate found: features/old-auth (similarity: 0.82)",
    });

    expect(result).toContain("Near-duplicate");
    expect(result).toContain("⚠");
  });
});

describe("buildUpdateStatus", () => {
  it("returns a list with markdown and database info", () => {
    const result = buildUpdateStatus({
      id: "features/auth-pattern",
      title: "Auth Pattern",
      markdownPath: "/docs/memory/features/auth-pattern.md",
      dbPath: "/home/.coding-friend/memory/projects/-foo/db.sqlite",
    });

    expect(result).toContain("features/auth-pattern");
    expect(result).toContain("Auth Pattern");
    expect(result).toContain("/docs/memory/features/auth-pattern.md");
    expect(result).toContain("db.sqlite");
    expect(result).not.toContain("╭");
    expect(result).not.toContain("╰");
  });

  it("shows markdown-only when dbPath is null", () => {
    const result = buildUpdateStatus({
      id: "features/auth-pattern",
      title: "Auth Pattern",
      markdownPath: "/docs/memory/features/auth-pattern.md",
      dbPath: null,
    });

    expect(result).toContain("/docs/memory/features/auth-pattern.md");
    expect(result).not.toContain("db.sqlite");
  });

  it("shows project instructions updated when sync succeeds", () => {
    const result = buildUpdateStatus({
      id: "conventions/code-style",
      title: "Code Style",
      markdownPath: "/docs/memory/conventions/code-style.md",
      dbPath: null,
      claudeMdUpdated: true,
    });

    expect(result).toContain("Project instructions updated");
  });

  it("omits project instructions line when sync did not run", () => {
    const result = buildUpdateStatus({
      id: "conventions/code-style",
      title: "Code Style",
      markdownPath: "/docs/memory/conventions/code-style.md",
      dbPath: null,
      claudeMdUpdated: false,
    });

    expect(result).not.toContain("Project instructions");
  });
});
