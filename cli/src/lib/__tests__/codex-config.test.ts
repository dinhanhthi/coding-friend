import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deployCodexAgents,
  findCodexAgentSourceDir,
  getCodexInstalledVersion,
  isCodexMarketplaceRegistered,
  isCodexPluginDisabled,
  removeCodexMemoryMcpConfig,
  removeDeployedCodexAgents,
  setCodexPluginEnabled,
  trustCodexProject,
  writeCodexAgentLimits,
  writeCodexMemoryMcpConfig,
} from "../codex-config.js";

function tempFile(name = "config.toml"): string {
  const dir = mkdtempSync(join(tmpdir(), "cf-codex-config-"));
  return join(dir, name);
}

describe("codex-config", () => {
  afterEach(() => vi.unstubAllEnvs());

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
        "# user option",
        'custom = "kept"',
        "",
        "[other]",
        "value = 1",
        "",
      ].join("\n"),
    );

    setCodexPluginEnabled(false, file);
    const disabledToml = readFileSync(file, "utf8");
    expect(isCodexPluginDisabled(file)).toBe(true);
    expect(disabledToml).toContain('custom = "kept"');
    expect(disabledToml).toContain("[other]");
    expect(disabledToml.indexOf("# user option")).toBeLessThan(
      disabledToml.indexOf('custom = "kept"'),
    );
    expect(
      disabledToml.indexOf(
        '[plugins."coding-friend@coding-friend-marketplace"]',
      ),
    ).toBeLessThan(disabledToml.indexOf("[other]"));

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

  it("removes the memory MCP table while preserving unrelated TOML", () => {
    const file = tempFile();
    writeFileSync(file, '[model]\nname = "gpt-5"\n');
    writeCodexMemoryMcpConfig("/repo/docs/memory", file);

    expect(removeCodexMemoryMcpConfig(file)).toBe(true);
    const toml = readFileSync(file, "utf8");
    expect(toml).toContain("[model]");
    expect(toml).not.toContain("[mcp_servers.coding-friend-memory]");

    expect(removeCodexMemoryMcpConfig(file)).toBe(false);
  });

  it("removes only deployed cf-*.toml agents", () => {
    const dir = mkdtempSync(join(tmpdir(), "cf-codex-agents-"));
    writeFileSync(join(dir, "cf-explorer.toml"), 'name = "cf-explorer"\n');
    writeFileSync(join(dir, "cf-writer.toml"), 'name = "cf-writer"\n');
    writeFileSync(join(dir, "user-agent.toml"), 'name = "user-agent"\n');

    expect(removeDeployedCodexAgents(dir)).toBe(2);
    expect(readFileSync(join(dir, "user-agent.toml"), "utf8")).toContain(
      "user-agent",
    );
    expect(removeDeployedCodexAgents(dir)).toBe(0);
  });

  it("writes Codex agent depth without clobbering existing agent config", () => {
    const file = tempFile();
    writeFileSync(
      file,
      ["[agents]", "max_threads = 6", "", "[model]", 'name = "gpt-5"', ""].join(
        "\n",
      ),
    );

    writeCodexAgentLimits(file);

    const toml = readFileSync(file, "utf8");
    expect(toml).toContain("[agents]");
    expect(toml).toContain("max_depth = 2");
    expect(toml).toContain("max_threads = 6");
    expect(toml.indexOf("[agents]")).toBeLessThan(toml.indexOf("[model]"));
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

  it("prefers generated Codex agents over installed cache agents", () => {
    const root = mkdtempSync(join(tmpdir(), "cf-codex-agent-source-"));
    const codexHome = join(root, "codex-home");
    const generatedAgents = join(root, "plugin-codex", "agents");
    const installedAgents = join(
      codexHome,
      "plugins",
      "cache",
      "coding-friend-marketplace",
      "coding-friend",
      "0.35.2",
      "agents",
    );
    mkdirSync(generatedAgents, { recursive: true });
    mkdirSync(join(installedAgents, "..", ".codex-plugin"), {
      recursive: true,
    });
    mkdirSync(installedAgents, { recursive: true });
    writeFileSync(
      join(installedAgents, "..", ".codex-plugin", "plugin.json"),
      JSON.stringify({ version: "0.35.2" }),
    );
    vi.stubEnv("CODEX_HOME", codexHome);

    expect(findCodexAgentSourceDir(root)).toBe(generatedAgents);
  });

  it("falls back to installed Codex agents when generated agents are absent", () => {
    const root = mkdtempSync(join(tmpdir(), "cf-codex-agent-source-"));
    const codexHome = join(root, "codex-home");
    const installedRoot = join(
      codexHome,
      "plugins",
      "cache",
      "coding-friend-marketplace",
      "coding-friend",
      "0.35.2",
    );
    const installedAgents = join(installedRoot, "agents");
    mkdirSync(join(installedRoot, ".codex-plugin"), { recursive: true });
    mkdirSync(installedAgents, { recursive: true });
    writeFileSync(
      join(installedRoot, ".codex-plugin", "plugin.json"),
      JSON.stringify({ version: "0.35.2" }),
    );
    vi.stubEnv("CODEX_HOME", codexHome);

    expect(findCodexAgentSourceDir(root)).toBe(installedAgents);
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
