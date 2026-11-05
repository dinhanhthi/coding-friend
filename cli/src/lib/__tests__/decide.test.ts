import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import { resolveDecisionConfig, type DecisionConfig } from "../config.js";
import { decide, type DecisionRequest } from "../decide.js";
import { appendDecisionLog, hashState } from "../decide-log.js";

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
    vi.stubGlobal("fetch", fetchMock);

    const result = await decide(request, {
      point: "test",
      cfg: cfg({ baseUrl: "http://203.0.113.5:8009" }),
    });

    expect(result).toEqual({ ok: false, reason: "gate" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("local provider over HTTP", () => {
  it("returns parsed answers from a loopback server, without an auth header", async () => {
    const seen: { url?: string; auth?: string } = {};
    const baseUrl = await startStub(true, seen);

    const result = await decide(request, {
      point: "test",
      cfg: cfg({ baseUrl }),
    });

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
    const baseUrl = await startStub(false);

    const result = await decide(request, {
      point: "test",
      cfg: cfg({ baseUrl, timeoutMs: 150 }),
    });

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

    const result = await decide(request, { point: "test", cfg: c });
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
});
