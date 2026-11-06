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

function writeSnapshot(dir: string): string {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "diff.txt"), diff);
  const reportPath = join(dir, "report.md");
  writeFileSync(reportPath, report);
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
    expect(result.skippedSecretPath).toBe(2);
    expect(result.skippedSecretContent).toBe(1);
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
    // asked + all skipped = the 7 parsed findings
    expect(runLines[0].answers).toEqual({
      asked: 2,
      skippedSecurity: 2,
      skippedSecretPath: 2,
      skippedSecretContent: 1,
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

  it("refuses a snapshot dir outside /tmp/coding-friend/review/", async () => {
    const reportPath = writeSnapshot(join(root, "outside"));

    await expect(
      reviewFalsePositives({ snapshotDir: join(root, "outside"), reportPath }),
    ).rejects.toMatchObject({ code: "INVALID_ARGS" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
