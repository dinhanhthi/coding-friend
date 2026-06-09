import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

import {
  deployCodexAgents,
  getCodexInstalledVersion,
  isCodexMarketplaceRegistered,
  isCodexPluginDisabled,
  setCodexPluginEnabled,
  trustCodexProject,
  writeCodexMemoryMcpConfig,
} from "../codex-config.js";

function tempFile(name = "config.toml"): string {
  const dir = mkdtempSync(join(tmpdir(), "cf-codex-config-"));
  return join(dir, name);
}

describe("codex-config", () => {
  it("toggles plugin enabled while preserving unrelated TOML", () => {
    const file = tempFile();
    writeFileSync(
      file,
      [
        "[marketplaces.coding-friend-marketplace]",
        'source = "dinhanhthi/coding-friend"',
        "",
        '[plugins."coding-friend@coding-friend-marketplace"]',
        "enabled = true",
        'custom = "kept"',
        "",
        "[other]",
        "value = 1",
        "",
      ].join("\n"),
    );

    setCodexPluginEnabled(false, file);
    expect(isCodexPluginDisabled(file)).toBe(true);
    expect(readFileSync(file, "utf8")).toContain('custom = "kept"');
    expect(readFileSync(file, "utf8")).toContain("[other]");

    setCodexPluginEnabled(true, file);
    expect(isCodexPluginDisabled(file)).toBe(false);
  });

  it("detects Codex marketplace registration", () => {
    const file = tempFile();
    writeFileSync(
      file,
      '[marketplaces.coding-friend-marketplace]\nsource_type = "local"\n',
    );

    expect(isCodexMarketplaceRegistered(file)).toBe(true);
  });

  it("writes memory MCP and project trust tables without clobbering config", () => {
    const file = tempFile();
    writeFileSync(file, '[model]\nname = "gpt-5"\n');

    writeCodexMemoryMcpConfig("/repo/docs/memory", file);
    trustCodexProject("/repo", file);

    const toml = readFileSync(file, "utf8");
    expect(toml).toContain("[model]");
    expect(toml).toContain("[mcp_servers.coding-friend-memory]");
    expect(toml).toContain(
      'args = ["-y", "coding-friend-cli", "mcp-serve", "/repo/docs/memory"]',
    );
    expect(toml).toContain('[projects."/repo"]');
    expect(toml).toContain('trust_level = "trusted"');
  });

  it("reads latest installed Codex plugin version from cache dirs", () => {
    const root = mkdtempSync(join(tmpdir(), "cf-codex-plugin-"));
    const manifestDir = join(root, "0.35.2", ".codex-plugin");
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(
      join(manifestDir, "plugin.json"),
      JSON.stringify({ version: "0.35.2" }),
    );

    expect(getCodexInstalledVersion(root)).toBe("0.35.2");
  });

  it("deploys TOML agents", () => {
    const root = mkdtempSync(join(tmpdir(), "cf-codex-agents-"));
    const source = join(root, "source");
    const target = join(root, "target");
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, "cf-example.toml"), 'name = "cf-example"\n');
    writeFileSync(join(source, "ignore.md"), "# ignore\n");

    expect(deployCodexAgents(source, target)).toBe(1);
    expect(readFileSync(join(target, "cf-example.toml"), "utf8")).toContain(
      "cf-example",
    );
  });
});
