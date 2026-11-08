import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { basename, join } from "path";
import { reviewFalsePositives } from "../decide-review.js";

// Fake GitHub-PAT shape built at runtime (all x's) so scanners never see it.
const FAKE_TOKEN = "ghp_" + "x".repeat(36);
const REVIEW_ROOT = "/tmp/coding-friend/review";
// PEM body line and END marker, built at runtime so scanners never see a key.
const PEM_BODY = "Q".repeat(48);
const PEM_END = "-----" + "END RSA " + "PRIVATE" + " KEY-----";
// URL-safe base64 (with - and _), the shape of a JWT segment.
const URLSAFE_B64 = "Q".repeat(30) + "-_" + "Q".repeat(30);
// Credential files beyond the env/pem/key ones: one row per pattern shape.
const SECRET_FILES = [
  [".pgpass", "PGPASS"],
  ["deploy/kubeconfig", "KUBECONFIG"],
  ["keys/service-account-prod.json", "SERVICE_ACCOUNT"],
  ["release.jks", "JKS"],
];

const diff = [
  "=== METADATA ===",
  "has_committed=false",
  "=== END METADATA ===",
  "",
  "=== git diff HEAD (uncommitted changes) ===",
  "diff --git a/src/app.ts b/src/app.ts",
  "--- a/src/app.ts",
  "+++ b/src/app.ts",
  "@@ -0,0 +1,3 @@",
  "+export function run(input) {",
  "+  return runShell(input);",
  "+}",
  "diff --git a/src/auth.ts b/src/auth.ts",
  "--- a/src/auth.ts",
  "+++ b/src/auth.ts",
  "@@ -0,0 +1,2 @@",
  "+const SECURITY_MARKER = 1;",
  "+export {};",
  "",
  "=== Untracked files (new, not yet staged) ===",
  "--- new file: .env.local",
  "SECRET_PATH_MARKER=1",
  "",
  "--- new file: config/secrets.yml",
  "SECRETS_YML_MARKER: 1",
  "",
  "--- new file: src/util.ts",
  "export const a = 1;",
  "export const b = a + 1;",
  "",
  "--- new file: src/cert.ts",
  "export const CERT = `",
  PEM_BODY,
  PEM_END,
  "`;",
  "",
  "--- new file: src/blob.ts",
  "export const BLOB =",
  URLSAFE_B64,
  "",
  ...SECRET_FILES.flatMap(([path, tag]) => [
    `--- new file: ${path}`,
    `${tag}_MARKER=1`,
    "",
  ]),
  "",
].join("\n");

const report = [
  "## 🔍 Code Review: uncommitted (STANDARD mode)",
  "",
  "### 🚨 Critical Issues",
  "- **[L3: Security]** [src/auth.ts:1] SECURITY_FINDING hardcoded marker (confidence: 0.9)",
  "",
  "### ⚠️ Important Issues",
  `- **[L2]** [src/app.ts:2] shell call on input leaks ${FAKE_TOKEN} — impact (confidence: 0.8)`,
  "  Recommendation: validate input",
  "- **[L2]** [.env.local:1] ENV_FINDING value committed (confidence: 0.7)",
  "- **[L2]** [config/secrets.yml:1] YML_FINDING value committed (confidence: 0.7)",
  "- **[L2]** [src/util.ts:1] PASSWORD_FINDING hardcoded password (confidence: 0.7)",
  "",
  "### 💡 Suggestions",
  "- **[L4]** [src/util.ts:2] UTIL_FINDING add a test",
  "- **[L4]** [src/cert.ts:1] PEM_FINDING embedded cert body",
  "- **[L4]** [src/blob.ts:1] BLOB_FINDING embedded blob",
  ...SECRET_FILES.map(
    ([path, tag]) => `- **[L4]** [${path}:1] ${tag}_FINDING value committed`,
  ),
  "",
  "### 📋 Summary",
  "- **[L2]** [src/app.ts:1] SUMMARY_BULLET must not be parsed",
  "Review status: COMPLETE",
].join("\n");

let root: string;
let snapshotDir: string | undefined;
const fetchMock = vi.fn(
  async () =>
    new Response(
      JSON.stringify({
        model: "kev-latest",
        answers: { matches: { type: "noul", noul: 0.8 } },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cf-decide-review-"));
  const home = join(root, "home");
  mkdirSync(join(home, ".coding-friend"), { recursive: true });
  writeFileSync(
    join(home, ".coding-friend", "config.json"),
    JSON.stringify({
      decision: { provider: "local", baseUrl: "http://127.0.0.1:8009" },
    }),
  );
  vi.stubEnv("HOME", home);
  vi.stubEnv("CF_DECISIONS_DIR", join(root, "decisions"));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockClear();
  rmSync(root, { recursive: true, force: true });
  if (snapshotDir) rmSync(snapshotDir, { recursive: true, force: true });
  snapshotDir = undefined;
});

function writeSnapshot(dir: string, d = diff, r = report): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "diff.txt"), d);
  const reportPath = join(dir, "report.md");
  writeFileSync(reportPath, r);
  return reportPath;
}

describe("reviewFalsePositives", () => {
  it("asks only for non-security, non-secret-path findings, with redacted state", async () => {
    snapshotDir = join(
      REVIEW_ROOT,
      `cf-test-decide-review-${process.pid}-${Date.now()}`,
    );
    const reportPath = writeSnapshot(snapshotDir);

    const result = await reviewFalsePositives({ snapshotDir, reportPath });

    expect(result.ok).toBe(true);
    expect(result.asked).toBe(2);
    expect(result.skippedSecurity).toBe(2);
    expect(result.skippedSecretPath).toBe(2 + SECRET_FILES.length);
    expect(result.skippedSecretContent).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const bodies = fetchMock.mock.calls.map(
      (call) => (call as unknown as [string, RequestInit])[1].body as string,
    );
    const states = bodies.map(
      (b) => (JSON.parse(b) as { state: { finding: string } }).state,
    );
    const app = states.find((s) => s.finding.includes("shell call on input"));
    expect(app).toBeDefined();
    expect(app!.finding).toContain("[REDACTED:github]");
    for (const body of bodies) {
      expect(body).not.toContain("ghp_");
      expect(body).not.toContain("SECURITY");
      expect(body).not.toContain("ENV_FINDING");
      expect(body).not.toContain("SECRET_PATH_MARKER");
      expect(body).not.toContain("YML_FINDING");
      expect(body).not.toContain("SECRETS_YML_MARKER");
      expect(body).not.toContain("PASSWORD_FINDING");
      expect(body).not.toContain("PEM_FINDING");
      expect(body).not.toContain(PEM_BODY);
      expect(body).not.toContain(URLSAFE_B64);
      for (const [, tag] of SECRET_FILES) expect(body).not.toContain(tag);
    }

    const log = readFileSync(join(root, "decisions", "log.jsonl"), "utf-8");
    const lines = log
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines).toHaveLength(3);
    const runLines = lines.filter((l) => !("findingHash" in l));
    expect(runLines).toHaveLength(1);
    expect(runLines[0]).toMatchObject({
      point: "review_fp",
      runId: basename(snapshotDir),
    });
    // asked + all skipped = every parsed finding
    expect(runLines[0].answers).toEqual({
      asked: 2,
      skippedSecurity: 2,
      skippedSecretPath: 2 + SECRET_FILES.length,
      skippedSecretContent: 2,
      skippedNoContext: 0,
      skippedOverLimit: 0,
      skippedBudget: 0,
    });
    expect(log).not.toContain("shell call on input");
    expect(log).not.toContain("src/");
  });

  it("sends nothing to a remote provider while allowRemote is off", async () => {
    writeFileSync(
      join(root, "home", ".coding-friend", "config.json"),
      JSON.stringify({ decision: { provider: "typesafe" } }),
    );
    vi.stubEnv("TYPESAFE_API_KEY", "fake-key");
    snapshotDir = join(
      REVIEW_ROOT,
      `cf-test-decide-review-gate-${process.pid}-${Date.now()}`,
    );
    const reportPath = writeSnapshot(snapshotDir);

    const result = await reviewFalsePositives({ snapshotDir, reportPath });

    expect(result).toMatchObject({ ok: false, reason: "gate" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the later diff section's lines for a file in both sections", async () => {
    snapshotDir = join(
      REVIEW_ROOT,
      `cf-test-decide-review-sections-${process.pid}-${Date.now()}`,
    );
    const twoSections = [
      "=== git diff main...HEAD (committed branch changes) ===",
      "diff --git a/src/late.ts b/src/late.ts",
      "--- a/src/late.ts",
      "+++ b/src/late.ts",
      "@@ -0,0 +1,3 @@",
      "+export const one = 1;",
      "+export const two = 2;",
      "+export const three = 3;",
      "",
      "=== git diff HEAD (uncommitted changes) ===",
      "diff --git a/src/late.ts b/src/late.ts",
      "--- a/src/late.ts",
      "+++ b/src/late.ts",
      "@@ -10,1 +10,1 @@",
      "-export const ten = 10;",
      "+export const ten = 11;",
      "",
    ].join("\n");
    const stale = [
      "### ⚠️ Important Issues",
      "- **[L2]** [src/late.ts:2] STALE_FINDING wrong constant",
    ].join("\n");
    const reportPath = writeSnapshot(snapshotDir, twoSections, stale);

    const result = await reviewFalsePositives({ snapshotDir, reportPath });

    // Line 2 is only in the earlier (now stale) section: no context.
    expect(result).toMatchObject({ ok: true, asked: 0, skippedNoContext: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a report over the size cap without sending anything", async () => {
    snapshotDir = join(
      REVIEW_ROOT,
      `cf-test-decide-review-big-${process.pid}-${Date.now()}`,
    );
    const reportPath = writeSnapshot(snapshotDir, diff, "x".repeat(262_145));

    await expect(
      reviewFalsePositives({ snapshotDir, reportPath }),
    ).rejects.toMatchObject({
      code: "INVALID_ARGS",
      message: expect.stringMatching(/larger than/),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a snapshot dir outside /tmp/coding-friend/review/", async () => {
    const reportPath = writeSnapshot(join(root, "outside"));

    await expect(
      reviewFalsePositives({ snapshotDir: join(root, "outside"), reportPath }),
    ).rejects.toMatchObject({ code: "INVALID_ARGS" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
