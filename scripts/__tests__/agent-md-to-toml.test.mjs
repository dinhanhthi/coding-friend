import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { agentMarkdownToToml } = require("../lib/agent-md-to-toml.js");

test("converts markdown agent frontmatter and body to TOML", () => {
  const toml = agentMarkdownToToml(`---
name: cf-example
description: >
  Example agent for conversion tests.
model: sonnet
tools: Read, Write, Bash
---

# Instructions

Use the project context.
`);

  assert.match(toml, /name = "cf-example"/);
  assert.match(toml, /description = "Example agent for conversion tests\."/);
  assert.match(toml, /model = "sonnet"/);
  assert.match(toml, /tools = \["Read", "Write", "Bash"\]/);
  assert.match(
    toml,
    /developer_instructions = '''\n# Instructions\n\nUse the project context\.\n'''/,
  );
});

test("supports a renderText transform before TOML conversion", () => {
  const toml = agentMarkdownToToml(
    `---
name: cf-example
description: Example
---

Use {{cf:slash cf-review}}.
`,
    {
      renderText: (value) =>
        value.replace("{{cf:slash cf-review}}", "$cf-review"),
    },
  );

  assert.match(toml, /\$cf-review/);
});
