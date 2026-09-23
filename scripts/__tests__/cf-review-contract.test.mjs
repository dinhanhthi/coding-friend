/**
 * Contract tests for the flat cf-review topology (plan task 2.1).
 *
 * cf-reviewer used to be an orchestrator that fanned out to 5 specialists plus
 * a reducer. It is now the reviewer itself: one agent, five layers, depth
 * chosen by the `mode` the caller passes. These tests assert that contract on
 * the agent markdown so the topology cannot silently regress.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { test } from "node:test";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const read = (relPath) => fs.readFileSync(path.join(repoRoot, relPath), "utf8");

const reviewer = read("plugin/agents/cf-reviewer.md");
const security = read("plugin/agents/cf-reviewer-security.md");

const REVIEWERS = [
  ["cf-reviewer.md", reviewer],
  ["cf-reviewer-security.md", security],
];

// Agents that left cf-review's default path. They stay in the repo and stay
// directly callable — they just must not be dispatched from inside a reviewer.
const FANOUT_AGENTS = [
  "cf-reviewer-plan",
  "cf-reviewer-security",
  "cf-reviewer-quality",
  "cf-reviewer-tests",
  "cf-reviewer-rules",
  "cf-reviewer-reducer",
];

function frontmatter(markdown) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  assert.ok(match, "agent file is missing YAML frontmatter");
  return match[1];
}

function body(markdown) {
  return markdown.slice(/^---\n[\s\S]*?\n---\n/.exec(markdown)[0].length);
}

function tools(markdown) {
  const line = /^tools:\s*(.+)$/m.exec(frontmatter(markdown));
  assert.ok(line, "agent frontmatter is missing a tools: line");
  return line[1]
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);
}

/** Text from `heading` up to the next heading of the same or higher level. */
function section(markdown, heading) {
  const level = /^#+/.exec(heading)[0].length;
  const start = markdown.indexOf(`\n${heading}`);
  assert.notEqual(start, -1, `missing section heading: ${heading}`);
  const rest = markdown.slice(start + heading.length + 1);
  const next = new RegExp(`\\n#{1,${level}} `).exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

test("reviewer agents keep read-only tools and no Agent tool", () => {
  for (const [name, markdown] of REVIEWERS) {
    assert.deepEqual(
      tools(markdown),
      ["Read", "Glob", "Grep", "Bash"],
      `${name} must expose exactly the read-only tool set (no Agent)`,
    );
  }
});

test("reviewer agents never dispatch other agents", () => {
  for (const [name, markdown] of REVIEWERS) {
    const self = name.replace(/\.md$/, "");
    for (const agent of FANOUT_AGENTS) {
      if (agent === self) continue;
      assert.ok(
        !markdown.includes(agent),
        `${name} still names ${agent} — reviewers must not dispatch specialists or a reducer`,
      );
    }
    assert.ok(
      !/subagent_type/.test(markdown),
      `${name} still references subagent_type`,
    );
    assert.match(
      markdown,
      /never (dispatch|spawn|launch)/i,
      `${name} must state that it never dispatches sub-agents`,
    );
  }
});

test("cf-reviewer description no longer advertises orchestration", () => {
  const description = frontmatter(reviewer);
  assert.ok(
    !/orchestrat/i.test(description),
    "cf-reviewer description still calls itself an orchestrator",
  );
  assert.ok(
    !/specialist/i.test(description),
    "cf-reviewer description still mentions specialist agents",
  );
  assert.ok(
    !/reducer/i.test(description),
    "cf-reviewer description still mentions a reducer",
  );
  assert.match(
    frontmatter(reviewer),
    /^model: inherit$/m,
    "cf-reviewer must keep model: inherit",
  );
});

test("cf-reviewer checklist covers all five review layers", () => {
  const checklist = section(reviewer, "## Review Checklist");
  const layers = [
    [/\[L0\]/, /project rules/i],
    [/\[L1\]/, /plan alignment/i],
    [/\[L2\]/, /correctness/i],
    [/\[L3: Security\]/, /security/i],
    [/\[L4\]/, /tests?/i],
  ];
  for (const [tag, label] of layers) {
    assert.match(checklist, tag, `checklist is missing layer tag ${tag}`);
    assert.match(checklist, label, `checklist is missing layer ${label}`);
  }
});

test("cf-reviewer only reviews a plan the caller supplied", () => {
  const planLayer = section(reviewer, "## Review Checklist");
  assert.match(
    planLayer,
    /caller/i,
    "plan alignment must depend on a caller-supplied plan",
  );
  assert.match(
    reviewer,
    /never .*(mtime|most recent|newest|latest)/i,
    "cf-reviewer must explicitly forbid hunting for the latest plan",
  );
});

test("cf-reviewer defines three mode branches with different depth", () => {
  const quick = section(reviewer, "### QUICK");
  const standard = section(reviewer, "### STANDARD");
  const deep = section(reviewer, "### DEEP");

  assert.match(quick, /skip/i, "QUICK must skip layers");
  assert.match(quick, /plan alignment/i, "QUICK must skip plan alignment");
  assert.match(
    quick,
    /data-flow tracing/i,
    "QUICK must skip data-flow tracing",
  );
  assert.match(
    quick,
    /at most 5 (context )?files/i,
    "QUICK must cap context files at 5 beyond the diff",
  );

  assert.match(standard, /all five/i, "STANDARD must run all five layers");

  assert.match(deep, /all five/i, "DEEP must run all five layers");
  assert.match(deep, /trac/i, "DEEP must add path tracing");
});

test("cf-reviewer accepts a clean report with zero findings", () => {
  assert.ok(
    !/empty review is never valid/i.test(reviewer),
    "cf-reviewer still forbids an empty review",
  );
  assert.ok(
    !/at least one finding/i.test(reviewer),
    "cf-reviewer still requires at least one finding",
  );
  assert.match(
    reviewer,
    /zero findings is a valid/i,
    "cf-reviewer must state that zero findings is a valid result",
  );
  assert.match(
    reviewer,
    /praise is not a suggestion/i,
    "cf-reviewer must forbid praise-as-Suggestion padding",
  );
  assert.match(
    reviewer,
    /never pad/i,
    "cf-reviewer must forbid padding findings to fill a quota",
  );
});

test("cf-reviewer findings stay in scope, cited and confident", () => {
  assert.match(reviewer, /file:line/, "findings must cite file:line");
  assert.match(
    reviewer,
    /confidence ≥ ?0\.8/i,
    "findings need confidence ≥ 0.8",
  );
  assert.match(
    reviewer,
    /(inside|within) the (given |reviewed )?scope/i,
    "findings must be limited to the reviewed scope",
  );
});

test("reviewer agents keep their read-only execution rules", () => {
  for (const [name, markdown] of REVIEWERS) {
    const text = body(markdown);
    assert.match(
      text,
      /never write files/i,
      `${name} must forbid writing files`,
    );
    assert.match(
      text,
      /build, test, typecheck, lint, format, or install/i,
      `${name} must forbid build/test/lint/install commands`,
    );
  }
});

/* ---------------------------------------------------------------------------
 * cf-review dispatch contract (plan task 2.2)
 *
 * The main agent dispatches reviewers directly: a flat 1/1/2 graph with no
 * explorer, no reducer and no grandchildren, and a bounded context payload.
 * ------------------------------------------------------------------------ */

const skill = read("plugin/skills/cf-review/SKILL.md");
const DISPATCH_HEADING = "### Step 6: Dispatch the reviewer(s)";

test("cf-review dispatches exactly 1 / 1 / 2 reviewers for QUICK / STANDARD / DEEP", () => {
  const dispatch = section(skill, DISPATCH_HEADING);
  const rows = [
    ...dispatch.matchAll(
      /^\|\s*\*\*(QUICK|STANDARD|DEEP)\*\*\s*\|\s*(\d+)\s*\|([^|]*)\|/gm,
    ),
  ];
  assert.deepEqual(
    rows.map((row) => [row[1], Number(row[2])]),
    [
      ["QUICK", 1],
      ["STANDARD", 1],
      ["DEEP", 2],
    ],
    "Step 6 must declare a dispatch count per mode: 1 / 1 / 2",
  );

  const [quick, standard, deep] = rows.map((row) => row[3]);
  assert.match(quick, /cf-reviewer/, "QUICK dispatches cf-reviewer");
  assert.ok(
    !/cf-reviewer-security/.test(quick),
    "QUICK must not dispatch the security reviewer",
  );
  assert.match(standard, /cf-reviewer/, "STANDARD dispatches cf-reviewer");
  assert.ok(
    !/cf-reviewer-security/.test(standard),
    "STANDARD must not dispatch the security reviewer",
  );
  assert.match(deep, /cf-reviewer/, "DEEP dispatches cf-reviewer");
  assert.match(
    deep,
    /cf-reviewer-security/,
    "DEEP dispatches cf-reviewer-security too",
  );
});

test("cf-review default path uses neither cf-explorer nor a reducer", () => {
  assert.ok(
    !skill.includes("cf-explorer"),
    "cf-review must not dispatch cf-explorer for context gathering",
  );
  assert.ok(
    !skill.includes("cf-reviewer-reducer"),
    "cf-review must merge inline, not via cf-reviewer-reducer",
  );
});

test("cf-review DEEP dispatches both reviewers itself, in parallel", () => {
  const dispatch = section(skill, DISPATCH_HEADING);
  assert.match(
    dispatch,
    /single message/i,
    "DEEP must send both dispatches in a single message",
  );
  assert.match(dispatch, /parallel/i, "DEEP dispatches run in parallel");
  assert.match(
    dispatch,
    /you dispatch every reviewer yourself/i,
    "the main agent owns every dispatch",
  );
  assert.match(
    dispatch,
    /(no grandchildren|never dispatch)/i,
    "the dispatch graph must be flat — reviewers spawn nothing",
  );
});

test("cf-review passes a bounded context payload", () => {
  const dispatch = section(skill, DISPATCH_HEADING);
  for (const field of [
    /\*\*Review mode:\*\*/,
    /\*\*Diff:\*\*/,
    /\*\*Changed files:\*\*/,
    /\*\*Deadline:\*\*/,
  ]) {
    assert.match(dispatch, field, `dispatch payload is missing ${field}`);
  }
  assert.match(
    dispatch,
    /\*\*Plan:\*\*[^\n]*only if/i,
    "the plan is passed only when the caller explicitly supplied one",
  );
  assert.match(
    dispatch,
    /\*\*Verification:\*\*/,
    "dispatch payload carries any verification summary already at hand",
  );
  assert.match(
    dispatch,
    /never paste the whole conversation or a full file tree/i,
    "the skill must forbid dumping the conversation or the file tree",
  );
});

// The dispatch payload carries data only: "start from the changed hunks, open
// context only to confirm or kill a hypothesis" is the reviewer's own reading
// rule and lives in cf-reviewer.md `## Input`, so the payload no longer repeats
// it. The module-grouping and don't-skip-test-files rules are *not* in any agent
// file and both DEEP reviewers need them, so they stay in the payload.
test("the reviewer agent states its own reading strategy", () => {
  const input = section(reviewer, "## Input");
  assert.match(input, /changed hunks/i, "read the changed hunks first");
  assert.match(
    input,
    /hypothesis/i,
    "context and callers are opened only to test a hypothesis",
  );
});

test("cf-review states the large-diff reading strategy in the dispatch prompt", () => {
  const dispatch = section(skill, DISPATCH_HEADING);
  assert.match(
    dispatch,
    /group .*by module/i,
    "a large diff is grouped by module inside one reviewer",
  );
  assert.match(dispatch, /covered/i, "report covered groups");
  assert.match(dispatch, /remaining/i, "report remaining groups");
  assert.match(
    dispatch,
    /per file or per chunk/i,
    "never dispatch one reviewer per file or per chunk",
  );
  assert.match(
    dispatch,
    /generated/i,
    "generated sources are checked, not skipped",
  );
  assert.match(
    dispatch,
    /test files/i,
    "test files and config are not skipped when behavior changed",
  );
});

test("cf-review keeps its flags and external-reviewer behavior", () => {
  assert.match(skill, /`--deep` \/ `--quick`/, "--quick/--deep must survive");
  assert.match(
    skill,
    /`--with-codex`\/`--codex`/,
    "Codex opt-in flag must survive",
  );
  assert.match(
    skill,
    /`--out` → `out=true` \(exclusive with agent flags\)/,
    "--out exclusivity must survive",
  );
  assert.match(
    skill,
    /do not spawn `--claude` when `HOST` is `claude`/,
    "the host-match no-op must survive",
  );
  assert.match(
    skill,
    /Default target only — file path or commit range disables all external reviewers\./,
    "external reviewers stay limited to the default target",
  );
});

/* ---------------------------------------------------------------------------
 * Merge & report contract (plan task 2.3)
 *
 * The main agent merges every source inline and the report must say, in one
 * machine-readable line, whether the required coverage actually happened.
 * The fixtures below pin the emitted shape; the `contract` regexes pin the
 * rule that produces it, so neither can drift without the other.
 * ------------------------------------------------------------------------ */

const externals = read(
  "plugin/skills/cf-review/references/external-reviewers.md",
);

const CONTRACT_HEADING = "## Report contract";
const contract = () => section(skill, CONTRACT_HEADING);

/** The exact line task 3.1's consumers parse before they count findings. */
const STATUS_LINE = /^Review status: (COMPLETE|PARTIAL|FAILED)(?: — .+)?$/m;

const HEADINGS = [
  "### 🚨 Critical Issues",
  "### ⚠️ Important Issues",
  "### 💡 Suggestions",
  "### 📋 Summary",
];

function buildReport({
  critical = [],
  important = [],
  suggestions = [],
  summary,
}) {
  const list = (items) =>
    items.length ? items.map((item) => `- ${item}`).join("\n") : "None.";
  return [
    "## 🔍 Code Review: fixture (STANDARD mode)",
    "",
    HEADINGS[0],
    list(critical),
    "",
    HEADINGS[1],
    list(important),
    "",
    HEADINGS[2],
    list(suggestions),
    "",
    HEADINGS[3],
    summary,
  ].join("\n");
}

/** Bullets under one emoji heading of a fixture report. */
function findings(report, heading) {
  const start = report.indexOf(heading) + heading.length;
  const rest = report.slice(start);
  const end = rest.search(/\n### /);
  return (end === -1 ? rest : rest.slice(0, end))
    .split("\n")
    .filter((line) => line.startsWith("- "));
}

const REPORT_CASES = [
  {
    name: "a clean report with zero findings is still COMPLETE",
    report: buildReport({
      summary:
        "Scope: uncommitted (STANDARD). Native coverage: cf-reviewer complete.\nReview status: COMPLETE",
    }),
    status: "COMPLETE",
    expect: (report) => {
      assert.equal(findings(report, HEADINGS[0]).length, 0);
      assert.match(report, /None\./);
    },
    contract: [
      /zero findings is a valid/i,
      /COMPLETE means[^.]*native coverage finished[^.]*does not mean/i,
    ],
  },
  {
    name: "the same file:line with the same root cause merges into one finding, highest severity wins",
    report: buildReport({
      critical: [
        "[src/auth.ts:42] Unvalidated token reaches the query — severity kept from the highest source (confidence: 0.9) [in-session][Codex]",
      ],
      summary: "Review status: COMPLETE",
    }),
    status: "COMPLETE",
    expect: (report) => {
      assert.equal(findings(report, HEADINGS[0]).length, 1);
      assert.equal(findings(report, HEADINGS[1]).length, 0);
      assert.match(report, /\[in-session\]\[Codex\]/);
    },
    contract: [
      /same `?file:line`? \*?\*?and\*?\*? the same root cause/i,
      /highest severity/i,
      /provenance|tag each contributing source/i,
      /(repetition is not evidence|does not raise|never raise)/i,
    ],
  },
  {
    name: "two distinct issues on the same line stay two findings",
    report: buildReport({
      critical: ["[src/auth.ts:42] Unvalidated token reaches the query"],
      important: ["[src/auth.ts:42] Error path leaks the token into the log"],
      summary: "Review status: COMPLETE",
    }),
    status: "COMPLETE",
    expect: (report) => {
      assert.equal(findings(report, HEADINGS[0]).length, 1);
      assert.equal(findings(report, HEADINGS[1]).length, 1);
    },
    contract: [/two different issues on the same line stay/i],
  },
  {
    name: "a reviewer that times out downgrades to PARTIAL but its early findings are kept",
    report: buildReport({
      critical: ["[src/auth.ts:42] Unvalidated token reaches the query"],
      summary:
        "Native coverage: cf-reviewer timed out after returning the findings above; api/ and cli/ were not reached.\nReview status: PARTIAL — api/, cli/ not reviewed",
    }),
    status: "PARTIAL",
    expect: (report) => {
      assert.equal(findings(report, HEADINGS[0]).length, 1);
    },
    contract: [
      /timed out/i,
      /(findings [^.\n]*returned before|keep what arrived)/i,
      /downgrades the status, never the findings/i,
    ],
  },
  {
    name: "a missing native report with no other native coverage is FAILED",
    report: buildReport({
      summary:
        "Native coverage: cf-reviewer returned nothing. No native report arrived.\nReview status: FAILED — nothing was reviewed",
    }),
    status: "FAILED",
    contract: [/no valid native report/i, /missing|returned nothing/i],
  },
  {
    name: "an unparseable report is quoted as unverified, never as findings",
    report: buildReport({
      summary:
        'Native coverage: cf-reviewer-security returned unparseable output, quoted below.\n> "looks fine mostly" (unverified)\nReview status: PARTIAL — security layer unverified',
    }),
    status: "PARTIAL",
    expect: (report) => {
      assert.equal(findings(report, HEADINGS[0]).length, 0);
      assert.match(report, /\(unverified\)/);
    },
    contract: [/unparseable/i, /\(unverified\)/, /never (be )?promoted/i],
  },
  {
    name: "a failed external source is a warning only — native coverage stays sufficient",
    report: buildReport({
      summary:
        "Native coverage: cf-reviewer complete.\nExternal sources: Gemini unavailable (not on PATH) — warning only.\nReview status: COMPLETE",
    }),
    status: "COMPLETE",
    contract: [
      /external source[^.]*never substitute/i,
      /leaves the status unchanged|never downgrade/i,
    ],
  },
  {
    name: "scope_complete=false surfaces as uncovered scope, never as clean",
    report: buildReport({
      summary:
        "Uncovered scope: 2 files under `=== Excluded from review scope (NOT reviewed) ===` were unreadable.\nReview status: PARTIAL — 2 files excluded from the snapshot",
    }),
    status: "PARTIAL",
    contract: [/scope_complete=false|`?SCOPE_COMPLETE`?=false/i, /exit `3`/],
  },
];

for (const testCase of REPORT_CASES) {
  test(`report contract: ${testCase.name}`, () => {
    for (const heading of HEADINGS) {
      assert.ok(
        testCase.report.includes(heading),
        `fixture is missing ${heading}`,
      );
    }
    const match = STATUS_LINE.exec(testCase.report);
    assert.ok(match, "fixture Summary has no parseable `Review status:` line");
    assert.equal(match[1], testCase.status);
    testCase.expect?.(testCase.report);
    for (const rule of testCase.contract) {
      assert.match(
        contract(),
        rule,
        `${CONTRACT_HEADING} does not cover: ${rule}`,
      );
    }
  });
}

test("the report contract documents the exact status line consumers parse", () => {
  const text = contract();
  assert.match(
    text,
    /`Review status: COMPLETE \| PARTIAL \| FAILED`/,
    "the contract must show the literal status-line template",
  );
  assert.ok(
    STATUS_LINE.test("Review status: PARTIAL — api/ not reviewed"),
    "the documented grammar must accept a trailing reason",
  );
  assert.match(
    text,
    /(before they count findings|never reword|never omit)/i,
    "the contract must pin the line as machine-readable",
  );
  assert.match(
    text,
    /exactly one `Review status:` line/i,
    "a merged report carries one status line — the aggregate, not each reviewer's",
  );
  assert.match(
    text,
    /fold(ed)? into \*\*Native coverage\*\*/i,
    "each reviewer's self-reported status is folded into Native coverage",
  );
  for (const heading of HEADINGS) {
    assert.ok(text.includes(heading), `the contract must keep ${heading}`);
  }
});

test("the merged report is produced inline, with no merge agent", () => {
  const text = contract();
  assert.match(text, /\*\*You\*\* merge/i, "the main agent merges inline");
  assert.match(
    text,
    /no merge agent/i,
    "the contract must forbid dispatching a merge agent",
  );
  assert.match(
    section(skill, "### Step 7: Collect the report"),
    new RegExp(CONTRACT_HEADING.replace("## ", "")),
    "Step 7 must point at the shared report contract",
  );
});

test("scope staleness downgrades to PARTIAL and never loops", () => {
  const text = contract();
  assert.match(text, /stale/i, "the contract must handle a stale scope");
  assert.match(text, /head_sha/, "staleness is checked against the snapshot");
  assert.match(
    text,
    /at most once/i,
    "a re-review happens at most once — never loop",
  );
  assert.match(
    text,
    /never loop/i,
    "the contract must forbid looping on a changing scope",
  );
});

test("reviewer agents self-report a two-valued status in their Summary", () => {
  for (const [name, markdown] of REVIEWERS) {
    assert.match(
      markdown,
      /Review status: COMPLETE \| PARTIAL/,
      `${name} must end its Summary with a self-reported status`,
    );
    assert.ok(
      !/FAILED/.test(markdown),
      `${name} reports COMPLETE|PARTIAL only — FAILED is the main agent's aggregate`,
    );
  }
});

test("Step 6 asks reviewers for the status line", () => {
  const dispatch = section(skill, DISPATCH_HEADING);
  assert.match(
    dispatch,
    /Review status: (COMPLETE|PARTIAL)/,
    "the dispatch prompt must request the status line",
  );
});

test("an incomplete review never gets the success banner", () => {
  const final = section(skill, "### Step 10: Final output");
  assert.match(
    final,
    /✅ Code Review Complete`? only when/i,
    "the ✅ banner is reserved for Review status: COMPLETE",
  );
  assert.match(
    final,
    /PARTIAL/,
    "Step 10 must name the PARTIAL case in its banner rules",
  );
});

test("external-reviewers.md repeats the status rule for external sources", () => {
  assert.match(
    externals,
    /Review status/,
    "the external reference must mention the report status",
  );
  assert.match(
    externals,
    /never substitute/i,
    "an external report can never substitute for a missing native reviewer",
  );
});

// Phase 2 review findings — the skill, the agent, and the generated hosts must
// agree on depth and on who owns the final Summary.

test("QUICK depth is defined once — by the reviewer agent, not by the skill", () => {
  const skill = read("plugin/skills/cf-review/SKILL.md");
  const agent = reviewer;
  // The agent runs four of five layers in QUICK (only plan alignment and
  // data-flow tracing are dropped). The skill used to restate that depth in a
  // "Behavior" column, which could drift from the agent (a skill table saying
  // "Layer 3 only" would under-review every QUICK change). The skill now only
  // *selects* the mode and passes it through, so the invariant is: the agent
  // states the depth, and the skill states no depth of its own.
  assert.match(
    agent,
    /### QUICK[\s\S]*?Layers L0, L2, L3, L4/,
    "agent QUICK must list L0/L2/L3/L4",
  );
  // Covers every layer spelling, L3 and "Layer 3" included: the drift this
  // guards against is a skill row re-declaring QUICK as security-only, which
  // an L0/L1/L2/L4-only pattern would wave through.
  assert.doesNotMatch(
    skill,
    /\bL[0-4]\b|\bLayer\s+\d/,
    "the skill must not restate reviewer layer depth — cf-reviewer.md owns it",
  );
  assert.match(
    section(skill, "### Step 3: Assess change size"),
    /Use `MODE` as-is/,
    "the skill passes the resolved mode through instead of interpreting it",
  );
});

test("generated hosts are not told to skip the report contract", () => {
  for (const generated of [
    "plugin-codex/skills/cf-review/SKILL.md",
    "plugin-antigravity/skills/cf-review/SKILL.md",
  ]) {
    const text = read(generated);
    assert.ok(
      text.includes("## Report contract"),
      `${generated} must ship the report contract`,
    );
    // The host builders replace Step 7 wholesale. If that replacement says the
    // Step 6 output is final and must be used as-is, the aggregate
    // `Review status:` line never gets written on those hosts and the Step 10
    // banner gate cannot work.
    assert.doesNotMatch(
      text,
      /Do not reformat or restructure it; use it as-is/,
      `${generated} must not tell the main agent to bypass the report contract`,
    );
  }
});

/* ---------------------------------------------------------------------------
 * Native dispatch lifecycle & consumer gates (plan task 3.1)
 *
 * Step 6's dispatches need a bounded lifecycle, and the autopilot consumers
 * must read the aggregate `Review status:` line BEFORE they count findings —
 * an empty Critical/Important section is not a pass on its own.
 * ------------------------------------------------------------------------ */

const autopilot = read("plugin/skills/cf-plan/modes/autopilot.md");
const execute = read("plugin/skills/cf-plan/modes/execute.md");
const tddLoop = read("plugin/skills/cf-tdd/modes/autopilot-loop.md");

const CONSUMERS = [
  ["cf-plan/modes/autopilot.md", autopilot],
  ["cf-plan/modes/execute.md", execute],
  ["cf-tdd/modes/autopilot-loop.md", tddLoop],
];

/** The AUTOPILOT CONTRACT block copied verbatim into every generated plan. */
function autopilotContractBlock() {
  const match = /```markdown\n([\s\S]*?)\n```/.exec(autopilot);
  assert.ok(
    match,
    "autopilot.md must keep the copied AUTOPILOT CONTRACT block",
  );
  assert.match(
    match[1],
    /## AUTOPILOT/,
    "the fenced block must be the AUTOPILOT CONTRACT",
  );
  return match[1];
}

/** Every consumer gate states the same rule, wherever it is copied. */
function assertStatusGate(text, label) {
  assert.match(
    text,
    /Review status:/,
    `${label} must name the exact line it parses`,
  );
  assert.match(
    text,
    /COMPLETE/,
    `${label} must say that only COMPLETE proceeds to the severity count`,
  );
  assert.match(text, /PARTIAL/, `${label} must handle PARTIAL`);
  assert.match(text, /FAILED/, `${label} must handle FAILED`);
  assert.match(text, /missing/i, `${label} must handle a missing status line`);
  assert.match(
    text,
    /unparseable/i,
    `${label} must handle an unparseable status line`,
  );
  assert.match(
    text,
    /STOP/,
    `${label} must stop instead of committing on a non-COMPLETE status`,
  );
  assert.match(
    text,
    /never (infer|treat).{0,40}clean|absence of findings/i,
    `${label} must forbid inferring clean from an absence of findings`,
  );
}

for (const [label, text] of CONSUMERS) {
  test(`${label} reads Review status: before it counts findings`, () => {
    assertStatusGate(text, label);
  });
}

test("the autopilot consumers gate before the severity count, not after", () => {
  for (const [label, text] of [
    ["cf-plan/modes/autopilot.md", autopilot],
    ["cf-tdd/modes/autopilot-loop.md", tddLoop],
  ]) {
    const gate = text.indexOf("Review status:");
    const count = text.indexOf("🚨");
    assert.notEqual(gate, -1, `${label} has no status gate`);
    assert.notEqual(count, -1, `${label} has no severity count`);
    assert.ok(
      gate < count,
      `${label} counts findings before it reads the status line`,
    );
  }
});

test("zero findings never passes the gate on its own", () => {
  for (const [label, text] of CONSUMERS) {
    assert.ok(
      !/If that review is clean \(only Suggestions\/Summary\)/.test(text),
      `${label} still treats "only Suggestions/Summary" as clean without a status check`,
    );
  }
  assert.match(
    autopilot,
    /Review status: `?COMPLETE`?[^\n]*(no |zero )?(Critical|🚨)/i,
    "autopilot.md must define a clean review as COMPLETE plus no Critical/Important",
  );
});

test("the copied AUTOPILOT CONTRACT block carries the same gate", () => {
  const block = autopilotContractBlock();
  assertStatusGate(block, "the copied AUTOPILOT CONTRACT block");
  const gate = block.indexOf("Review status:");
  const count = block.indexOf("🚨");
  assert.ok(
    gate !== -1 && count !== -1 && gate < count,
    "the copied block must read the status line before counting findings",
  );
  assert.match(
    block,
    /Stop conditions[\s\S]*Review status/,
    "a non-COMPLETE review status must be a listed stop condition",
  );
});

test("execute.md defines a passing review as Review status: COMPLETE", () => {
  const post = section(execute, "#### Post-implementation");
  assert.match(
    post,
    /Review status: `?COMPLETE`?/,
    "execute.md must define review success by the status line, not by silence",
  );
});

test("Step 6 gives every native dispatch a bounded lifecycle", () => {
  const dispatch = section(skill, DISPATCH_HEADING);
  for (const state of ["pending", "running", "complete", "failed"]) {
    assert.match(
      dispatch,
      new RegExp(`\`${state}\``),
      `missing state ${state}`,
    );
  }
  assert.match(
    dispatch,
    /`timed_out`/,
    "the lifecycle must name the timed_out state literally",
  );
  for (const field of [/job id/i, /start time/i, /deadline/i, /coverage/i]) {
    assert.match(dispatch, field, `per-job tracking is missing ${field}`);
  }
  assert.match(
    dispatch,
    /at most 60 ?s(econds)?/i,
    "each wait step must be bounded at 60s when the host supports it",
  );
  assert.match(
    dispatch,
    /elapsed/i,
    "elapsed time must be checked after each wait",
  );
});

test("a heartbeat or retry never resets the native deadline", () => {
  const dispatch = section(skill, DISPATCH_HEADING);
  assert.match(
    dispatch,
    /heartbeat/i,
    "the lifecycle must say what a heartbeat does not do",
  );
  assert.match(
    dispatch,
    /never resets? the deadline/i,
    "a heartbeat or retry must never reset the deadline",
  );
  assert.match(
    dispatch,
    /never (auto-)?respawn/i,
    "a timed-out reviewer is never auto-respawned",
  );
  assert.match(dispatch, /forever/i, "no retry may run forever");
});

test("Step 6 spends the budget through the host's own status and cancel controls", () => {
  const dispatch = section(skill, DISPATCH_HEADING);
  assert.match(
    dispatch,
    /cancel/i,
    "use the host's cancellation when it has one",
  );
  assert.match(
    dispatch,
    /partial output/i,
    "when the budget runs out, ask for partial output first",
  );
  assert.match(
    dispatch,
    /merge what (already )?arrived/i,
    "whatever arrived before the deadline is still merged",
  );
  assert.match(
    dispatch,
    /shell `timeout`/,
    "shell timeout must be named as the wrong mechanism for a native dispatch",
  );
  assert.match(
    dispatch,
    /external subprocess/i,
    "shell timeout applies to external subprocesses only",
  );
});

test("a host without a timed wait or cancel gets an honest fallback, not a promise", () => {
  const dispatch = section(skill, DISPATCH_HEADING);
  assert.match(
    dispatch,
    /inline budgeted review/i,
    "with no timed wait and no cancel, review inline from the start",
  );
  assert.match(
    dispatch,
    /from the start/i,
    "the fallback is decided before dispatch, not after a hang",
  );
  assert.match(
    dispatch,
    /cannot be interrupted/i,
    "a single tool call that never returns control cannot be interrupted",
  );
  assert.match(
    dispatch,
    /contract tests verify the instruction[\s\S]{0,200}live run/i,
    "the limitation must be stated: tests verify the wording, a live run verifies enforcement",
  );
});

test("job states map onto the report contract's coverage words", () => {
  const dispatch = section(skill, DISPATCH_HEADING);
  assert.match(
    dispatch,
    /Native coverage/,
    "Step 6 must map its job states onto the Summary's Native coverage field",
  );
  assert.match(
    dispatch,
    /unparseable/i,
    "a failed job is reported as missing or unparseable coverage",
  );
});

test("cf-review no longer gates on the dead review marker", () => {
  assert.ok(
    !skill.includes("mark-reviewed"),
    "cf-review must not invoke mark-reviewed.sh — nothing reads that marker",
  );
  for (const generated of [
    "plugin-codex/skills/cf-review/SKILL.md",
    "plugin-antigravity/skills/cf-review/SKILL.md",
  ]) {
    assert.ok(
      !read(generated).includes("mark-reviewed"),
      `${generated} must not invoke the dead marker script either`,
    );
  }
  // The host builders anchor their Step 7 replacement on this exact heading.
  assert.ok(
    skill.includes("### Step 8: Mark review complete and display status"),
    "the Step 8 heading is a builder anchor — keep its text",
  );
  assert.match(
    section(skill, "### Step 8: Mark review complete and display status"),
    /Review status:/,
    "Step 8 must record completion through the status line, not a marker file",
  );
});

test("reviewer agents budget themselves because nothing can cancel them", () => {
  for (const [name, markdown] of REVIEWERS) {
    assert.match(
      markdown,
      /(cannot be|nothing can) (interrupt|cancel)/i,
      `${name} must say that nothing can cancel it once it starts`,
    );
    assert.match(
      markdown,
      /elapsed/i,
      `${name} must check its elapsed budget between steps`,
    );
  }
});

/* ---------------------------------------------------------------------------
 * Scope handoff to the external runners (plan task 3.2)
 *
 * The runners parse `--snapshot-dir` / `--uncommitted` (see
 * cf-review-runners.test.mjs); these tests pin the other half — that Step 2.5
 * actually passes them, and passes the Codex flag the Step 2 metadata calls
 * for. Without this, dropping a flag here leaves every test green while the
 * external reviewers re-gather a scope the in-session reviewers never saw.
 *
 * Note for whoever edits that section: `section()` ends a section at the next
 * line starting with `#`, so a bash comment at column 0 inside a fence cuts the
 * section short. Annotate those commands with trailing `# …` comments.
 * ------------------------------------------------------------------------ */

const SPAWN_HEADING =
  "### Step 2.5: Spawn Codex review in the background (only when `codex=true`)";

// The spawn commands and the has_committed rule moved out of SKILL.md into the
// conditional reference (plan task 5.0): a default `/cf-review` never spawns an
// external reviewer, so the skill keeps only the pointer and the reference owns
// the detail. These assertions follow the text — they still pin the same rules,
// in `## Codex scope` + `## Step 2.5 background`.
const spawnContract = () =>
  `${section(externals, "## Codex scope")}\n${section(externals, "## Step 2.5 background")}`;

test("cf-review Step 2.5 points at the external-reviewer reference", () => {
  const spawn = section(skill, SPAWN_HEADING);
  assert.match(
    spawn,
    /references\/external-reviewers\.md/,
    "Step 2.5 must send the reader to the reference that owns the spawn commands",
  );
  assert.match(
    spawn,
    /## Step 2\.5 background/,
    "Step 2.5 must name the reference section to follow",
  );
  assert.match(
    spawn,
    /Step 2 scope/,
    "the runners must be handed the Step 2 scope, not re-derive one",
  );
});

test("Step 2.5 hands the Step 2 snapshot to the agent runner", () => {
  const spawn = spawnContract();
  assert.match(
    spawn,
    /run-agent-review\.sh[^\n]*--snapshot-dir \/tmp\/coding-friend\/review\/<run-id>/,
    "the agent runner must be given the same snapshot the in-session reviewers read",
  );
  assert.match(
    spawn,
    /unusable[\s\S]{0,200}drop `--snapshot-dir`/,
    "an unusable snapshot dir is the one documented reason to omit the flag",
  );
});

test("Step 2.5 picks the Codex scope flag from has_committed", () => {
  const spawn = spawnContract();
  const codexLines = spawn
    .split("\n")
    .filter((line) => /^bash .*run-codex-review\.sh/.test(line));
  assert.equal(
    codexLines.length,
    2,
    "both Codex invocations (pinned and flagless) must be shown",
  );
  assert.ok(
    codexLines.some((line) => line.includes("--uncommitted")),
    "one invocation pins Codex to the working tree",
  );
  assert.ok(
    codexLines.some((line) => !line.includes("--uncommitted")),
    "the other invocation passes no scope flag",
  );
  assert.match(
    spawn,
    /`has_committed=false`[^\n]*`--uncommitted`/,
    "`--uncommitted` is conditional on has_committed=false",
  );
  assert.match(
    spawn,
    /`has_committed=true`[^\n]*omit the flag/i,
    "a snapshot with committed work must NOT pin Codex to the working tree",
  );
  assert.match(
    spawn,
    /has_committed=true[\s\S]{0,400}(less|narrower)/i,
    "the narrower Codex scope must be stated, not assumed equal",
  );
});

test("external-reviewers.md describes the scope Codex actually receives", () => {
  const externals = read(
    "plugin/skills/cf-review/references/external-reviewers.md",
  );
  const scope = section(externals, "## Codex scope");
  assert.ok(
    !/Codex reviews the same working tree the in-session reviewers were given/.test(
      scope,
    ),
    "the unconditional same-scope claim is false once the flag is conditional",
  );
  assert.match(
    scope,
    /`has_committed`/,
    "the reference must key the Codex scope off the Step 2 metadata",
  );
  assert.match(
    scope,
    /(narrower|less)/i,
    "it must say plainly when Codex sees less than the in-session review",
  );
});

/* ---------------------------------------------------------------------------
 * Native deadline (`review.nativeTimeout`)
 *
 * The documented default, the value Step 6 resolves, and the number in the
 * dispatch payload are one number read from config — not three literals that
 * can drift apart.
 * ------------------------------------------------------------------------ */

test("Step 6 resolves the native deadline from review.nativeTimeout", () => {
  const dispatch = section(skill, DISPATCH_HEADING);
  assert.match(
    dispatch,
    /run-with-timeout\.sh[^\n]*--config-timeout[^\n]*600 nativeTimeout/,
    "Step 6 must resolve review.nativeTimeout through the shared config reader",
  );
  assert.match(
    dispatch,
    /\*\*Deadline:\*\*[^\n]*`<N>` seconds/,
    "the payload deadline must be phrased from the resolved value",
  );
  assert.ok(
    !/within 5 minutes/.test(dispatch),
    "the payload must not hardcode a 5-minute deadline",
  );
  assert.ok(
    !/the 5 minutes in the payload/.test(dispatch),
    "the lifecycle deadline row must not hardcode 5 minutes either",
  );
});

test("the documented nativeTimeout default matches the one Step 6 falls back to", () => {
  const dispatch = section(skill, DISPATCH_HEADING);
  const fallback = /--config-timeout[^\n]*?(\d+) nativeTimeout/.exec(dispatch);
  assert.ok(fallback, "Step 6 must pass an explicit default to the resolver");
  const topics = read("plugin/skills/cf-help/topics.md");
  assert.match(
    topics,
    new RegExp(`\`review\\.nativeTimeout\`\\s*\\|\\s*\`${fallback[1]}\``, "m"),
    "topics.md must document the default Step 6 actually uses",
  );
  const help = read("plugin/skills/cf-help/SKILL.md");
  assert.match(
    help,
    new RegExp(`\`review\\.nativeTimeout\` \\(default ${fallback[1]}s\\)`),
    "cf-help/SKILL.md must list the same key and default as topics.md",
  );
});

/* ---------------------------------------------------------------------------
 * Generated-host parity + subset coverage (plan task 4.1)
 *
 * The host builders rewrite cf-review with exact-text `.replace()` calls. These
 * tests pin, on the generated artifacts themselves, the parts of the flat
 * topology a future rewrite could silently strip.
 * ------------------------------------------------------------------------ */

const GENERATED_REVIEW_SKILLS = [
  "plugin-codex/skills/cf-review/SKILL.md",
  "plugin-antigravity/skills/cf-review/SKILL.md",
];

test("generated hosts keep the 1 / 1 / 2 dispatch table intact", () => {
  for (const generated of GENERATED_REVIEW_SKILLS) {
    const rows = [
      ...read(generated).matchAll(
        /^\|\s*\*\*(QUICK|STANDARD|DEEP)\*\*\s*\|\s*(\d+)\s*\|([^|]*)\|/gm,
      ),
    ];
    assert.deepEqual(
      rows.map((row) => [row[1], Number(row[2])]),
      [
        ["QUICK", 1],
        ["STANDARD", 1],
        ["DEEP", 2],
      ],
      `${generated} lost the per-mode dispatch counts`,
    );
    assert.match(
      rows[2][3],
      /cf-reviewer-security/,
      `${generated} lost the DEEP security reviewer`,
    );
  }
});

test("generated hosts keep the deadline and partial-status instructions", () => {
  for (const generated of GENERATED_REVIEW_SKILLS) {
    const text = read(generated);
    for (const required of [
      /\*\*Deadline:\*\*/,
      /review\.nativeTimeout/,
      /run-with-timeout\.sh/,
      /Review status: PARTIAL/,
      /timed_out/,
      /Job lifecycle \(bounded wait\)/,
      /Never call shell `timeout` on a native dispatch/,
      /inline budgeted review/,
    ]) {
      assert.match(
        text,
        required,
        `${generated} lost a timeout/partial-status instruction: ${required}`,
      );
    }
  }
});

test("generated hosts carry no multi-level orchestration or nested Codex path", () => {
  for (const generated of GENERATED_REVIEW_SKILLS) {
    const text = read(generated);
    for (const forbidden of [
      /cf-reviewer-reducer/,
      /cf-reviewer-plan/,
      /cf-reviewer-quality/,
      /cf-reviewer-tests/,
      /cf-reviewer-rules/,
      /cf-explorer/,
      /Step 2\.5: Spawn Codex review/,
      /Step 6\.5: Collect & normalize the Codex review/,
      /codex=true/,
      /mark-reviewed\.sh/,
    ]) {
      assert.doesNotMatch(
        text,
        forbidden,
        `${generated} still carries retired review machinery: ${forbidden}`,
      );
    }
    assert.match(
      text,
      /### Step 6\.7: Emit `--out` prompt file/,
      `${generated} lost the --out export step`,
    );
    assert.match(
      text,
      /Ignore `--with-codex`/,
      `${generated} must keep ignoring the Claude-only Codex flag`,
    );
  }
});

/* --- subset coverage travels through --out / external collection --------- */

test("Step 6.7 says a truncated --out export is subset coverage", () => {
  const step = section(
    skill,
    "### Step 6.7: Emit `--out` prompt file (only when `out=true`)",
  );
  assert.match(
    step,
    /truncat|subset/i,
    "Step 6.7 must say what happens when the exporter caps the diff",
  );
  assert.match(
    step,
    /uncovered scope/i,
    "a capped export must land in Uncovered scope, not in native coverage",
  );
  assert.match(
    step,
    /never (counts|count).{0,40}native coverage/i,
    "an external subset must never raise native coverage",
  );
});

test("cf-review-in treats a truncated prompt as partial coverage", () => {
  const reviewIn = read("plugin/skills/cf-review-in/SKILL.md");
  assert.match(
    reviewIn,
    /diff_truncated/,
    "cf-review-in must read the machine-readable truncation flag",
  );
  assert.match(
    reviewIn,
    /subset/i,
    "cf-review-in must say the external result covers a subset",
  );
  assert.match(
    reviewIn,
    /not.{0,40}(full|whole) coverage|never.{0,60}clear to commit/i,
    "a subset review must not be presented as covering the whole target",
  );
});

test("the exporter documents the cap it enforces", () => {
  const exporter = read(
    "plugin/skills/cf-review-out/scripts/build-review-prompt.sh",
  );
  assert.match(
    exporter,
    /MAX_DIFF_LINES=5000/,
    "the legacy exporter keeps its 5000-line cap",
  );
  assert.match(
    exporter,
    /diff_truncated/,
    "the cap state must be machine-readable in the prompt frontmatter",
  );
  assert.match(
    exporter,
    /CF_PROMPT_SCOPE=subset/,
    "the cap state must also be announced to a piping caller",
  );
});

/* --- retained specialists stay callable, off the default path ------------ */

test("retained specialists stay callable and claim no dispatcher", () => {
  for (const agent of [
    "cf-reviewer-plan",
    "cf-reviewer-quality",
    "cf-reviewer-tests",
    "cf-reviewer-rules",
    "cf-reviewer-reducer",
  ]) {
    const markdown = read(`plugin/agents/${agent}.md`);
    const meta = frontmatter(markdown);
    assert.match(meta, new RegExp(`^name: ${agent}$`, "m"));
    assert.match(meta, /^model: (haiku|sonnet|opus|inherit)$/m);
    assert.match(meta, /^tools:/m);
    assert.doesNotMatch(
      meta,
      /Dispatched by cf-reviewer/i,
      `${agent} still advertises the retired cf-reviewer fanout`,
    );
    assert.ok(
      !skill.includes(agent),
      `cf-review must not dispatch ${agent} by default`,
    );
    assert.ok(
      !reviewer.includes(agent),
      `cf-reviewer must not dispatch ${agent}`,
    );
  }
});

// The static-overhead measurement excludes references/external-reviewers.md on
// the grounds that the skill loads it only when an external reviewer applies.
// scripts/bench-cf-review.mjs encodes that as REFERENCES[...].unconditional =
// false. If Step 1 ever goes back to an unconditional read, the file is read
// every review while the bench still discounts it — the number would be wrong,
// not just stale. This assertion is what makes that classification honest.
test("external-reviewers.md is loaded conditionally, as the bench assumes", () => {
  const step1 = section(skill, "### Step 1: Identify the target");
  assert.match(
    step1,
    /read `references\/external-reviewers\.md` now/,
    "Step 1 must say when to load the external-reviewer reference",
  );
  assert.match(
    step1,
    /None set → skip that file entirely/,
    "Step 1 must state the skip case — this is what makes the load conditional",
  );
  assert.doesNotMatch(
    step1,
    /Read now: `references\/external-reviewers\.md`/,
    "an unconditional read would invalidate the bench's reference accounting",
  );
  const bench = read("scripts/bench-cf-review.mjs");
  assert.match(
    bench,
    /"external-reviewers\.md":\s*\{\s*unconditional:\s*false/,
    "the bench must still classify the reference as conditional",
  );
});

/* --- --fix / --commit ---------------------------------------------------- */

const FIX_HEADING = "### Step 11: Apply fixes and commit (only when fix=true)";
// The host builders rewrite Step 1 and other sections, so every contract on
// --fix/--commit must hold in the source and both generated mirrors.
const FIX_SKILLS = [
  "plugin/skills/cf-review/SKILL.md",
  "plugin-codex/skills/cf-review/SKILL.md",
  "plugin-antigravity/skills/cf-review/SKILL.md",
].map((relPath) => [relPath, read(relPath)]);

test("cf-review advertises --fix in its frontmatter description", () => {
  const description = /^description:[\s\S]*?(?=^\S)/m.exec(frontmatter(skill));
  assert.ok(description, "cf-review frontmatter is missing a description");
  assert.match(description[0], /--fix/, "description must mention --fix");
});

test("Step 1 parses --fix and --commit, with --commit implying --fix", () => {
  for (const [relPath, text] of FIX_SKILLS) {
    const step1 = section(text, "### Step 1: Identify the target");
    assert.match(step1, /Fix\/commit flags/, `${relPath}: flag block missing`);
    assert.match(step1, /`--fix`/, `${relPath}: Step 1 must parse --fix`);
    assert.match(step1, /`--commit`/, `${relPath}: Step 1 must parse --commit`);
    assert.match(
      step1,
      /--commit[^\n]*implies[^\n]*--fix/i,
      `${relPath}: Step 1 must state that --commit implies --fix`,
    );
  }
});

test("Step 1 refuses --fix/--commit with a commit range or --out", () => {
  for (const [relPath, text] of FIX_SKILLS) {
    const step1 = section(text, "### Step 1: Identify the target");
    const refusals = step1
      .split("\n")
      .filter((line) => /--fix|--commit/.test(line));
    assert.ok(
      refusals.some(
        (line) =>
          /commit range/i.test(line) &&
          /refuse|reject|stop|not allowed/i.test(line),
      ),
      `${relPath}: Step 1 must refuse --fix/--commit with a commit range`,
    );
    assert.ok(
      refusals.some(
        (line) =>
          /--out/.test(line) &&
          /refuse|reject|stop|not allowed|exclusive/i.test(line),
      ),
      `${relPath}: Step 1 must refuse --fix/--commit together with --out`,
    );
  }
});

test("Step 11 loops cf-implementer fixes within review.maxRounds", () => {
  for (const [relPath, text] of FIX_SKILLS) {
    const step11 = section(text, FIX_HEADING);
    assert.match(step11, /cf-implementer/, `${relPath}: use cf-implementer`);
    assert.match(
      step11,
      /review\.maxRounds/,
      `${relPath}: the fix loop must be bounded by review.maxRounds`,
    );
    assert.match(
      step11,
      /\[CF-RESULT: failure\]/,
      `${relPath}: an implementer failure must be a stop condition`,
    );
  }
});

test("Step 11 treats findings as data and keeps edits in the reviewed scope", () => {
  for (const [relPath, text] of FIX_SKILLS) {
    const step11 = section(text, FIX_HEADING);
    assert.match(
      step11,
      /data, not instructions/i,
      `${relPath}: finding text must be framed as data, not instructions`,
    );
    assert.match(
      step11,
      /(inside|within) the reviewed scope/i,
      `${relPath}: fixes must stay within the reviewed scope`,
    );
    assert.match(
      step11,
      /skip it and report it/i,
      `${relPath}: out-of-scope or weakening findings must be skipped and reported`,
    );
  }
});

test("Step 11 gates fixing and committing on Review status: COMPLETE", () => {
  for (const [relPath, text] of FIX_SKILLS) {
    const step11 = section(text, FIX_HEADING);
    assert.match(step11, /Review status: COMPLETE/, `${relPath}: gate`);
    assert.match(step11, /PARTIAL/, `${relPath}: name PARTIAL`);
    assert.match(step11, /FAILED/, `${relPath}: name FAILED`);
    assert.match(
      step11,
      /(PARTIAL|FAILED)[^\n]*(stop|do not commit|never commit|without commit)/i,
      `${relPath}: PARTIAL/FAILED must stop without committing`,
    );
    assert.match(
      step11,
      /Commit\*\* only when `commit=true`/,
      `${relPath}: Step 11 must commit only when commit=true`,
    );
  }
});

test("Step 11 commits inline and never skips hooks", () => {
  for (const [relPath, text] of FIX_SKILLS) {
    const step11 = section(text, FIX_HEADING);
    assert.match(step11, /git commit/, `${relPath}: commit inline`);
    assert.match(
      step11,
      /never[^\n]*--no-verify/i,
      `${relPath}: Step 11 must forbid --no-verify`,
    );
    assert.doesNotMatch(
      step11,
      /Load `?[/$]cf-commit/i,
      `${relPath}: cf-commit has disable-model-invocation — do not load it`,
    );
  }
});

test("Step 11 stages only reviewed paths and scans for secrets", () => {
  for (const [relPath, text] of FIX_SKILLS) {
    const step11 = section(text, FIX_HEADING);
    assert.match(
      step11,
      /git add -- <paths>/,
      `${relPath}: stage explicit paths with git add -- <paths>`,
    );
    assert.match(
      step11,
      /files\.z/,
      `${relPath}: stage from the snapshot list`,
    );
    // Every mention of a blanket add must be a prohibition, never an instruction.
    for (const line of step11.split("\n")) {
      if (/git add (-A|\.)/.test(line)) {
        assert.match(
          line,
          /never[^\n]*git add (-A|\.)/i,
          `${relPath}: git add -A / git add . may only appear as a "never"`,
        );
      }
    }
    assert.match(
      step11,
      /never[^\n]*git add -A/i,
      `${relPath}: Step 11 must forbid git add -A`,
    );
    assert.match(
      step11,
      /cf-commit\/scripts\/scan-secrets\.sh/,
      `${relPath}: Step 11 must run the cf-commit secret scan`,
    );
    assert.match(
      step11,
      /SECRETS > 0[^\n]*(stop|do not commit)/i,
      `${relPath}: a real secret must stop the commit`,
    );
  }
});

test("Step 11 commits only the reviewed paths via an explicit pathspec", () => {
  for (const [relPath, text] of FIX_SKILLS) {
    const step11 = section(text, FIX_HEADING);
    assert.match(
      step11,
      /git commit[^\n]*(-- <paths>|--pathspec-from-file)/,
      `${relPath}: git commit must name the reviewed paths, not the whole index`,
    );
    assert.match(
      step11,
      /`origin<SP>added<SP>deleted<SP>path`/,
      `${relPath}: Step 11 must state the files.z record format`,
    );
    assert.ok(
      step11.includes('"${rec#* * * }"'),
      `${relPath}: Step 11 must strip the record prefix NUL-safely`,
    );
  }
});

test("Step 11 skips committed records and handles an empty paths.z", () => {
  for (const [relPath, text] of FIX_SKILLS) {
    const step11 = section(text, FIX_HEADING);
    assert.match(
      step11,
      /committed\\?\s*\*\)\s*continue/,
      `${relPath}: Step 11 must skip files.z records with origin committed`,
    );
    assert.match(
      step11,
      /Nothing to commit — no uncommitted reviewed paths/,
      `${relPath}: Step 11 must report an empty paths.z as Nothing to commit`,
    );
    assert.match(
      step11,
      /repo root[^\n]*git rev-parse --show-toplevel/,
      `${relPath}: Step 11 must stage from the repo root`,
    );
    assert.match(
      step11,
      /path\(s\) excluded from review \(excluded\.z\)/,
      `${relPath}: Step 11 outcome must count excluded.z paths as excluded from review`,
    );
  }
});

test("Step 11 stops on a hook failure without retrying", () => {
  for (const [relPath, text] of FIX_SKILLS) {
    const step11 = section(text, FIX_HEADING);
    assert.match(
      step11,
      /hook fail[^\n]*stop[^\n]*do not retry/i,
      `${relPath}: a hook failure must stop with no retry`,
    );
    assert.doesNotMatch(
      step11,
      /Hook failure → fix/i,
      `${relPath}: never fix and re-commit after a hook failure`,
    );
  }
});

test("Step 11 keeps the round counter and names the clean no-commit outcome", () => {
  for (const [relPath, text] of FIX_SKILLS) {
    const step11 = section(text, FIX_HEADING);
    assert.match(
      step11,
      /never reset/i,
      `${relPath}: re-running Steps 2–10 must keep the round counter`,
    );
    assert.match(
      step11,
      /Nothing to fix — not committed \(no --commit\)/,
      `${relPath}: clean first review without --commit needs its own outcome`,
    );
  }
});

test("Step 10 banner announces the --fix and --commit hand-off", () => {
  for (const [relPath, text] of FIX_SKILLS) {
    const step10 = section(text, "### Step 10: Final output");
    assert.match(
      step10,
      /Applying fixes \(--fix\)/,
      `${relPath}: Step 10 must name the --fix banner`,
    );
    assert.match(
      step10,
      /Committing \(--commit\)/,
      `${relPath}: Step 10 must name the --commit banner for a clean review`,
    );
    assert.match(
      step10,
      /`fix=true` → always go to Step 11/,
      `${relPath}: Step 10 must hand every fix=true run to Step 11`,
    );
  }
});

test("Step 11 lets cf-implementer create new files but never edit existing out-of-scope ones", () => {
  for (const [relPath, text] of FIX_SKILLS) {
    const step11 = section(text, FIX_HEADING);
    assert.match(
      step11,
      /create new files/i,
      `${relPath}: cf-implementer must be allowed to create new files (e.g. a missing test)`,
    );
    assert.match(
      step11,
      /never edit an existing file outside the reviewed scope/i,
      `${relPath}: existing files outside the reviewed scope must stay untouched`,
    );
  }
});

test("Step 11 stops early when every remaining finding needs out-of-scope edits", () => {
  for (const [relPath, text] of FIX_SKILLS) {
    const step11 = section(text, FIX_HEADING);
    assert.match(
      step11,
      /without another review/i,
      `${relPath}: an all-skipped round must not trigger another review`,
    );
    assert.match(
      step11,
      /⚠️ Stopped — N finding\(s\) need out-of-scope edits/,
      `${relPath}: the early stop must print its own outcome`,
    );
  }
});

test("Step 11 unstages only the reviewed paths on a real secret and runs git from the repo root", () => {
  for (const [relPath, text] of FIX_SKILLS) {
    const step11 = section(text, FIX_HEADING);
    assert.match(
      step11,
      /SECRETS > 0[^\n]*unstage only the reviewed paths/i,
      `${relPath}: a real secret must unstage only the reviewed paths`,
    );
    assert.match(
      step11,
      /staging, scan and commit from the repo root/i,
      `${relPath}: staging, the scan and the commit must all run from the repo root`,
    );
  }
});

test("Step 11 paths.z snippet keeps only uncommitted/untracked paths (behavioral)", (t) => {
  try {
    execFileSync("bash", ["-c", "true"]);
  } catch {
    t.skip("bash not available");
    return;
  }
  const step11 = section(skill, FIX_HEADING);
  const match = /`(while IFS= read -r -d '' rec;[^`]*> paths\.z)`/.exec(step11);
  assert.ok(match, "Step 11 must carry the paths.z extraction snippet");
  const run = (records) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cf-review-paths-"));
    try {
      fs.writeFileSync(
        path.join(dir, "files.z"),
        records.map((rec) => `${rec}\0`).join(""),
      );
      execFileSync("bash", ["-c", match[1]], { cwd: dir });
      return fs.readFileSync(path.join(dir, "paths.z"), "utf8");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  assert.equal(
    run([
      "committed 1 0 old.md",
      "uncommitted 2 1 a b.md",
      "untracked 3 0 new.md",
    ]),
    "a b.md\0new.md\0",
  );
  assert.equal(run(["committed 1 0 old.md"]), "");
});

test("Step 11 keeps the commit message plain text", () => {
  for (const [relPath, markdown] of FIX_SKILLS) {
    const step11 = section(markdown, FIX_HEADING);
    assert.match(
      step11,
      /plain text[^\n]*no backticks, `\$\(`, or newlines/i,
      `${relPath}: the commit summary must be plain text so diff content cannot inject shell syntax`,
    );
  }
});
