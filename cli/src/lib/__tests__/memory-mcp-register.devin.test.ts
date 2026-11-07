import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

vi.mock("../log.js", () => ({
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), dim: vi.fn() },
}));

import {
  unregisterDevinLearnMcp,
  unregisterLearnMcp,
} from "../learn-prompts.js";
import { log } from "../log.js";
import {
  unregisterDevinMemoryMcp,
  unregisterMemoryMcp,
} from "../memory-mcp-register.js";

// Real ~/.config/devin/mcp_config.json, redirected through XDG_CONFIG_HOME.
let configHome: string;
let savedXdg: string | undefined;

function writeConfig(raw: string): void {
  mkdirSync(join(configHome, "devin"), { recursive: true });
  writeFileSync(join(configHome, "devin", "mcp_config.json"), raw);
}

beforeEach(() => {
  vi.clearAllMocks();
  savedXdg = process.env.XDG_CONFIG_HOME;
  configHome = mkdtempSync(join(tmpdir(), "cf-devin-unregister-"));
  process.env.XDG_CONFIG_HOME = configHome;
});

afterEach(() => {
  if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = savedXdg;
  rmSync(configHome, { recursive: true, force: true });
});

describe.each([
  [
    "memory",
    unregisterDevinMemoryMcp,
    unregisterMemoryMcp,
    "coding-friend-memory",
  ],
  ["learn", unregisterDevinLearnMcp, unregisterLearnMcp, "coding-friend-learn"],
])("unregisterDevin %s Mcp", (_kind, unregister, unregisterBool, name) => {
  it("reports absent when there is no mcp_config.json", () => {
    expect(unregister()).toBe("absent");
  });

  it("reports removed for our entry", () => {
    writeConfig(
      JSON.stringify({
        mcpServers: {
          [name]: { command: "npx", args: ["-y", "coding-friend-cli", "x"] },
        },
      }),
    );
    expect(unregister()).toBe("removed");
  });

  it("reports a corrupt mcp_config.json as failed, with a warning", () => {
    writeConfig("{ not json");
    expect(unregister()).toBe("failed");
    expect(vi.mocked(log.warn)).toHaveBeenCalledWith(
      expect.stringContaining("not valid JSON"),
    );
    // The host-generic wrapper must not call it a success either.
    expect(unregisterBool("devin")).toBe(false);
  });
});
