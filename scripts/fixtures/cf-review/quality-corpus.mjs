#!/usr/bin/env node
/**
 * quality-corpus.mjs — drive the cf-review finite quality corpus.
 *
 * The corpus is three synthetic changes with a hidden answer key
 * (quality-cases.json). This script materialises a case as a real git working
 * tree that a reviewer can be pointed at, checks the key still lines up with
 * the fixture text, and scores a filled-in result file against the plan's
 * absolute quality gates.
 *
 * Usage:
 *   node scripts/fixtures/cf-review/quality-corpus.mjs list
 *   node scripts/fixtures/cf-review/quality-corpus.mjs materialize <case|all> [--out <dir>]
 *   node scripts/fixtures/cf-review/quality-corpus.mjs verify [--out <dir>]
 *   node scripts/fixtures/cf-review/quality-corpus.mjs template [--out <file>]
 *   node scripts/fixtures/cf-review/quality-corpus.mjs score <results.json>
 *
 * `materialize` writes OUTSIDE this repository by default
 * (<tmp>/cf-review-quality/<case>/repo plus a sibling snapshot/ directory), so
 * the answer key is never inside the scope of the review being scored.
 *
 * Exit codes: 0 ok · 1 a check or a gate failed · 2 usage/structural error.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const casesDir = path.join(here, "cases");
const keyPath = path.join(here, "quality-cases.json");
const scriptsDir = path.join(
  repoRoot,
  "plugin",
  "skills",
  "cf-review",
  "scripts",
);
const BLOCKING = new Set(["critical", "important"]);

const key = JSON.parse(fs.readFileSync(keyPath, "utf8"));

// ── helpers ─────────────────────────────────────────────────────────

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(2);
}

function findCase(id) {
  const found = key.cases.find((entry) => entry.id === id);
  if (!found)
    fail(
      `unknown case '${id}' (known: ${key.cases.map((c) => c.id).join(", ")})`,
    );
  return found;
}

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", ...options });
  if (res.error) fail(`${cmd} ${args.join(" ")} — ${res.error.message}`);
  return res;
}

function git(cwd, args) {
  const res = run("git", ["-C", cwd, ...args]);
  if (res.status !== 0) {
    fail(
      `git ${args.join(" ")} failed (${res.status}): ${(res.stderr || "").trim()}`,
    );
  }
  return res.stdout;
}

function listFiles(root) {
  const out = [];
  const walk = (dir, prefix) => {
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(root, "");
  return out;
}

function copyTree(from, to) {
  for (const rel of listFiles(from)) {
    const dest = path.join(to, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(from, rel), dest);
  }
}

function defaultOutRoot() {
  return path.join(os.tmpdir(), "cf-review-quality");
}

function parseFlags(argv, allowed) {
  const opts = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const name = argv[i].slice(2);
      if (!allowed.includes(name)) fail(`unknown flag --${name}`);
      const value = argv[++i];
      if (value === undefined) fail(`--${name} requires a value`);
      opts[name] = value;
    } else {
      rest.push(argv[i]);
    }
  }
  return { opts, rest };
}

// ── materialize ─────────────────────────────────────────────────────

function materializeCase(caseDef, outRoot) {
  const caseSrc = path.join(casesDir, caseDef.id);
  const baseDir = path.join(caseSrc, "base");
  const headDir = path.join(caseSrc, "head");
  if (!fs.existsSync(baseDir) || !fs.existsSync(headDir)) {
    fail(`case '${caseDef.id}' is missing a base/ or head/ tree at ${caseSrc}`);
  }

  const target = path.join(outRoot, caseDef.id);
  const repo = path.join(target, "repo");
  const snapshot = path.join(target, "snapshot");
  if (path.resolve(target).startsWith(`${repoRoot}${path.sep}`)) {
    fail(
      `refusing to materialise inside the coding-friend repo (${target}) — the answer key would land in the review scope`,
    );
  }
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(snapshot, { recursive: true });

  // Base commit. `-b main` keeps the current branch equal to the base branch,
  // so review-scope.sh finds no branch-commit section and the whole change is
  // the uncommitted one below.
  const init = run("git", ["-C", repo, "init", "-b", "main"]);
  if (init.status !== 0) {
    git(repo, ["init"]);
    git(repo, ["symbolic-ref", "HEAD", "refs/heads/main"]);
  }
  git(repo, ["config", "user.email", "corpus@example.invalid"]);
  git(repo, ["config", "user.name", "cf-review corpus"]);
  git(repo, ["config", "commit.gpgsign", "false"]);
  copyTree(baseDir, repo);
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "-q", "-m", "base"]);

  // Head state, left uncommitted: modified files are unstaged edits, new files
  // are untracked — exactly what a default `/cf-review` target picks up.
  const baseFiles = new Set(listFiles(baseDir));
  const headFiles = new Set(listFiles(headDir));
  for (const rel of baseFiles) {
    if (!headFiles.has(rel)) fs.rmSync(path.join(repo, rel), { force: true });
  }
  copyTree(headDir, repo);

  const gather = run(
    "bash",
    [path.join(scriptsDir, "gather-diff.sh"), "--snapshot-dir", snapshot],
    { cwd: repo },
  );
  if (gather.status === 2) {
    fail(
      `gather-diff.sh failed structurally for '${caseDef.id}': ${(gather.stderr || "").trim()}`,
    );
  }
  const assess = run(
    "bash",
    [path.join(scriptsDir, "assess-changes.sh"), "--snapshot-dir", snapshot],
    { cwd: repo },
  );
  if (assess.status === 2) {
    fail(
      `assess-changes.sh failed structurally for '${caseDef.id}': ${(assess.stderr || "").trim()}`,
    );
  }
  const metrics = Object.fromEntries(
    assess.stdout
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => [
        line.slice(0, line.indexOf("=")),
        line.slice(line.indexOf("=") + 1),
      ]),
  );

  return {
    id: caseDef.id,
    repo,
    snapshot,
    diff: path.join(snapshot, "diff.txt"),
    metrics,
    gatherStatus: gather.status,
    assessStatus: assess.status,
    modeMatches: metrics.MODE === caseDef.expected_mode,
  };
}

function cmdMaterialize(argv) {
  const { opts, rest } = parseFlags(argv, ["out"]);
  const outRoot = path.resolve(opts.out || defaultOutRoot());
  const selection =
    rest.length === 0 || rest[0] === "all" ? key.cases : [findCase(rest[0])];

  let mismatch = false;
  for (const caseDef of selection) {
    const result = materializeCase(caseDef, outRoot);
    mismatch = mismatch || !result.modeMatches;
    console.log(`case: ${result.id}`);
    console.log(`  repo:     ${result.repo}`);
    console.log(`  snapshot: ${result.snapshot}`);
    console.log(`  diff:     ${result.diff}`);
    console.log(
      `  assessed: MODE=${result.metrics.MODE} FILES_CHANGED=${result.metrics.FILES_CHANGED} ` +
        `LINES_CHANGED=${result.metrics.LINES_CHANGED} SENSITIVE=${result.metrics.SENSITIVE} ` +
        `SCOPE_COMPLETE=${result.metrics.SCOPE_COMPLETE}`,
    );
    console.log(
      `  expected: MODE=${caseDef.expected_mode} native reviewers=${caseDef.expected_native_agents} ` +
        `→ ${result.modeMatches ? "MATCH" : "MISMATCH"}`,
    );
    console.log(
      `  run:      cd ${result.repo} && /cf-review   (no target — reviews the uncommitted change)`,
    );
    console.log("");
  }
  if (mismatch) {
    console.error(
      "FAIL: at least one case did not assess to its expected mode.",
    );
    process.exit(1);
  }
}

// ── verify ──────────────────────────────────────────────────────────

function cmdVerify(argv) {
  const { opts } = parseFlags(argv, ["out"]);
  const outRoot = path.resolve(
    opts.out || path.join(defaultOutRoot(), "verify"),
  );
  const problems = [];
  let entries = 0;

  for (const caseDef of key.cases) {
    const result = materializeCase(caseDef, outRoot);
    if (!result.modeMatches) {
      problems.push(
        `${caseDef.id}: assessed MODE=${result.metrics.MODE}, key says ${caseDef.expected_mode}`,
      );
    }
    if (result.metrics.SCOPE_COMPLETE !== "true") {
      problems.push(`${caseDef.id}: scope snapshot is not complete`);
    }
    const changed = (result.metrics.CHANGED_FILES || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .sort();
    const declared = [...caseDef.changed_files].sort();
    if (JSON.stringify(changed) !== JSON.stringify(declared)) {
      problems.push(
        `${caseDef.id}: changed files in scope [${changed}] != key changed_files [${declared}]`,
      );
    }
    if (!fs.existsSync(result.diff) || fs.statSync(result.diff).size === 0) {
      problems.push(`${caseDef.id}: snapshot diff.txt is missing or empty`);
    }

    for (const entry of [...caseDef.ground_truth, ...caseDef.bait]) {
      entries++;
      const file = path.join(result.repo, entry.file);
      if (!fs.existsSync(file)) {
        problems.push(
          `${caseDef.id}/${entry.id}: ${entry.file} is not in the materialised tree`,
        );
        continue;
      }
      const lines = fs.readFileSync(file, "utf8").split("\n");
      const actual = (lines[entry.line - 1] ?? "").trim();
      if (actual !== entry.anchor.trim()) {
        problems.push(
          `${caseDef.id}/${entry.id}: ${entry.file}:${entry.line} is\n      ${JSON.stringify(actual)}\n    key anchor is\n      ${JSON.stringify(entry.anchor.trim())}`,
        );
      }
    }

    // The key's line numbers are only meaningful if the materialised tree is
    // byte-identical to the checked-in head/ tree.
    const headDir = path.join(casesDir, caseDef.id, "head");
    for (const rel of listFiles(headDir)) {
      const a = fs.readFileSync(path.join(headDir, rel));
      const b = fs.readFileSync(path.join(result.repo, rel));
      if (!a.equals(b))
        problems.push(
          `${caseDef.id}: materialised ${rel} differs from head/${rel}`,
        );
    }
  }

  const criticals = key.cases
    .flatMap((c) => c.ground_truth)
    .filter((g) => g.severity === "critical");
  const importants = key.cases
    .flatMap((c) => c.ground_truth)
    .filter((g) => g.severity === "important");
  if (criticals.length < 2)
    problems.push(
      `corpus has ${criticals.length} Critical entries, needs >= 2`,
    );
  if (importants.length < 5)
    problems.push(
      `corpus has ${importants.length} Important entries, needs >= 5`,
    );
  if (key.cases.flatMap((c) => c.bait).length === 0)
    problems.push("corpus has no false-positive bait");

  console.log(
    `verified ${key.cases.length} case(s), ${entries} key entrie(s): ` +
      `${criticals.length} Critical, ${importants.length} Important, ` +
      `${key.cases.flatMap((c) => c.bait).length} bait`,
  );
  console.log(`materialised under ${outRoot}`);
  if (problems.length > 0) {
    console.error(`\nFAIL — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    "OK — every key anchor sits on its recorded line and every case assesses to its mode.",
  );
}

// ── template ────────────────────────────────────────────────────────

function cmdTemplate(argv) {
  const { opts } = parseFlags(argv, ["out"]);
  const template = {
    schema_version: 1,
    run_label: "NOT_MEASURED",
    date: "NOT_MEASURED",
    host: "NOT_MEASURED",
    model: "NOT_MEASURED",
    pipeline: "NOT_MEASURED (candidate = flat 1/1/2, or baseline)",
    agent_definitions_dispatched:
      "NOT_MEASURED — which installed agent/skill files the run actually loaded",
    dispatched_from:
      "NOT_MEASURED — must be the materialised repo; a run dispatched from the coding-friend repo is contaminated by the answer key and must not be scored",
    cases: Object.fromEntries(
      key.cases.map((caseDef) => [
        caseDef.id,
        {
          review_status: null,
          mode_observed: null,
          native_agents_observed: null,
          grandchildren_spawned: null,
          elapsed_s: null,
          host_reported_tokens: null,
          findings: caseDef.ground_truth.map((entry) => ({
            id: entry.id,
            expected_severity: entry.severity,
            severity_reported: "none",
            quote: "",
            confidence: null,
          })),
          bait_findings: caseDef.bait.map((entry) => ({
            id: entry.id,
            severity_reported: "none",
            quote: "",
          })),
          unkeyed_blocking_findings: [],
        },
      ]),
    ),
    _how_to_fill: [
      "severity_reported: critical | important | suggestion | none — the section the finding appeared in.",
      "quote: verbatim text of the finding (>= 10 chars). A hit needs critical|important AND a quote.",
      "unkeyed_blocking_findings: one entry per Critical/Important finding that matches no key id — {file_line, severity_reported, quote, adjudication: 'false_positive'|'unseeded_true_positive', rationale}.",
      "review_status: COMPLETE or PARTIAL, taken from the reviewer's Summary. Leave null if the run did not finish; the score will then fail, which is the honest result.",
      "agent_definitions_dispatched: the review only measures the candidate if the host dispatched the candidate's agent files. Record the check, e.g. `diff <installed-plugin>/agents/cf-reviewer.md plugin/agents/cf-reviewer.md` empty at the candidate SHA. A mismatch means a different pipeline was measured and the run must say so instead of being reported as a candidate result.",
    ],
  };
  const text = `${JSON.stringify(template, null, 2)}\n`;
  if (opts.out) {
    fs.writeFileSync(path.resolve(opts.out), text);
    console.log(`wrote ${path.resolve(opts.out)}`);
  } else {
    process.stdout.write(text);
  }
}

// ── score ───────────────────────────────────────────────────────────

function cmdScore(argv) {
  const { rest } = parseFlags(argv, []);
  if (rest.length !== 1) fail("usage: score <results.json>");
  const file = path.resolve(rest[0]);
  if (!fs.existsSync(file)) fail(`no results file at ${file}`);
  let results;
  try {
    results = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`${file} is not valid JSON: ${error.message}`);
  }

  const gates = key.scoring.gates;
  const lines = [];
  const failures = [];
  const hit = (entry) =>
    entry &&
    BLOCKING.has(String(entry.severity_reported || "").toLowerCase()) &&
    typeof entry.quote === "string" &&
    entry.quote.trim().length >= 10;

  // Denominators come from the key, never from the cases that happen to be
  // present: a results file missing a whole case must not report recall over a
  // shrunken corpus.
  const allGroundTruth = key.cases.flatMap((c) => c.ground_truth);
  const criticalTotal = allGroundTruth.filter(
    (g) => g.severity === "critical",
  ).length;
  const importantTotal = allGroundTruth.filter(
    (g) => g.severity !== "critical",
  ).length;
  let criticalHit = 0;
  let importantHit = 0;
  let falsePositives = 0;
  let unseeded = 0;

  for (const caseDef of key.cases) {
    const observed = (results.cases || {})[caseDef.id];
    lines.push(`case ${caseDef.id} (${caseDef.expected_mode})`);
    if (!observed) {
      failures.push(
        `${caseDef.id}: no result recorded — NOT_MEASURED cannot score as a pass`,
      );
      lines.push("  NOT_MEASURED");
      lines.push("");
      continue;
    }

    const status = String(observed.review_status || "").toUpperCase();
    if (!status) {
      failures.push(
        `${caseDef.id}: review_status is empty — the run did not report completion`,
      );
    } else if (status !== gates.require_review_status) {
      failures.push(
        `${caseDef.id}: review_status=${status}, gate requires ${gates.require_review_status}`,
      );
    }
    lines.push(`  review status: ${status || "MISSING"}`);

    if (gates.require_expected_native_agents) {
      if (observed.native_agents_observed !== caseDef.expected_native_agents) {
        failures.push(
          `${caseDef.id}: native_agents_observed=${observed.native_agents_observed}, expected ${caseDef.expected_native_agents}`,
        );
      }
      if (observed.grandchildren_spawned !== gates.max_grandchildren) {
        failures.push(
          `${caseDef.id}: grandchildren_spawned=${observed.grandchildren_spawned}, expected ${gates.max_grandchildren}`,
        );
      }
    }
    lines.push(
      `  topology:      ${observed.native_agents_observed} native reviewer(s), ` +
        `${observed.grandchildren_spawned} grandchild(ren) — expected ${caseDef.expected_native_agents} / 0`,
    );
    lines.push(
      `  observed cost: elapsed ${observed.elapsed_s ?? "NOT_MEASURED"} s · ` +
        `host-reported tokens ${observed.host_reported_tokens ?? "NOT_MEASURED"}`,
    );

    const byId = new Map((observed.findings || []).map((f) => [f.id, f]));
    for (const entry of caseDef.ground_truth) {
      const found = byId.get(entry.id);
      const isHit = hit(found);
      if (entry.severity === "critical") {
        if (isHit) criticalHit++;
      } else if (isHit) {
        importantHit++;
      }
      lines.push(
        `  ${isHit ? "HIT " : "MISS"} ${entry.id} (${entry.severity}) ` +
          `reported as ${found ? found.severity_reported : "none"}`,
      );
    }

    const baitById = new Map(
      (observed.bait_findings || []).map((f) => [f.id, f]),
    );
    let baitBlocking = 0;
    for (const entry of caseDef.bait) {
      const found = baitById.get(entry.id);
      if (
        found &&
        BLOCKING.has(String(found.severity_reported || "").toLowerCase())
      ) {
        baitBlocking++;
        falsePositives++;
        failures.push(
          `${caseDef.id}: bait ${entry.id} was reported as ${found.severity_reported} — false positive`,
        );
      }
    }

    let unkeyedBlocking = 0;
    for (const entry of observed.unkeyed_blocking_findings || []) {
      if (!BLOCKING.has(String(entry.severity_reported || "").toLowerCase()))
        continue;
      unkeyedBlocking++;
      if (
        String(entry.adjudication || "").toLowerCase() ===
        "unseeded_true_positive"
      )
        unseeded++;
      else falsePositives++;
    }
    lines.push(
      `  noise:         ${baitBlocking} blocking finding(s) on bait, ` +
        `${unkeyedBlocking} unkeyed blocking finding(s)`,
    );

    if (caseDef.ground_truth.length === 0) {
      const total = baitBlocking + unkeyedBlocking;
      if (total > gates.clean_case_max_blocking_findings) {
        failures.push(
          `${caseDef.id}: clean control produced ${total} blocking finding(s), gate allows ${gates.clean_case_max_blocking_findings} ` +
            "(either the reviewer is wrong or the fixture is not clean — both block)",
        );
      }
    }
    lines.push("");
  }

  const criticalRecall = criticalTotal === 0 ? 0 : criticalHit / criticalTotal;
  const importantRecall =
    importantTotal === 0 ? 0 : importantHit / importantTotal;
  if (criticalRecall < gates.critical_recall_min) {
    failures.push(
      `Critical recall ${criticalHit}/${criticalTotal} = ${(criticalRecall * 100).toFixed(0)}%, gate requires ${(gates.critical_recall_min * 100).toFixed(0)}%`,
    );
  }
  if (importantRecall < gates.important_recall_min) {
    failures.push(
      `Important recall ${importantHit}/${importantTotal} = ${(importantRecall * 100).toFixed(0)}%, gate requires ${(gates.important_recall_min * 100).toFixed(0)}%`,
    );
  }

  console.log(
    `cf-review quality corpus — ${results.run_label || "unlabelled run"}`,
  );
  console.log(`results: ${file}`);
  console.log(`dispatched from: ${results.dispatched_from || "NOT RECORDED"}`);
  console.log("");
  console.log(lines.join("\n"));
  console.log(
    `Critical recall:  ${criticalHit}/${criticalTotal} (${(criticalRecall * 100).toFixed(0)}%) — gate ${(gates.critical_recall_min * 100).toFixed(0)}%`,
  );
  console.log(
    `Important recall: ${importantHit}/${importantTotal} (${(importantRecall * 100).toFixed(0)}%) — gate ${(gates.important_recall_min * 100).toFixed(0)}%`,
  );
  console.log(`False positives:  ${falsePositives}`);
  console.log(`Unseeded true positives: ${unseeded} (reported, not a gate)`);
  console.log("");
  if (failures.length > 0) {
    console.error(`RESULT: FAIL — ${failures.length} gate failure(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("RESULT: PASS — every absolute quality gate met.");
}

// ── entry point ─────────────────────────────────────────────────────

function cmdList() {
  for (const caseDef of key.cases) {
    const crit = caseDef.ground_truth.filter(
      (g) => g.severity === "critical",
    ).length;
    const imp = caseDef.ground_truth.filter(
      (g) => g.severity === "important",
    ).length;
    console.log(
      `${caseDef.id.padEnd(22)} ${caseDef.expected_mode.padEnd(9)} ` +
        `${caseDef.expected_native_agents} reviewer(s) · ${crit} Critical, ${imp} Important, ${caseDef.bait.length} bait`,
    );
  }
}

const [command, ...argv] = process.argv.slice(2);
switch (command) {
  case "list":
    cmdList();
    break;
  case "materialize":
    cmdMaterialize(argv);
    break;
  case "verify":
    cmdVerify(argv);
    break;
  case "template":
    cmdTemplate(argv);
    break;
  case "score":
    cmdScore(argv);
    break;
  default:
    fail(
      "usage: quality-corpus.mjs <list|materialize <case|all>|verify|template|score <results.json>> [--out <dir>]",
    );
}
