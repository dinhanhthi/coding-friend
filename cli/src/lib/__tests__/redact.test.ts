import { describe, it, expect } from "vitest";
import {
  type ExtraFilter,
  isCharSubsequence,
  redactText,
  runExportPipeline,
} from "../redact.js";

// Every token below is obviously fake (repeated x / X / 0) and is built by
// concatenation so secret scanners never see a real-looking literal.
const x = (n: number) => "x".repeat(n);
const X = (n: number) => "X".repeat(n);
const PEM_KIND = "PRIVATE " + "KEY";

const FAKE: Record<string, string> = {
  anthropic: "sk-" + "ant-api03-" + x(40),
  openai: "sk-" + "proj-" + x(40),
  github: "gh" + "p_" + x(36),
  aws: "AK" + "IA" + X(16),
  slack: "xo" + "xb-" + "0000000000-" + x(24),
  "slack-webhook":
    "https://hooks.slack.com/services/" +
    "T" +
    X(8) +
    "/B" +
    X(8) +
    "/" +
    x(24),
  google: "AI" + "za" + x(35),
  stripe: "sk" + "_live_" + x(24),
  jwt: "ey" + "J" + x(20) + ".ey" + "J" + x(20) + "." + x(20),
};

const pemBlock = (withEnd: boolean) =>
  [
    "-----BEGIN RSA " + PEM_KIND + "-----",
    x(64),
    x(64),
    withEnd ? "-----END RSA " + PEM_KIND + "-----" : "",
  ].join("\n");

// Values the generic rule must catch whole: short, quoted with spaces, and a
// JSON string nested inside serialized tool args (escaped quotes).
const SHORT_AND_QUOTED = [
  "pw" + "d=root",
  '"pass' + 'word": "my pass phrase"',
  JSON.stringify({
    command: "curl -d '" + JSON.stringify({ secret: "nested value" }) + "'",
  }),
];
const LONG_GITHUB = "gh" + "p_" + x(48);

const total = (counts: Record<string, number>) =>
  Object.values(counts).reduce((a, b) => a + b, 0);

describe("redactText", () => {
  it("redacts one fake token per kind and a multi-line PEM with exact counts", () => {
    const input =
      Object.entries(FAKE)
        .map(([kind, tok]) => `${kind}: ${tok}`)
        .join("\n") +
      "\n" +
      pemBlock(true) +
      "\nafter pem";
    const { text, counts } = redactText(input, {});
    for (const tok of Object.values(FAKE)) expect(text).not.toContain(tok);
    expect(text).not.toContain(x(64));
    expect(text).toContain("after pem");
    const expected: Record<string, number> = { pem: 1 };
    for (const kind of Object.keys(FAKE)) expected[kind] = 1;
    expect(counts).toEqual(expected);
  });

  it("redacts a PEM block with no END line to the end of the input", () => {
    const { text, counts } = redactText(
      "before\n" + pemBlock(false) + "\ntrailing " + x(10),
      {},
    );
    expect(text).toBe("before\n[REDACTED:pem]");
    expect(counts).toEqual({ pem: 1 });
  });

  it("redacts uppercase env keys, URL userinfo and JSON key/value pairs", () => {
    const pw = "hunter2" + x(8);
    const cases = [
      "DB_PASS" + "WORD=" + pw,
      "postgres://" + "u:p@h/db",
      JSON.stringify({ api_key: pw, password: pw }),
    ];
    const { text } = redactText(cases.join("\n"), {});
    expect(text).not.toContain(pw);
    expect(text).not.toContain("u:p@");
    expect(text).toContain("DB_PASSWORD=[REDACTED:");
    expect(text).toContain("postgres://[REDACTED:");
    expect(text).toContain('"password":"[REDACTED:');
  });

  it("redacts short and quoted generic values whole, and long GitHub tokens", () => {
    const { text } = redactText(
      [...SHORT_AND_QUOTED, LONG_GITHUB].join("\n"),
      {},
    );
    for (const leak of ["root", "my pass phrase", "pass phrase", "nested"]) {
      expect(text).not.toContain(leak);
    }
    expect(text).toContain("pwd=[REDACTED:generic]");
    expect(text).toContain('"password": "[REDACTED:generic]"');
    expect(text).toContain('secret\\":\\"[REDACTED:generic]\\"');
    expect(text).not.toContain("[REDACTED:github]x");
    expect(text).toContain("[REDACTED:github]");
  });

  it("replaces the home directory with ~ after secrets", () => {
    const { text, counts } = redactText(
      "open /Users/fake/proj/a.ts and /Users/fakeother/b",
      { home: "/Users/fake" },
    );
    expect(text).toBe("open ~/proj/a.ts and /Users/fakeother/b");
    expect(counts).toEqual({ home: 1 });
  });

  it("a second pass over its own output finds nothing", () => {
    const input = [
      ...Object.values(FAKE),
      pemBlock(true),
      "pass" + "word=" + x(12),
      "Authorization: Bearer " + x(32),
      "https://" + "user:pass@example.com/x",
      JSON.stringify({ token: x(20) }),
      "/Users/fake/notes",
      ...SHORT_AND_QUOTED,
      LONG_GITHUB,
    ].join("\n");
    const first = redactText(input, { home: "/Users/fake" });
    expect(total(first.counts)).toBeGreaterThan(0);
    const second = redactText(first.text, { home: "/Users/fake" });
    expect(second.text).toBe(first.text);
    expect(total(second.counts)).toBe(0);
  });
});

describe("runExportPipeline", () => {
  const secret = "gh" + "p_" + x(36);
  const segments = ["hello " + secret, "plain text"];
  const regexOnly = ["hello [REDACTED:github]", "plain text"];

  const run = (filter: ExtraFilter, timeoutMs = 1000) =>
    runExportPipeline(segments, { filter, timeoutMs });

  it("uses regex-only segments when no filter is given", async () => {
    const r = await runExportPipeline(segments, { timeoutMs: 1000 });
    expect(r.segments).toEqual(regexOnly);
    expect(r.counts).toEqual({ github: 1 });
    expect(r.filter).toEqual({ name: null, status: "none" });
  });

  it("rejects a filter that adds text and falls back to regex output", async () => {
    const r = await run({
      name: "adder",
      apply: async (s) => s.map((t) => t + "!"),
    });
    expect(r.segments).toEqual(regexOnly);
    expect(r.filter).toEqual({ name: "adder", status: "rejected" });
  });

  it("falls back when the filter throws", async () => {
    const r = await run({
      name: "thrower",
      apply: async (s) => {
        s[0] = secret;
        throw new Error("boom");
      },
    });
    expect(r.segments).toEqual(regexOnly);
    expect(r.filter.status).toBe("error");
  });

  it("falls back and aborts when the filter exceeds the timeout", async () => {
    let aborted = false;
    const r = await run(
      {
        name: "slow",
        apply: (s, signal) =>
          new Promise((resolve) => {
            signal.addEventListener("abort", () => {
              aborted = true;
            });
            setTimeout(() => resolve(s), 500);
          }),
      },
      20,
    );
    expect(r.segments).toEqual(regexOnly);
    expect(r.filter.status).toBe("timeout");
    expect(aborted).toBe(true);
  });

  it("accepts a filter that only removes characters", async () => {
    const r = await run({
      name: "trim",
      apply: async (s) => s.map((t) => t.replace("hello ", "")),
    });
    expect(r.segments).toEqual(["[REDACTED:github]", "plain text"]);
    expect(r.filter).toEqual({ name: "trim", status: "applied" });
    expect(isCharSubsequence("ace", "abcde")).toBe(true);
    expect(isCharSubsequence("aec", "abcde")).toBe(false);
  });
});
