import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { agentMarkdownToToml } = require("../lib/agent-md-to-toml.js");

test("converts Claude model tiers to Codex reasoning effort", () => {
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
  assert.match(toml, /model_reasoning_effort = "medium"/);
  assert.doesNotMatch(toml, /^model =/m);
  assert.doesNotMatch(toml, /^tools =/m);
  assert.match(
    toml,
    /developer_instructions = '''\n# Instructions\n\nUse the project context\.\n'''/,
  );
});

test("inherits the parent model for the Claude inherit tier", () => {
  const toml = agentMarkdownToToml(`---
name: cf-example
description: Example
model: inherit
---

Use the project context.
`);

  assert.doesNotMatch(toml, /^model =/m);
  assert.doesNotMatch(toml, /^model_reasoning_effort =/m);
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
