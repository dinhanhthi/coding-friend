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
 * Dispatch graph, read from source (as of ref 565b0452 / working tree):
 *   - plugin/skills/cf-review/SKILL.md — Step 6 dispatches cf-reviewer;
 *     Step 4 additionally dispatches cf-explorer in DEEP mode only.
 *   - plugin/agents/cf-reviewer.md — "Review Modes" table: QUICK dispatches
 *     security + quality + tests; STANDARD/DEEP dispatch those plus plan +
 *     rules. Step 4 always dispatches cf-reviewer-reducer.
 *
 * Not counted (conditional / not part of the review fan-out): the external
 * reviewer runners and references/external-reviewers.md (only with
 * --with-codex / agent flags), and lib/load-custom-guide.sh output.
 */
const MODES = {
  QUICK: [
    "cf-reviewer",
    "cf-reviewer-security",
    "cf-reviewer-quality",
    "cf-reviewer-tests",
    "cf-reviewer-reducer",
  ],
  STANDARD: [
    "cf-reviewer",
    "cf-reviewer-plan",
    "cf-reviewer-security",
    "cf-reviewer-quality",
    "cf-reviewer-tests",
    "cf-reviewer-rules",
    "cf-reviewer-reducer",
  ],
  DEEP: [
    "cf-reviewer",
    "cf-reviewer-plan",
    "cf-reviewer-security",
    "cf-reviewer-quality",
    "cf-reviewer-tests",
    "cf-reviewer-rules",
    "cf-reviewer-reducer",
    "cf-explorer",
  ],
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
  const files = new Map(); // relPath -> { bytes, tokens }

  for (const relPath of [
    SKILL,
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
    const paths = [SKILL, ...agents.map((a) => `plugin/agents/${a}.md`)];
    console.log(`${mode} — ${agents.length} agent file(s) + 1 skill file`);
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
      "NOT a measure of review quality. Conditional loads (external reviewer",
      "references/runners, custom guides) are excluded.",
    ].join("\n"),
  );
}

main().catch((err) => {
  console.error(`bench-cf-review: ${err.message}`);
  process.exit(1);
});
