import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  extractInstallPrompt,
  legacyDocsHref,
  parseHosts,
  stripHeroContent,
} from "../landing";

const indexMd = readFileSync(
  resolve(__dirname, "../../content/index.md"),
  "utf-8",
);

test("an old home-page anchor that is not on the landing goes to /docs", () => {
  assert.equal(legacyDocsHref("#memory", false), "/docs/#memory");
  assert.equal(legacyDocsHref("#auto-approve", false), "/docs/#auto-approve");
});

test("an anchor that exists on the landing, or no anchor, stays put", () => {
  assert.equal(legacyDocsHref("#get-started", true), null);
  assert.equal(legacyDocsHref("", false), null);
  assert.equal(legacyDocsHref("#", false), null);
});

test("parseHosts reads name, link, support and command from the table", () => {
  const source = [
    "## 🤝 Supported Tools",
    "",
    "| Host | Support | Command | Notes |",
    "| ---- | ------- | ------- | ----- |",
    "| [Claude Code](https://claude.com/x) | 100% | `cf install` | Default. |",
    "| [Codex](https://openai.com/codex/) | 77%  | `cf install --agent codex` | Beta. |",
    "",
    "## 📦 Install",
    "| [Not](https://a.b) | 1% | `x` | y |",
  ].join("\n");

  assert.deepEqual(parseHosts(source), [
    {
      name: "Claude Code",
      href: "https://claude.com/x",
      support: 100,
      command: "cf install",
      notes: "Default.",
    },
    {
      name: "Codex",
      href: "https://openai.com/codex/",
      support: 77,
      command: "cf install --agent codex",
      notes: "Beta.",
    },
  ]);
});

test("parseHosts finds every host in the real index.md", () => {
  const hosts = parseHosts(indexMd);
  assert.ok(hosts.length >= 5, `only ${hosts.length} hosts parsed`);
  assert.equal(hosts[0].name, "Claude Code");
  assert.equal(hosts[0].support, 100);
  for (const host of hosts) {
    assert.ok(host.support > 0 && host.support <= 100, host.name);
  }
});

test("extractInstallPrompt returns the agent prompt as plain text", () => {
  const prompt = extractInstallPrompt(indexMd);
  assert.ok(prompt.startsWith("Install Coding Friend from https://"), prompt);
  assert.ok(!prompt.includes("**"));
  assert.ok(!prompt.includes("`"));
});

test("stripHeroContent drops the leading title and tagline only", () => {
  assert.equal(stripHeroContent("# T\n\n_tag_\n\nBody"), "Body");
  assert.equal(stripHeroContent("Body"), "Body");
});
