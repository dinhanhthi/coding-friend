#!/usr/bin/env node
/**
 * bench-cf-review.mjs — static instruction-token footprint of the cf-review pipeline.
 *
 * Measures how many tokens of *instruction text* each review mode loads: the
 * cf-review SKILL.md plus every agent file that mode activates. This is a static
 * prompt-size measurement — NOT billed tokens, NOT latency, NOT a quality metric.
 *
 * Usage:
 *   node scripts/bench-cf-review.mjs --working-tree [--runs 3]
 *   node scripts/bench-cf-review.mjs --ref <sha> [--runs 3]
 *
 * --ref reads file content with `git show <ref>:<path>` — it never checks out,
 * resets, or otherwise touches the working tree or index.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const SKILL = "plugin/skills/cf-review/SKILL.md";

/**
 * Dispatch graph, read from source (working tree):
 *   - plugin/skills/cf-review/SKILL.md — Step 6 "Dispatch the reviewer(s)"
 *     table: QUICK 1, STANDARD 1, DEEP 2. The main agent dispatches every
 *     reviewer itself; the graph is flat (no explorer, no reducer, no
 *     grandchildren), so the agent files below are the whole fan-out.
 *   - plugin/agents/cf-reviewer.md — reviews the diff itself across five
 *     layers, depth set by the mode it is handed.
 *   - plugin/agents/cf-reviewer-security.md — second perspective, DEEP only.
 *
 * Not counted (conditional): the external reviewer runners, and
 * lib/load-custom-guide.sh output.
 */
const MODES = {
  QUICK: ["cf-reviewer"],
  STANDARD: ["cf-reviewer"],
  DEEP: ["cf-reviewer", "cf-reviewer-security"],
};

const REFERENCE_DIR = "plugin/skills/cf-review/references";

/**
 * Every reference file under REFERENCE_DIR, and whether the skill loads it on
 * every review. Unconditional references are part of the static footprint of
 * every mode — otherwise moving prose out of SKILL.md into a file the skill
 * always reads would look like a saving while nothing was saved.
 *
 *   external-reviewers.md — conditional: Step 1 tells the reader to load it
 *   only when `codex=true`, `agents` is non-empty, or `out=true`. A default
 *   `/cf-review` never reads it.
 *
 * The set below is checked against the directory listing at runtime, so a new
 * reference file fails the bench until someone classifies it here.
 */
const REFERENCES = {
  "external-reviewers.md": { unconditional: false },
};

function parseArgs(argv) {
  const opts = { ref: null, runs: 1 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--ref") opts.ref = argv[++i];
    else if (arg === "--working-tree") opts.ref = null;
    else if (arg === "--runs") opts.runs = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isInteger(opts.runs) || opts.runs < 1) {
    throw new Error(`--runs must be a positive integer, got: ${opts.runs}`);
  }
  return opts;
}

function readAt(relPath, ref) {
  if (!ref) return fs.readFileSync(path.join(repoRoot, relPath), "utf8");
  const res = spawnSync("git", ["show", `${ref}:${relPath}`], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0) {
    throw new Error(
      `git show ${ref}:${relPath} failed (${res.status}): ${res.stderr?.trim()}`,
    );
  }
  return res.stdout;
}

function listReferences(ref) {
  if (!ref) {
    return fs
      .readdirSync(path.join(repoRoot, REFERENCE_DIR))
      .filter((name) => name.endsWith(".md"))
      .sort();
  }
  const res = spawnSync(
    "git",
    ["ls-tree", "--name-only", `${ref}:${REFERENCE_DIR}`],
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (res.status !== 0) {
    throw new Error(
      `git ls-tree ${ref}:${REFERENCE_DIR} failed (${res.status}): ${res.stderr?.trim()}`,
    );
  }
  return res.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((name) => name.endsWith(".md"))
    .sort();
}

/** Reference files the skill loads on every review, for the given source. */
function unconditionalReferences(ref) {
  const present = listReferences(ref);
  const unclassified = present.filter((name) => !REFERENCES[name]);
  assert.equal(
    unclassified.length,
    0,
    `unclassified reference file(s): ${unclassified.join(", ")} — add them to REFERENCES in this script and say whether the skill loads them unconditionally`,
  );
  return present
    .filter((name) => REFERENCES[name].unconditional)
    .map((name) => `${REFERENCE_DIR}/${name}`);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const pad = (v, w) => String(v).padStart(w);

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { fromPreTrained } = await import("@lenml/tokenizer-claude");
  const tokenizer = fromPreTrained();

  const source = opts.ref ? `git ref ${opts.ref}` : "working tree";
  const alwaysLoaded = [SKILL, ...unconditionalReferences(opts.ref)];
  const files = new Map(); // relPath -> { bytes, tokens }

  for (const relPath of [
    ...alwaysLoaded,
    ...new Set(Object.values(MODES).flat()).values(),
  ].map((p) => (p.endsWith(".md") ? p : `plugin/agents/${p}.md`))) {
    const text = readAt(relPath, opts.ref);
    const samples = [];
    for (let i = 0; i < opts.runs; i++)
      samples.push(tokenizer.encode(text).length);
    files.set(relPath, {
      bytes: Buffer.byteLength(text, "utf8"),
      tokens: median(samples),
    });
  }

  console.log(`cf-review static instruction footprint — source: ${source}`);
  console.log(
    `runs: ${opts.runs} (median) · tokenizer: @lenml/tokenizer-claude\n`,
  );

  for (const [mode, agents] of Object.entries(MODES)) {
    const paths = [
      ...alwaysLoaded,
      ...agents.map((a) => `plugin/agents/${a}.md`),
    ];
    console.log(
      `${mode} — ${agents.length} agent file(s) + ${alwaysLoaded.length} always-loaded skill file(s)`,
    );
    let bytes = 0;
    let tokens = 0;
    for (const p of paths) {
      const m = files.get(p);
      assert.ok(m, `missing measurement for ${p}`);
      bytes += m.bytes;
      tokens += m.tokens;
      console.log(`  ${pad(m.tokens, 6)} tok  ${pad(m.bytes, 7)} B  ${p}`);
    }
    console.log(
      `  ${pad(tokens, 6)} tok  ${pad(bytes, 7)} B  TOTAL (${paths.length} files)\n`,
    );
  }

  console.log(
    [
      "NOTE: these numbers are the STATIC INSTRUCTION FOOTPRINT of the skill and",
      "agent markdown files each mode loads. They are NOT billed tokens (no diff,",
      "file contents, tool results, or model output is included), NOT latency, and",
      "NOT a measure of review quality. Reference files the skill loads on every",
      "review are counted with the skill; conditional loads (external reviewer",
      "references/runners, custom guides) are excluded.",
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error(`bench-cf-review: ${err.message}`);
  process.exit(1);
});
