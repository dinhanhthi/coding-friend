import { describe, it, expect, vi, afterEach } from "vitest";
import { detectMemoryMcpState, printHealthSection } from "../mcp.js";
import type { McpHealthResult } from "../../lib/mcp-health.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── printHealthSection — Fix 5: per-check fix hints ─────────────────────────

describe("printHealthSection", () => {
  it("shows green ✓ for ok checks", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    const result: McpHealthResult = {
      checks: [{ label: "Config", ok: true }],
      ok: true,
    };
    printHealthSection(result);
    const joined = output.join("\n");
    expect(joined).toContain("✓");
    expect(joined).toContain("Config");
  });

  it("shows red ✗ for hard fail checks", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    const result: McpHealthResult = {
      checks: [{ label: "Config", ok: false, detail: "missing entry" }],
      ok: false,
    };
    printHealthSection(result);
    const joined = output.join("\n");
    expect(joined).toContain("✗");
    expect(joined).toContain("missing entry");
  });

  it("shows per-check fix hint (→ ...) when check.fix is set and check fails", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    const result: McpHealthResult = {
      checks: [
        {
          label: "Config",
          ok: false,
          detail: "missing entry",
          fix: 'Run "cf memory mcp" to fix',
        },
      ],
      ok: false,
    };
    printHealthSection(result);
    const joined = output.join("\n");
    expect(joined).toContain("→");
    expect(joined).toContain('Run "cf memory mcp" to fix');
  });

  it("does NOT show fix hint for warn checks (only hard fails)", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    const result: McpHealthResult = {
      checks: [
        {
          label: "Daemon",
          ok: false,
          warn: true,
          detail: "stopped",
        },
      ],
      ok: true,
    };
    printHealthSection(result);
    const joined = output.join("\n");
    expect(joined).toContain("⚠");
    expect(joined).not.toContain("→");
  });

  it("does NOT show fix hint when check.fix is not set", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    const result: McpHealthResult = {
      checks: [
        {
          label: "Package",
          ok: false,
          detail: "not built",
          // no fix field
        },
      ],
      ok: false,
    };
    printHealthSection(result);
    const joined = output.join("\n");
    expect(joined).toContain("✗");
    expect(joined).not.toContain("→");
  });

  it("shows multiple per-check fix hints when multiple checks fail", () => {
    const output: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    });
    const result: McpHealthResult = {
      checks: [
        { label: "Config", ok: false, detail: "missing", fix: "Run cf mcp 1" },
        {
          label: "Package",
          ok: false,
          detail: "not built",
          fix: "Run cf mcp 2",
        },
      ],
      ok: false,
    };
    printHealthSection(result);
    const joined = output.join("\n");
    expect(joined).toContain("Run cf mcp 1");
    expect(joined).toContain("Run cf mcp 2");
  });
});

// ─── Part C: Stale detection ─────────────────────────────────────────────────

describe("detectMemoryMcpState", () => {
  it("returns 'none' when .mcp.json is null (file doesn't exist)", () => {
    const result = detectMemoryMcpState(null, () => false);
    expect(result.kind).toBe("none");
  });

  it("returns 'none' when mcpServers is empty", () => {
    const result = detectMemoryMcpState({ mcpServers: {} }, () => false);
    expect(result.kind).toBe("none");
  });

  it("returns 'none' when coding-friend-memory entry is absent", () => {
    const mcp = {
      mcpServers: {
        "other-server": { command: "node", args: ["other.js"] },
      },
    };
    const result = detectMemoryMcpState(mcp, () => false);
    expect(result.kind).toBe("none");
  });

  it("returns 'npx' when entry uses npx command", () => {
    const mcp = {
      mcpServers: {
        "coding-friend-memory": {
          command: "npx",
          args: ["-y", "coding-friend-cli", "mcp-serve", "/some/dir"],
        },
      },
    };
    const result = detectMemoryMcpState(mcp, () => false);
    expect(result.kind).toBe("npx");
  });

  it("returns 'stale' when command is node and path does not exist", () => {
    const mcp = {
      mcpServers: {
        "coding-friend-memory": {
          command: "node",
          args: ["/old/absolute/path/to/index.js", "/some/memory"],
        },
      },
    };
    const result = detectMemoryMcpState(mcp, () => false);
    expect(result.kind).toBe("stale");
    expect(result.path).toBe("/old/absolute/path/to/index.js");
  });

  it("returns 'legacy-valid' when command is node and path exists", () => {
    const mcp = {
      mcpServers: {
        "coding-friend-memory": {
          command: "node",
          args: ["/existing/path/index.js", "/some/memory"],
        },
      },
    };
    const result = detectMemoryMcpState(mcp, () => true);
    expect(result.kind).toBe("legacy-valid");
    expect(result.path).toBe("/existing/path/index.js");
  });

  it("passes the node path to the existence checker", () => {
    const checkedPaths: string[] = [];
    const mcp = {
      mcpServers: {
        "coding-friend-memory": {
          command: "node",
          args: ["/check/this/path.js", "/memory"],
        },
      },
    };
    detectMemoryMcpState(mcp, (p) => {
      checkedPaths.push(p);
      return true;
    });
    expect(checkedPaths).toContain("/check/this/path.js");
  });

  it("returns 'none' when coding-friend-memory has no command field", () => {
    const mcp = {
      mcpServers: {
        "coding-friend-memory": { args: ["/some/path"] },
      },
    };
    const result = detectMemoryMcpState(mcp, () => false);
    expect(result.kind).toBe("none");
  });
});
