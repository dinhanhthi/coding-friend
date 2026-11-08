import { closeSync, openSync, readSync, realpathSync, statSync } from "fs";
import { homedir } from "os";
import { basename, isAbsolute, join, relative } from "path";
import { resolveDecisionConfig } from "./config.js";
import { checkGate, decide, type DecisionRequest } from "./decide.js";
import { appendDecisionLog, hashState } from "./decide-log.js";
import { runPool } from "./decide-util.js";
import { CliError } from "./output.js";
import { redactText } from "./redact.js";

/**
 * D3 shadow: ask the decision model, per `/cf-review` finding, whether the
 * changed code really shows the problem. Only logs; never changes the report.
 *
 * - Never sent: L3 (security) findings or any finding worded as security,
 *   findings on secret-like paths,
 *   findings whose line is not in the snapshot's post-image, and findings
 *   whose code context looks like key material.
 * - Finding text and code context go through redactText before sending.
 * - The gate is required; cfg is global-only.
 */

const REVIEW_ROOT = "/tmp/coding-friend/review";
const MAX_REPORT_BYTES = 256 * 1024;
// A larger diff.txt is never read past this: every finding lacks context.
const MAX_DIFF_BYTES = 8 * 1024 * 1024;
const MAX_FINDINGS = 50;
const BUDGET_MS = 20_000;
const CONCURRENCY = 4;
const CONTEXT_LINES = 20;
export const QUESTION_ID = "matches";
export const INSTRUCTIONS =
  "The code in `code` shows the exact problem described in `finding`.";
// Same pattern as decide-log's ID_RE, so the runId survives log sanitizing.
const RUN_ID_RE = /^[A-Za-z0-9_.-]{1,100}$/;
// Tested on the full path. Mirrors plugin/lib/privacy-patterns.sh (sensitive
// and keyword patterns) plus a few credential files, but without its safe
// allowlist or code-extension exemption: over-skipping only costs a sample.
const SECRET_PATH_RE =
  /(^|\/)\.env|\.env$|\.env\.|\.(pem|key|p12|pfx|keystore|tfvars)$|(^|\/)id_|id_rsa|id_ed25519|\.(ssh|aws|gnupg)\/|\.(npmrc|netrc)$|credential|secret|(^|\/)\.(pgpass|htpasswd|dockercfg)$|kubeconfig|(^|\/)service-account[^/]*\.json$|\.(jks|p8|gpg)$/i;
// Security wording in a finding filed under another layer.
const SECURITY_TEXT_RE =
  /secret|secur|vulnerab|token|credential|password|passwd|api[ _-]?key|private[ _-]?key|injection|xss|csrf|ssrf|auth|permission|sanitiz|escape|crypto|cve/i;
// Key material redactText may miss, e.g. a context window starting mid-PEM.
const SECRET_CONTENT_RE = /PRIVATE KEY|-----END/;
// Standard and URL-safe base64 (- _), and JWT segments joined by dots.
const BASE64_LINE_RE = /^[A-Za-z0-9+/=_.-]{40,}$/;

function isSecretPath(path: string): boolean {
  return SECRET_PATH_RE.test(path.replace(/\\/g, "/"));
}

/** Raw context lines (no "n: " prefix) that look like key material. */
function isSecretContent(lines: string[]): boolean {
  return lines.some(
    (l) => SECRET_CONTENT_RE.test(l) || BASE64_LINE_RE.test(l.trim()),
  );
}

export type Severity = "critical" | "important" | "suggestion";

export interface ReviewFinding {
  severity: Severity;
  layer: string;
  security: boolean;
  file?: string;
  line?: number;
  text: string;
}

export interface ReviewFpAnswer {
  severity: Severity;
  layer: string;
  findingHash: string;
  ok: boolean;
  noul?: number;
  fallbackReason?: string;
}

export interface ReviewFpResult {
  ok: boolean;
  reason?: string;
  runId: string;
  asked: number;
  skippedSecurity: number;
  skippedSecretPath: number;
  skippedNoContext: number;
  /** Code context that looks like key material (PEM marker or base64 line). */
  skippedSecretContent: number;
  /** Findings past MAX_FINDINGS, never looked at. */
  skippedOverLimit: number;
  /** Findings never started: the budget fired (or the caller aborted). */
  skippedBudget: number;
  answers?: ReviewFpAnswer[];
}

function invalid(message: string): never {
  throw new CliError("INVALID_ARGS", message);
}

/** realpath of `p`, which must sit strictly under the realpath of REVIEW_ROOT. */
function realUnderRoot(p: string, what: string): string {
  let root: string;
  let real: string;
  try {
    root = realpathSync(REVIEW_ROOT);
    real = realpathSync(p);
  } catch {
    invalid(`${what} must be under ${REVIEW_ROOT}/`);
  }
  const rel = relative(root, real);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    invalid(`${what} must be under ${REVIEW_ROOT}/`);
  }
  return real;
}

const SECTION_SEVERITY: Array<[string, Severity]> = [
  ["\u{1F6A8}", "critical"],
  ["⚠", "important"],
  ["\u{1F4A1}", "suggestion"],
];
const BULLET_RE = /^\s*[-*]\s+\*\*\[(L[0-4])(?::\s*([^\]]*))?\]\*\*\s*(.*)$/;
const LOCATION_RE = /^\[`?([^\]`:]+?)`?:(\d+)(?:[-–]\d+)?\]\s*(.*)$/;

/** Bullets under the 🚨 / ⚠️ / 💡 sections of a cf-reviewer report. */
function parseFindings(report: string): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  let severity: Severity | null = null;
  for (const line of report.split("\n")) {
    if (/^\s*#/.test(line)) {
      severity =
        SECTION_SEVERITY.find(([emoji]) => line.includes(emoji))?.[1] ?? null;
      continue;
    }
    if (!severity) continue;
    const bullet = BULLET_RE.exec(line);
    if (!bullet) continue;
    const [, layer, label = "", rest] = bullet;
    const loc = LOCATION_RE.exec(rest.trim());
    const text = (loc ? loc[3] : rest).trim();
    // cf-reviewer defines L3 as the security layer, so any L3 counts; so does
    // security wording in the label or text (not the path) of any layer.
    const security =
      layer === "L3" ||
      /security/i.test(label) ||
      SECURITY_TEXT_RE.test(`${label} ${text}`);
    findings.push(
      loc
        ? {
            severity,
            layer,
            security,
            file: loc[1].trim().replace(/^\.\//, ""),
            line: Number(loc[2]),
            text,
          }
        : { severity, layer, security, text },
    );
  }
  return findings;
}

const HUNK_RE = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const NEW_FILE_RE = /^--- new file: (.*)$/;

/**
 * File → (post-image line number → text) from a gather-diff snapshot. A file
 * in several `=== ` sections (branch, then working tree) keeps only the lines
 * of its last section: earlier line numbers may be stale.
 */
function parsePostImage(diff: string): Map<string, Map<number, string>> {
  const files = new Map<string, Map<number, string>>();
  let inSection = new Set<string>();
  const fileMap = (path: string): Map<number, string> => {
    let m = files.get(path);
    if (!m || !inSection.has(path)) files.set(path, (m = new Map()));
    inSection.add(path);
    return m;
  };
  const lines = diff.split("\n");
  let current: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const newFile = NEW_FILE_RE.exec(line);
    if (newFile) {
      current = null;
      if (/ \((binary|symlink), content omitted\)$/.test(newFile[1])) continue;
      const body: string[] = [];
      while (
        i + 1 < lines.length &&
        !NEW_FILE_RE.test(lines[i + 1]) &&
        !lines[i + 1].startsWith("=== ")
      ) {
        body.push(lines[++i]);
      }
      while (body.length && body[body.length - 1] === "") body.pop();
      const m = fileMap(newFile[1]);
      body.forEach((text, n) => m.set(n + 1, text));
      continue;
    }
    if (line.startsWith("diff --git ") || line.startsWith("=== ")) {
      current = null;
      if (line.startsWith("=== ")) inSection = new Set();
      continue;
    }
    if (line.startsWith("+++ ")) {
      const target = line.slice(4);
      current = target.startsWith("b/") ? target.slice(2) : null;
      continue;
    }
    const hunk = HUNK_RE.exec(line);
    if (!hunk || !current) continue;
    let oldLeft = hunk[1] === undefined ? 1 : Number(hunk[1]);
    let newLeft = hunk[3] === undefined ? 1 : Number(hunk[3]);
    let n = Number(hunk[2]);
    const m = fileMap(current);
    // Driven by the header counts: `--- a/next` also starts with "-".
    while ((oldLeft > 0 || newLeft > 0) && i + 1 < lines.length) {
      const l = lines[++i];
      if (l.startsWith("\\")) continue;
      if (l.startsWith("-")) {
        oldLeft--;
      } else if (l.startsWith("+")) {
        m.set(n++, l.slice(1));
        newLeft--;
      } else {
        m.set(n++, l.slice(1));
        oldLeft--;
        newLeft--;
      }
    }
  }
  return files;
}

/** The snapshot path a finding's `file` refers to, or null when absent. */
function resolveDiffPath(
  files: Map<string, Map<number, string>>,
  file: string,
): string | null {
  if (files.has(file)) return file;
  // Longest match: `a/b.ts` beats `b.ts` for `src/a/b.ts`.
  let found: string | null = null;
  for (const path of files.keys()) {
    if (file.endsWith(`/${path}`) && path.length > (found?.length ?? -1)) {
      found = path;
    }
  }
  return found;
}

/**
 * ±CONTEXT_LINES post-image lines around `line` (numbered, plus the raw
 * lines), or null when `line` is unknown.
 */
function contextFor(
  files: Map<string, Map<number, string>>,
  path: string,
  line: number,
): { code: string; raw: string[] } | null {
  const m = files.get(path);
  if (!m?.has(line)) return null;
  const out: string[] = [];
  const raw: string[] = [];
  for (let n = line - CONTEXT_LINES; n <= line + CONTEXT_LINES; n++) {
    const text = m.get(n);
    if (text !== undefined) {
      out.push(`${n}: ${text}`);
      raw.push(text);
    }
  }
  return { code: out.join("\n"), raw };
}

/** File text, or null when it is larger than `max` bytes (never read past). */
function readCapped(path: string, max: number): string | null {
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(max + 1);
    let len = 0;
    while (len < buf.length) {
      const n = readSync(fd, buf, len, buf.length - len, null);
      if (n === 0) break;
      len += n;
    }
    return len > max ? null : buf.toString("utf-8", 0, len);
  } finally {
    closeSync(fd);
  }
}

/**
 * Ask the model about each sendable finding of a cf-review report and log one
 * line per finding asked, plus one count line per run. Throws CliError(INVALID_ARGS) on bad inputs; returns
 * ok:false (nothing sent) when the gate is closed.
 */
export async function reviewFalsePositives(opts: {
  snapshotDir: string;
  reportPath: string;
  signal?: AbortSignal;
}): Promise<ReviewFpResult> {
  const snapshotDir = realUnderRoot(opts.snapshotDir, "--snapshot-dir");
  const reportPath = realUnderRoot(opts.reportPath, "--report");
  if (!statSync(snapshotDir).isDirectory()) {
    invalid("--snapshot-dir must be a directory");
  }
  // not a regular file (e.g. a FIFO would block the read)
  if (!statSync(reportPath).isFile()) invalid("--report must be a file");
  // Bounded read, not stat-then-readFileSync: the file can grow in between.
  const reportText = readCapped(reportPath, MAX_REPORT_BYTES);
  if (reportText === null) {
    invalid(`--report is larger than ${MAX_REPORT_BYTES} bytes`);
  }
  const runId = basename(snapshotDir);
  if (!RUN_ID_RE.test(runId)) invalid("--snapshot-dir name is not a run id");

  const result: ReviewFpResult = {
    ok: false,
    runId,
    asked: 0,
    skippedSecurity: 0,
    skippedSecretPath: 0,
    skippedNoContext: 0,
    skippedSecretContent: 0,
    skippedOverLimit: 0,
    skippedBudget: 0,
  };
  const cfg = resolveDecisionConfig();
  const gate = checkGate(cfg);
  if (!gate.ok) return { ...result, reason: gate.reason };

  const all = parseFindings(reportText);
  const findings = all.slice(0, MAX_FINDINGS);
  result.skippedOverLimit = all.length - findings.length;

  let files = new Map<string, Map<number, string>>();
  const diffPath = join(snapshotDir, "diff.txt");
  let diffReal: string | null = null;
  try {
    diffReal = realpathSync(diffPath);
  } catch {
    // no diff.txt: every finding lacks context
  }
  if (diffReal) {
    const diffTxt = realUnderRoot(diffReal, "diff.txt");
    // not a regular file (e.g. a FIFO would block the read): treated as no diff
    if (statSync(diffTxt).isFile()) {
      const text = readCapped(diffTxt, MAX_DIFF_BYTES);
      // over the cap: `files` stays empty, so every finding lacks context
      if (text !== null) files = parsePostImage(text);
    }
  }

  const home = homedir();
  const requests: Array<{
    finding: ReviewFinding;
    state: object;
    hash: string;
  }> = [];
  for (const f of findings) {
    if (f.security) {
      result.skippedSecurity++;
      continue;
    }
    const diffFile = f.file ? resolveDiffPath(files, f.file) : null;
    if (
      (f.file && isSecretPath(f.file)) ||
      (diffFile && isSecretPath(diffFile))
    ) {
      result.skippedSecretPath++;
      continue;
    }
    const ctx = diffFile && f.line ? contextFor(files, diffFile, f.line) : null;
    if (ctx === null) {
      result.skippedNoContext++;
      continue;
    }
    if (isSecretContent(ctx.raw)) {
      result.skippedSecretContent++;
      continue;
    }
    const finding = redactText(f.text, { home }).text;
    requests.push({
      finding: f,
      state: { finding, code: redactText(ctx.code, { home }).text },
      hash: hashState(finding),
    });
  }

  const ac = new AbortController();
  let budgetHit = false;
  const timer = setTimeout(() => {
    budgetHit = true;
    ac.abort();
  }, BUDGET_MS);
  const onAbort = (): void => ac.abort();
  if (opts.signal?.aborted) ac.abort();
  else opts.signal?.addEventListener("abort", onAbort, { once: true });

  const answers: ReviewFpAnswer[] = [];
  try {
    await runPool(
      requests.map(({ finding, state, hash }) => async () => {
        if (ac.signal.aborted) {
          result.skippedBudget++;
          return;
        }
        result.asked++;
        const request: DecisionRequest = {
          state,
          questions: {
            [QUESTION_ID]: { type: "noul", instructions: INSTRUCTIONS },
          },
        };
        const started = performance.now();
        const res = await decide(request, {
          point: "review_fp",
          signal: ac.signal,
        });
        const noul =
          res.ok && typeof res.answers[QUESTION_ID] === "number"
            ? res.answers[QUESTION_ID]
            : undefined;
        const fallbackReason = res.ok
          ? undefined
          : res.reason === "aborted" && budgetHit
            ? "timeout"
            : res.reason;
        const answer: ReviewFpAnswer = {
          severity: finding.severity,
          layer: finding.layer,
          findingHash: hash,
          ok: res.ok,
          ...(noul !== undefined && { noul }),
          ...(fallbackReason && { fallbackReason }),
        };
        answers.push(answer);
        appendDecisionLog({
          v: 1,
          ts: new Date().toISOString(),
          point: "review_fp",
          provider: cfg.provider,
          model: res.ok ? res.model : cfg.model,
          ok: res.ok,
          fallbackReason,
          latencyMs: res.ok
            ? res.latencyMs
            : Math.round(performance.now() - started),
          ...(noul !== undefined && { answers: { noul } }),
          runId,
          severity: finding.severity,
          layer: finding.layer,
          findingHash: hash,
        });
      }),
      // No signal: each job counts a budget abort as skippedBudget itself.
      { concurrency: CONCURRENCY },
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
  // One count line per run (no findingHash), so `cf decide log` sees every
  // run, including ones where every finding was skipped.
  appendDecisionLog({
    v: 1,
    ts: new Date().toISOString(),
    point: "review_fp",
    provider: cfg.provider,
    model: cfg.model,
    ok: true,
    answers: {
      asked: result.asked,
      skippedSecurity: result.skippedSecurity,
      skippedSecretPath: result.skippedSecretPath,
      skippedSecretContent: result.skippedSecretContent,
      skippedNoContext: result.skippedNoContext,
      skippedOverLimit: result.skippedOverLimit,
      skippedBudget: result.skippedBudget,
    },
    runId,
  });
  return { ...result, ok: true, answers };
}
