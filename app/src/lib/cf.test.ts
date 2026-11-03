import { describe, expect, it } from "vitest";

import {
  INSTALL_COMMAND,
  RUNNABLE_FIXES,
  UPDATE_COMMAND,
  configFields,
  encodeConfigValue,
  isCopyableCommand,
  isRunStarted,
  isRunnableFix,
  memoryRebuildCommand,
  shellQuote,
  splitFrontmatter,
  valueSource,
  type ConfigField,
  type ConfigFullView,
} from "./cf";

describe("isCopyableCommand", () => {
  it.each([
    "cf mcp",
    "cf memory start-daemon",
    "cf install --user",
    INSTALL_COMMAND,
    UPDATE_COMMAND,
  ])("accepts %s", (hint) => {
    expect(isCopyableCommand(hint)).toBe(true);
  });

  it.each([
    "/cf-learn",
    "Upgrade codex to >= 0.161",
    "cf mcp; rm -rf ~",
    "cf $(x)",
    "cf mcp\nrm -rf ~",
  ])("rejects %j", (hint) => {
    expect(isCopyableCommand(hint)).toBe(false);
  });
});

describe("shellQuote", () => {
  it("keeps $(...), backticks and quotes inert in one single-quoted word", () => {
    expect(shellQuote("/a/x$(touch pwned)`id`'y")).toBe(
      "'/a/x$(touch pwned)`id`'\\''y'",
    );
  });
});

describe("memoryRebuildCommand", () => {
  it("quotes the project root so a pasted hint runs only cf memory rebuild", () => {
    expect(memoryRebuildCommand("/p/it's $(rm -rf ~)")).toBe(
      "cd '/p/it'\\''s $(rm -rf ~)' && cf memory rebuild",
    );
  });
});

describe("isRunnableFix", () => {
  it.each(RUNNABLE_FIXES.map((fix) => [fix]))("accepts %j", (argv) => {
    expect(isRunnableFix(argv)).toBe(true);
  });

  it.each([
    [["install", "supervisor", "--json"]],
    [["supervisor", "install", "--json", "--force"]],
    [["update", "--yes", "--json"]],
  ])("rejects %j", (argv) => {
    expect(isRunnableFix(argv)).toBe(false);
  });
});

describe("isRunStarted", () => {
  it.each([
    [{ op: "configSet", command: "cf config set --global" }],
    [{ op: "memoryEdit", command: "cf memory edit --json --stdin" }],
  ])("accepts %j", (payload) => {
    expect(isRunStarted(payload)).toBe(true);
  });

  it.each([[{ op: "rmRf", command: "cf x" }], [{ op: "configSet" }]])(
    "rejects %j",
    (payload) => {
      expect(isRunStarted(payload)).toBe(false);
    },
  );
});

describe("valueSource", () => {
  const view: ConfigFullView = {
    global: { review: { maxRounds: 3 }, language: "en" },
    local: { language: "vi" },
    effective: {},
    paths: { global: "/g", local: "/l" },
  };

  it.each([
    ["review.maxRounds", "local", "global"],
    ["autoCommit", "local", "default"],
    ["language", "local", "local"],
    ["language", "global", "global"],
  ] as const)("%s in %s scope comes from %s", (key, scope, source) => {
    expect(valueSource(key, view, scope)).toBe(source);
  });
});

describe("config editor contract", () => {
  const schema = {
    type: "object",
    properties: {
      learn: {
        type: "object",
        properties: {
          autoCommit: { type: "boolean" },
          readmeIndex: {
            anyOf: [
              { type: "boolean" },
              { type: "string", const: "per-category" },
            ],
          },
        },
      },
      aliases: { type: "object", additionalProperties: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
      language: { type: "string" },
    },
  };

  it("edits dotted leaf keys, never a parent object", () => {
    expect(configFields(schema)).toEqual([
      { key: "learn.autoCommit", kind: "boolean" },
      {
        key: "learn.readmeIndex",
        kind: "select",
        options: [true, false, "per-category"],
      },
      { key: "aliases", kind: "json" },
      { key: "tags", kind: "json" },
      { key: "language", kind: "string" },
    ]);
  });

  it.each([
    [{ key: "language", kind: "string" }, "true", '"true"'],
    [{ key: "n", kind: "number", integer: true }, " 3 ", "3"],
    [{ key: "tags", kind: "json" }, '[\n  "a"\n]', '["a"]'],
  ] as [ConfigField, string, string][])(
    "encodes %j %j as %j",
    (field, draft, value) => {
      expect(encodeConfigValue(field, draft)).toBe(value);
    },
  );

  it.each([
    [{ key: "tags", kind: "json" }, "[1,"],
    [{ key: "n", kind: "number", integer: true }, "1.5"],
  ] as [ConfigField, string][])("rejects %j %j", (field, draft) => {
    expect(() => encodeConfigValue(field, draft)).toThrow();
  });
});

describe("splitFrontmatter", () => {
  it("splits a leading frontmatter block off and keeps the body", () => {
    expect(
      splitFrontmatter("---\ntitle: A\ntags: [x]\n---\n# Body\n---\n"),
    ).toEqual({
      frontmatter: "title: A\ntags: [x]",
      body: "# Body\n---\n",
    });
  });

  it("leaves text without a leading block unchanged", () => {
    const text = "# Title\n\n---\nnot: frontmatter\n---\n";
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text });
  });
});
