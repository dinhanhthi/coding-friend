import { describe, it, expect } from "vitest";
import { detectMemoryMcpState } from "../mcp.js";

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
