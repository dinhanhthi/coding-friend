import { describe, it, expect } from "vitest";
import {
  checkMemoryMcpHealth,
  checkLearnMcpHealth,
  type HealthCheck,
  type McpHealthResult,
} from "../mcp-health.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const FAKE_MEMORY_DIST = "/fake/cf-memory/dist/index.js";

function makeMemoryDeps(overrides: {
  mcpJson?: Record<string, unknown> | null;
  pathExists?: (p: string) => boolean;
  isDaemonRunning?: () => Promise<boolean>;
  memoryDistPath?: string;
}) {
  return {
    readMcpJson: () => overrides.mcpJson ?? null,
    pathExists: overrides.pathExists ?? (() => false),
    isDaemonRunning: overrides.isDaemonRunning ?? (async () => false),
    memoryDistPath: overrides.memoryDistPath ?? FAKE_MEMORY_DIST,
  };
}

function makeLearnDeps(overrides: {
  checkRegistered?: boolean;
  pathExists?: (p: string) => boolean;
  listMdFiles?: (dir: string) => string[];
  docsDir?: string;
  learnMcpDistPath?: string;
}) {
  return {
    checkRegistered: () => overrides.checkRegistered ?? false,
    pathExists: overrides.pathExists ?? (() => false),
    listMdFiles: overrides.listMdFiles ?? (() => []),
    docsDir: overrides.docsDir ?? "/fake/docs",
    learnMcpDistPath:
      overrides.learnMcpDistPath ?? "/fake/learn-mcp/dist/index.js",
  };
}

// ─── checkMemoryMcpHealth ────────────────────────────────────────────────────

describe("checkMemoryMcpHealth", () => {
  describe("Config check (.mcp.json)", () => {
    it("fails when .mcp.json has no coding-friend-memory entry", async () => {
      const result = await checkMemoryMcpHealth(
        makeMemoryDeps({ mcpJson: { mcpServers: {} } }),
      );
      const configCheck = result.checks.find(
        (c) => c.label === "Config (.mcp.json)",
      );
      expect(configCheck).toBeDefined();
      expect(configCheck!.ok).toBe(false);
      expect(configCheck!.warn).toBeFalsy();
      expect(configCheck!.fix).toBeDefined();
    });

    it("fails when .mcp.json is null (no file)", async () => {
      const result = await checkMemoryMcpHealth(
        makeMemoryDeps({ mcpJson: null }),
      );
      const configCheck = result.checks.find(
        (c) => c.label === "Config (.mcp.json)",
      );
      expect(configCheck!.ok).toBe(false);
    });

    it("fails with fix hint when entry is stale (node command, path missing)", async () => {
      const deps = makeMemoryDeps({
        mcpJson: {
          mcpServers: {
            "coding-friend-memory": {
              command: "node",
              args: ["/missing/path/index.js"],
            },
          },
        },
        pathExists: () => false,
      });
      const result = await checkMemoryMcpHealth(deps);
      const configCheck = result.checks.find(
        (c) => c.label === "Config (.mcp.json)",
      );
      expect(configCheck!.ok).toBe(false);
      expect(configCheck!.fix).toContain("cf memory mcp");
    });

    it("fails with fix hint when entry is legacy-valid (node command, path exists)", async () => {
      const deps = makeMemoryDeps({
        mcpJson: {
          mcpServers: {
            "coding-friend-memory": {
              command: "node",
              args: ["/existing/path/index.js"],
            },
          },
        },
        pathExists: (p) => p === "/existing/path/index.js",
      });
      const result = await checkMemoryMcpHealth(deps);
      const configCheck = result.checks.find(
        (c) => c.label === "Config (.mcp.json)",
      );
      expect(configCheck!.ok).toBe(false);
      expect(configCheck!.fix).toContain("cf memory mcp");
    });

    it("passes when entry uses npx format", async () => {
      const deps = makeMemoryDeps({
        mcpJson: {
          mcpServers: {
            "coding-friend-memory": {
              command: "npx",
              args: ["-y", "coding-friend-cli", "mcp-serve", "/some/dir"],
            },
          },
        },
      });
      const result = await checkMemoryMcpHealth(deps);
      const configCheck = result.checks.find(
        (c) => c.label === "Config (.mcp.json)",
      );
      expect(configCheck!.ok).toBe(true);
    });
  });

  describe("Package built check", () => {
    it("fails when dist/index.js does not exist", async () => {
      const deps = makeMemoryDeps({
        mcpJson: {
          mcpServers: { "coding-friend-memory": { command: "npx", args: [] } },
        },
        pathExists: () => false,
      });
      const result = await checkMemoryMcpHealth(deps);
      const builtCheck = result.checks.find((c) => c.label === "Package built");
      expect(builtCheck!.ok).toBe(false);
    });

    it("passes when dist/index.js exists", async () => {
      const deps = makeMemoryDeps({
        mcpJson: {
          mcpServers: { "coding-friend-memory": { command: "npx", args: [] } },
        },
        pathExists: (p) => p === FAKE_MEMORY_DIST,
      });
      const result = await checkMemoryMcpHealth(deps);
      const builtCheck = result.checks.find((c) => c.label === "Package built");
      expect(builtCheck!.ok).toBe(true);
    });
  });

  describe("Daemon status check", () => {
    it("is ok (green) when daemon is running", async () => {
      const deps = makeMemoryDeps({
        mcpJson: {
          mcpServers: { "coding-friend-memory": { command: "npx", args: [] } },
        },
        pathExists: () => true,
        isDaemonRunning: async () => true,
      });
      const result = await checkMemoryMcpHealth(deps);
      const daemonCheck = result.checks.find(
        (c) => c.label === "Daemon status",
      );
      expect(daemonCheck!.ok).toBe(true);
      expect(daemonCheck!.warn).toBeFalsy();
    });

    it("is a warn (not fail) when daemon is stopped", async () => {
      const deps = makeMemoryDeps({
        mcpJson: {
          mcpServers: { "coding-friend-memory": { command: "npx", args: [] } },
        },
        pathExists: () => true,
        isDaemonRunning: async () => false,
      });
      const result = await checkMemoryMcpHealth(deps);
      const daemonCheck = result.checks.find(
        (c) => c.label === "Daemon status",
      );
      expect(daemonCheck!.ok).toBe(false);
      expect(daemonCheck!.warn).toBe(true);
    });
  });

  describe("result.ok", () => {
    it("is true when all checks pass (npx config, dist present, daemon running)", async () => {
      const deps = makeMemoryDeps({
        mcpJson: {
          mcpServers: { "coding-friend-memory": { command: "npx", args: [] } },
        },
        pathExists: (p) => p === FAKE_MEMORY_DIST,
        isDaemonRunning: async () => true,
      });
      const result = await checkMemoryMcpHealth(deps);
      expect(result.ok).toBe(true);
    });

    it("is true when only daemon is stopped (warn does not fail ok)", async () => {
      const deps = makeMemoryDeps({
        mcpJson: {
          mcpServers: { "coding-friend-memory": { command: "npx", args: [] } },
        },
        pathExists: (p) => p === FAKE_MEMORY_DIST,
        isDaemonRunning: async () => false,
      });
      const result = await checkMemoryMcpHealth(deps);
      // daemon-stopped is warn, not hard fail
      expect(result.ok).toBe(true);
    });

    it("is false when config is missing", async () => {
      const result = await checkMemoryMcpHealth(
        makeMemoryDeps({ mcpJson: null }),
      );
      expect(result.ok).toBe(false);
    });
  });
});

// ─── checkLearnMcpHealth ─────────────────────────────────────────────────────

// ─── checkMemoryMcpHealth — Fix 3: silent catch ──────────────────────────────

describe("checkMemoryMcpHealth — isDaemonRunning throws", () => {
  it("daemon check is warn=true with detail containing error info when isDaemonRunning throws", async () => {
    const deps = makeMemoryDeps({
      mcpJson: {
        mcpServers: { "coding-friend-memory": { command: "npx", args: [] } },
      },
      pathExists: (p) => p === FAKE_MEMORY_DIST,
      isDaemonRunning: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const result = await checkMemoryMcpHealth(deps);
    const daemonCheck = result.checks.find((c) => c.label === "Daemon status");
    expect(daemonCheck).toBeDefined();
    expect(daemonCheck!.ok).toBe(false);
    expect(daemonCheck!.warn).toBe(true);
    expect(daemonCheck!.detail).toContain("ECONNREFUSED");
  });

  it("daemon check detail includes non-Error thrown value", async () => {
    const deps = makeMemoryDeps({
      mcpJson: {
        mcpServers: { "coding-friend-memory": { command: "npx", args: [] } },
      },
      pathExists: (p) => p === FAKE_MEMORY_DIST,
      isDaemonRunning: async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw "socket error";
      },
    });
    const result = await checkMemoryMcpHealth(deps);
    const daemonCheck = result.checks.find((c) => c.label === "Daemon status");
    expect(daemonCheck!.warn).toBe(true);
    expect(daemonCheck!.detail).toContain("socket error");
  });
});

// ─── checkLearnMcpHealth ─────────────────────────────────────────────────────

describe("checkLearnMcpHealth", () => {
  describe("Registration check (claude mcp)", () => {
    it("fails when MCP is not registered", async () => {
      const result = await checkLearnMcpHealth(
        makeLearnDeps({ checkRegistered: false }),
      );
      const regCheck = result.checks.find(
        (c) => c.label === "Registered (claude mcp)",
      );
      expect(regCheck!.ok).toBe(false);
      expect(regCheck!.fix).toBeDefined();
    });

    it("passes when MCP is registered", async () => {
      const result = await checkLearnMcpHealth(
        makeLearnDeps({ checkRegistered: true }),
      );
      const regCheck = result.checks.find(
        (c) => c.label === "Registered (claude mcp)",
      );
      expect(regCheck!.ok).toBe(true);
    });
  });

  describe("Package built check", () => {
    it("fails when learn-mcp dist/index.js does not exist", async () => {
      const result = await checkLearnMcpHealth(
        makeLearnDeps({
          checkRegistered: true,
          pathExists: () => false,
        }),
      );
      const builtCheck = result.checks.find((c) => c.label === "Package built");
      expect(builtCheck!.ok).toBe(false);
    });

    it("passes when learn-mcp dist/index.js exists", async () => {
      const result = await checkLearnMcpHealth(
        makeLearnDeps({
          checkRegistered: true,
          pathExists: (p) => p === "/fake/learn-mcp/dist/index.js",
        }),
      );
      const builtCheck = result.checks.find((c) => c.label === "Package built");
      expect(builtCheck!.ok).toBe(true);
    });
  });

  describe("Docs directory check", () => {
    it("fails when docs dir has no .md files", async () => {
      const result = await checkLearnMcpHealth(
        makeLearnDeps({
          checkRegistered: true,
          pathExists: () => true,
          listMdFiles: () => [],
        }),
      );
      const docsCheck = result.checks.find((c) => c.label === "Docs directory");
      expect(docsCheck!.ok).toBe(false);
    });

    it("passes when docs dir has .md files", async () => {
      const result = await checkLearnMcpHealth(
        makeLearnDeps({
          checkRegistered: true,
          pathExists: () => true,
          listMdFiles: () => ["topic.md", "other.md"],
        }),
      );
      const docsCheck = result.checks.find((c) => c.label === "Docs directory");
      expect(docsCheck!.ok).toBe(true);
    });
  });

  describe("result.ok", () => {
    it("is true when all checks pass", async () => {
      const result = await checkLearnMcpHealth(
        makeLearnDeps({
          checkRegistered: true,
          pathExists: () => true,
          listMdFiles: () => ["topic.md"],
        }),
      );
      expect(result.ok).toBe(true);
    });

    it("is false when MCP is not registered", async () => {
      const result = await checkLearnMcpHealth(
        makeLearnDeps({ checkRegistered: false }),
      );
      expect(result.ok).toBe(false);
    });
  });
});
