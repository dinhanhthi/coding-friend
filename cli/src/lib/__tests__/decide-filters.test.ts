import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { DecisionConfig } from "../config.js";
import {
  composeFilters,
  redactModelFilter,
  summaryFilter,
  type FilterStats,
} from "../decide-filters.js";
import { runExportPipeline, type SegmentKind } from "../redact.js";

// PII-style sentinel: plain text the regex pass leaves alone, so only the
// model can catch it. Not a secret shape, so scanners ignore it.
const PII = "reach Jane Doe at jane.doe at example dot test, 555-0100";
// LOW (10k) and HIGH's rendered 2k head each fit SUMMARY_BUDGET_CHARS (12k)
// alone, not both. LOW comes first, so only a working score sort keeps HIGH.
const LOW = "lorem ipsum filler line\n".repeat(417); // 10008 chars, scored 0
const HIGH = "TypeError in submit handler\n".repeat(250); // 7000 chars, scored 3

const segments = [
  "Debug the login form", // title
  "/home/dev/project", // cwd
  `Please mail the report, ${PII}`, // user
  LOW, // assistant
  "Bash", // toolName
  "ls -la", // toolArgs
  HIGH, // toolOutput
];
const kinds: SegmentKind[] = [
  "title",
  "cwd",
  "user",
  "assistant",
  "toolName",
  "toolArgs",
  "toolOutput",
];

const cfg: DecisionConfig = {
  provider: "local",
  model: "kev-latest",
  baseUrl: "http://127.0.0.1:8009",
  timeoutMs: 10_000,
  allowRemote: false,
  reviewShadow: false,
  redactThreshold: 0.5,
};

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cf-decide-filters-"));
  vi.stubEnv("HOME", join(root, "home"));
  vi.stubEnv("CF_DECISIONS_DIR", join(root, "decisions"));
  vi.stubEnv("TYPESAFE_API_KEY", "");
  vi.stubEnv("CLOUDFLARE_API_TOKEN", "");
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
  // decide() reads the global config itself; `cfg` gives the filters' threshold.
  const dir = join(root, "home", ".coding-friend");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), JSON.stringify({ decision: cfg }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("model export filters", () => {
  it.each([
    {
      name: "provider error",
      status: "error",
      fetch: async () => json({ detail: "boom" }, 500),
    },
    {
      name: "pipeline timeout",
      status: "timeout",
      // Never answers; rejects only when the filter aborts the request.
      fetch: (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    },
  ])(
    "falls back to the regex-only segments on $name",
    async ({ status, fetch }) => {
      vi.stubGlobal("fetch", vi.fn(fetch));
      const regexOnly = await runExportPipeline(segments, { timeoutMs: 50 });

      const result = await runExportPipeline(segments, {
        filter: composeFilters(redactModelFilter(cfg), summaryFilter()),
        timeoutMs: 50,
        kinds,
      });

      expect(result.segments).toEqual(regexOnly.segments);
      expect(result.filter).toEqual({ name: "redact-model+summary", status });
    },
  );

  it("drops a flagged segment, keeps the high-score part and the composed output passes runFilter", async () => {
    const noulStates: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as {
          state: string;
          questions: Record<string, { type: string }>;
        };
        const answers: Record<string, unknown> = {};
        for (const [id, q] of Object.entries(body.questions)) {
          if (q.type === "noul") {
            noulStates.push(body.state);
            answers[id] = {
              type: "noul",
              noul: body.state.includes("555-0100") ? 0.9 : 0.1,
            };
          } else {
            const low = body.state.startsWith("lorem");
            answers[id] = { type: "score", score: low ? 0 : 3, confidence: 1 };
          }
        }
        return json({ model: "kev-test-1", answers });
      }),
    );

    const result = await runExportPipeline(segments, {
      filter: composeFilters(redactModelFilter(cfg), summaryFilter()),
      timeoutMs: 5000,
      kinds,
    });

    expect(result.filter).toEqual({
      name: "redact-model+summary",
      status: "applied",
    });
    expect(result.segments).toEqual([
      segments[0],
      segments[1],
      "", // flagged by redact-model
      "", // LOW: score 0, no room left after HIGH
      segments[4],
      segments[5],
      HIGH, // score 3, ranked first
    ]);
    // cwd, tool names and tool args never leave the machine.
    for (const sent of noulStates) {
      expect(sent).not.toContain("/home/dev/project");
      expect(sent).not.toBe("Bash");
      expect(sent).not.toBe("ls -la");
    }
    expect(noulStates.every((s) => s.length <= 2000)).toBe(true);
  });

  it("sends only the rendered head of a long tool output to the model", async () => {
    const states: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as {
          state: string;
          questions: Record<string, unknown>;
        };
        states.push(body.state);
        const answers: Record<string, unknown> = {};
        for (const id of Object.keys(body.questions)) {
          answers[id] = { type: "noul", noul: 0.1 };
        }
        return json({ model: "kev-test-1", answers });
      }),
    );
    const head = "a".repeat(2000);
    const output = head + "never rendered\n".repeat(400); // ~8000 chars

    const result = await redactModelFilter(cfg).apply(
      [output],
      new AbortController().signal,
      { kinds: ["toolOutput"] },
    );

    expect(states).toEqual([head]);
    expect(result).toEqual([output]);
  });

  it("overlaps redact windows so PII across a 2000-char boundary is seen whole", async () => {
    const states: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as {
          state: string;
          questions: Record<string, unknown>;
        };
        states.push(body.state);
        const noul = body.state.includes("555-0100") ? 0.9 : 0.1;
        const answers: Record<string, unknown> = {};
        for (const id of Object.keys(body.questions)) {
          answers[id] = { type: "noul", noul };
        }
        return json({ model: "kev-test-1", answers });
      }),
    );
    // The sentinel "555-0100" spans index 2000: no 2000-char window holds it.
    const text = "a".repeat(1996) + "555-0100" + "b".repeat(1000);

    const result = await redactModelFilter(cfg).apply(
      [text],
      new AbortController().signal,
      { kinds: ["user"] },
    );

    expect(result).toEqual([""]);
    expect(states.every((s) => s.length <= 2000)).toBe(true);
  });

  it("never asks about a part over the summary budget and counts it as dropped", async () => {
    const states: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as {
          state: string;
          questions: Record<string, unknown>;
        };
        states.push(body.state);
        const answers: Record<string, unknown> = {};
        for (const id of Object.keys(body.questions)) {
          answers[id] = { type: "score", score: 3, confidence: 1 };
        }
        return json({ model: "kev-test-1", answers });
      }),
    );
    const big = "OVERSIZED part\n".repeat(900); // 13500 chars > 12000
    const small = "short answer";
    let stats: FilterStats | undefined;

    const result = await summaryFilter({
      onStats: (s) => {
        stats = s;
      },
    }).apply([big, small], new AbortController().signal, {
      kinds: ["assistant", "user"],
    });

    expect(states).toEqual([small]);
    expect(result).toEqual(["", small]);
    expect(stats).toMatchObject({ asked: 1, dropped: 1 });
  });
});
