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

test("cf-review states the reviewer reading strategy in the dispatch prompt", () => {
  const dispatch = section(skill, DISPATCH_HEADING);
  assert.match(dispatch, /changed hunks/i, "read the changed hunks first");
  assert.match(
    dispatch,
    /hypothesis/i,
    "context and callers are opened only to test a hypothesis",
  );
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

test("QUICK depth in the skill matches the reviewer agent's QUICK contract", () => {
  const skill = read("plugin/skills/cf-review/SKILL.md");
  const agent = reviewer;
  // The agent runs four of five layers in QUICK (only plan alignment and
  // data-flow tracing are dropped). A skill table saying "Layer 3 only" would
  // under-review every QUICK change.
  assert.match(
    agent,
    /### QUICK[\s\S]*?Layers L0, L2, L3, L4/,
    "agent QUICK must list L0/L2/L3/L4",
  );
  const quickRow = skill.split("\n").find((l) => l.includes("**QUICK**"));
  assert.ok(quickRow, "skill must document a QUICK row");
  assert.doesNotMatch(
    quickRow,
    /Layer 3: secrets/,
    "skill QUICK row must not describe QUICK as security-only",
  );
  assert.match(
    quickRow,
    /L0.*L2.*L3.*L4|plan alignment|data-flow/i,
    "skill QUICK row must state the same depth the agent applies",
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
