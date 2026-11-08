import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import { resolveDecisionConfig, type DecisionConfig } from "../config.js";
import { checkGate, decide, type DecisionRequest } from "../decide.js";
import { runTest } from "../decide-eval.js";
import {
  appendDecisionLog,
  hashState,
  summarizeDecisionLog,
  type DecisionLogEntry,
} from "../decide-log.js";

const FAKE_KEY = "test-key-not-real-0000";
const STATE_TEXT = "the quick brown fox owns a private diary";

const request: DecisionRequest = {
  state: STATE_TEXT,
  questions: {
    leak: { type: "noul", instructions: "Contains a secret" },
    kind: {
      type: "choice",
      instructions: "Kind of text",
      criteria: { prose: null, code: "Source code" },
    },
    risk: {
      type: "score",
      instructions: "Risk level",
      criteria: ["low", "high"],
    },
  },
};

const answersBody = {
  model: "kev-test-1",
  answers: {
    leak: { type: "noul", noul: 0.25 },
    kind: {
      type: "choice",
      choice: "prose",
      confidence: 0.9,
      probabilities: { prose: 0.9, code: 0.1 },
    },
    risk: {
      type: "score",
      score: 0.4,
      confidence: 0.6,
      probabilities: { "0": 0.6, "1": 0.4 },
    },
  },
  latency_ms: 12,
};

function cfg(over: Partial<DecisionConfig>): DecisionConfig {
  return {
    provider: "local",
    model: "kev-latest",
    baseUrl: "http://127.0.0.1:8009",
    timeoutMs: 5000,
    allowRemote: false,
    reviewShadow: false,
    redactThreshold: 0.5,
    ...over,
  };
}

/** Write the global config's decision block (the only one decide reads). */
function writeGlobal(decision: Partial<DecisionConfig>): void {
  const dir = join(root, "home", ".coding-friend");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), JSON.stringify({ decision }));
}

let root: string;
let server: Server | undefined;
const fetchMock = vi.fn();

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cf-decide-"));
  vi.stubEnv("HOME", join(root, "home"));
  vi.stubEnv("CF_DECISIONS_DIR", join(root, "decisions"));
  vi.stubEnv("TYPESAFE_API_KEY", "");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fetchMock.mockReset();
  if (server) {
    server.closeAllConnections();
    await new Promise((r) => server!.close(r));
    server = undefined;
  }
  rmSync(root, { recursive: true, force: true });
});

/** Stub on 127.0.0.1; `respond` false = accept the request and never answer. */
async function startStub(
  respond: boolean,
  seen: { url?: string; auth?: string } = {},
): Promise<string> {
  server = createServer((req, res) => {
    seen.url = req.url;
    seen.auth = req.headers.authorization;
    req.resume();
    if (!respond) return;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(answersBody));
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

describe("data-egress gate", () => {
  it("refuses a cloud provider when allowRemote is only in the local config", async () => {
    const home = join(root, "home");
    mkdirSync(join(home, ".coding-friend"), { recursive: true });
    writeFileSync(
      join(home, ".coding-friend", "config.json"),
      JSON.stringify({ decision: { provider: "typesafe" } }),
    );
    const project = join(root, "project");
    mkdirSync(join(project, ".coding-friend"), { recursive: true });
    writeFileSync(
      join(project, ".coding-friend", "config.json"),
      JSON.stringify({ decision: { provider: "typesafe", allowRemote: true } }),
    );
    vi.spyOn(process, "cwd").mockReturnValue(project);
    vi.stubEnv("TYPESAFE_API_KEY", FAKE_KEY);
    vi.stubGlobal("fetch", fetchMock);

    expect(resolveDecisionConfig().allowRemote).toBe(false);
    const result = await decide(request, { point: "test" });

    expect(result).toEqual({ ok: false, reason: "gate" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a local provider with a non-loopback baseUrl as remote", async () => {
    writeGlobal({ provider: "local", baseUrl: "http://203.0.113.5:8009" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await decide(request, { point: "test" });

    expect(result).toEqual({ ok: false, reason: "gate" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // Loopback only by IP literal and only over http(s); anything else is remote.
  it.each([
    ["http://127.0.0.1:8009", true],
    ["https://127.0.0.1", true],
    ["http://[::1]:8009", true],
    ["http://localhost:8009", false],
    ["ftp://127.0.0.1", false],
    ["127.0.0.1:8009", false],
  ])("local baseUrl %s is loopback: %s", (baseUrl, loopback) => {
    expect(checkGate(cfg({ baseUrl })).ok).toBe(loopback);
    expect(checkGate(cfg({ baseUrl, allowRemote: true })).ok).toBe(true);
  });

  it("cf decide test does not reach a remote provider while allowRemote is off", async () => {
    writeGlobal({ provider: "typesafe" });
    vi.stubEnv("TYPESAFE_API_KEY", FAKE_KEY);
    vi.stubGlobal("fetch", fetchMock);

    const result = await runTest();

    expect(result).toMatchObject({ ok: false, reason: "gate" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("local provider over HTTP", () => {
  it("returns parsed answers from a loopback server, without an auth header", async () => {
    const seen: { url?: string; auth?: string } = {};
    writeGlobal({ provider: "local", baseUrl: await startStub(true, seen) });

    const result = await decide(request, { point: "test" });

    expect(result).toMatchObject({
      ok: true,
      model: "kev-test-1",
      answers: {
        leak: 0.25,
        kind: {
          choice: "prose",
          confidence: 0.9,
          probabilities: { prose: 0.9, code: 0.1 },
        },
        risk: { score: 0.4, confidence: 0.6 },
      },
    });
    expect(seen.url).toBe("/v1/systemone");
    expect(seen.auth).toBeUndefined();
  });

  it("reports timeout when the server never answers", async () => {
    writeGlobal({
      provider: "local",
      baseUrl: await startStub(false),
      timeoutMs: 150,
    });

    const result = await decide(request, { point: "test" });

    expect(result).toEqual({ ok: false, reason: "timeout" });
  });
});

describe("decision log", () => {
  it("never records state text or the API key", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", FAKE_KEY);
    let sentAuth: string | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sentAuth = new Headers(init.headers).get("authorization");
        return new Response(JSON.stringify(answersBody), { status: 200 });
      }),
    );
    const c = cfg({
      provider: "typesafe",
      model: "jev-1.14.0",
      allowRemote: true,
    });
    writeGlobal(c);

    const result = await decide(request, { point: "test" });
    expect(result.ok).toBe(true);
    expect(sentAuth).toBe(`Bearer ${FAKE_KEY}`);

    // A careless caller passes extra fields; only whitelisted ones are written.
    appendDecisionLog({
      v: 1,
      ts: new Date().toISOString(),
      point: "test",
      provider: c.provider,
      model: result.ok ? result.model : c.model,
      ok: result.ok,
      latencyMs: result.ok ? result.latencyMs : undefined,
      answers: { leak: 0.25 },
      stateHash: hashState(request.state),
      ...({ state: STATE_TEXT, authorization: `Bearer ${FAKE_KEY}` } as object),
    });

    const text = readFileSync(join(root, "decisions", "log.jsonl"), "utf-8");
    expect(text.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(text)).toMatchObject({ point: "test", ok: true });
    expect(text).not.toContain(STATE_TEXT);
    expect(text).not.toContain(FAKE_KEY);
    expect(text.toLowerCase()).not.toContain("authorization");
  });

  it("tightens an existing log dir and file to 0700/0600", () => {
    const dir = join(root, "decisions");
    mkdirSync(dir, { mode: 0o755 });
    chmodSync(dir, 0o755);
    writeFileSync(join(dir, "log.jsonl"), "", { mode: 0o644 });
    chmodSync(join(dir, "log.jsonl"), 0o644);

    appendDecisionLog({
      v: 1,
      ts: "",
      point: "test",
      provider: "off",
      model: "",
      ok: false,
    });

    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(join(dir, "log.jsonl")).mode & 0o777).toBe(0o600);
  });

  it("never writes through a symlinked log file", () => {
    const dir = join(root, "decisions");
    mkdirSync(dir);
    const target = join(root, "target.txt");
    writeFileSync(target, "");
    symlinkSync(target, join(dir, "log.jsonl"));

    appendDecisionLog({
      v: 1,
      ts: "",
      point: "test",
      provider: "off",
      model: "",
      ok: false,
    });

    expect(readFileSync(target, "utf-8")).toBe("");
    expect(lstatSync(join(dir, "log.jsonl")).isSymbolicLink()).toBe(true);
  });
});

describe("summarizeDecisionLog", () => {
  it("counts runs, findings, fallbacks and per-severity shares since a date", () => {
    const at = (
      ts: string,
      e: Partial<DecisionLogEntry>,
    ): DecisionLogEntry => ({
      v: 1,
      ts,
      point: "review_fp",
      provider: "local",
      model: "kev-latest",
      ok: true,
      ...e,
    });
    const T = "2026-11-05T10:00:00.000Z";
    const entries: DecisionLogEntry[] = [
      // two run lines (no findingHash): skip counts add up
      at(T, { answers: { asked: 2, skippedSecurity: 1, skippedBudget: 2 } }),
      at(T, { answers: { asked: 0, skippedSecurity: 3 } }),
      // answered, below the 0.2 threshold
      at(T, {
        findingHash: "aa",
        severity: "important",
        answers: { noul: 0.1 },
        latencyMs: 30,
      }),
      // answered, above it
      at(T, {
        findingHash: "bb",
        severity: "important",
        answers: { noul: 0.9 },
        latencyMs: 10,
      }),
      // a fallback (ok:false)
      at(T, {
        findingHash: "cc",
        severity: "critical",
        ok: false,
        fallbackReason: "timeout",
      }),
      // dropped by sinceMs: bad ts and an older line
      at("not-a-date", {
        findingHash: "dd",
        severity: "critical",
        answers: { noul: 0 },
      }),
      at("2026-11-01T00:00:00.000Z", { point: "export" }),
    ];

    const summary = summarizeDecisionLog(entries, {
      sinceMs: Date.parse("2026-11-05T00:00:00.000Z"),
      threshold: 0.2,
    });

    expect(summary).toEqual({
      since: "2026-11-05T00:00:00.000Z",
      threshold: 0.2,
      lines: { export: 0, review_fp: 5, test: 0, eval: 0 },
      reviewFp: {
        runs: 2,
        findings: 3,
        answered: 2,
        fallback: 1,
        fallbackRate: 1 / 3,
        p50Ms: 10,
        p95Ms: 30,
        bySeverity: {
          critical: { answered: 0, belowThreshold: 0, share: null },
          important: { answered: 2, belowThreshold: 1, share: 0.5 },
          suggestion: { answered: 0, belowThreshold: 0, share: null },
        },
        skippedSecurity: 4,
        skippedSecretPath: 0,
        skippedSecretContent: 0,
        skippedNoContext: 0,
        skippedOverLimit: 0,
        skippedBudget: 2,
      },
    });
  });
});
