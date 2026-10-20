import { describe, it, expect } from "vitest";
import { decideNext, MAX_PAUSES, type TaskPolicy } from "../quota.js";
import type { AttemptEntry, AttemptKind, Provider } from "../store.js";

const NOW = 1_800_000_000;
const WAIT_MIN = 30;
const iso = (s: number) => new Date(s * 1000).toISOString();

function policy(over: Partial<TaskPolicy> = {}): TaskPolicy {
  return {
    onQuota: "wait-then-switch",
    waitMinutes: WAIT_MIN,
    fallback: ["claude", "codex"],
    noFallback: false,
    ...over,
  };
}

/** Attempt n on `provider`, paused `ago` seconds before NOW with a session. */
function paused(
  n: number,
  provider: Provider,
  resetsAt: number | null,
  opts: { ago?: number; kind?: AttemptKind } = {},
): AttemptEntry {
  const at = NOW - (opts.ago ?? 0);
  return {
    attempt: {
      schemaVersion: 1,
      n,
      provider,
      kind: opts.kind ?? (n === 1 ? "fresh" : "switch"),
      createdAt: iso(at - 60),
    },
    session: { schemaVersion: 1, sessionId: `sess-${n}` },
    pause: {
      schemaVersion: 1,
      provider,
      resetsAt,
      source: "test",
      createdAt: iso(at),
    },
  };
}

const decide = (attempts: AttemptEntry[], p = policy()) =>
  decideNext({ policy: p, attempts, now: NOW, eligible: ["claude", "codex"] });

describe("decideNext", () => {
  it("reset inside the wait window → resume the session at reset + 60s", () => {
    expect(decide([paused(1, "claude", NOW + 600)])).toEqual({
      kind: "resume",
      provider: "claude",
      at: NOW + 660,
      sessionId: "sess-1",
    });
  });

  it("reset beyond the wait window → switch to the next eligible provider now", () => {
    expect(decide([paused(1, "claude", NOW + 7200)])).toEqual({
      kind: "switch",
      provider: "codex",
      at: NOW,
    });
  });

  it("noFallback waits for the reset even beyond the window", () => {
    expect(
      decide([paused(1, "claude", NOW + 7200)], policy({ noFallback: true })),
    ).toMatchObject({ kind: "resume", provider: "claude", at: NOW + 7260 });
  });

  it(`fails after ${MAX_PAUSES} pauses`, () => {
    const attempts = Array.from({ length: MAX_PAUSES }, (_, i) =>
      paused(i + 1, "claude", NOW + 60),
    );
    expect(decide(attempts, policy({ onQuota: "wait" }))).toMatchObject({
      kind: "fail",
    });
  });

  it("switch with both resets unknown does not bounce back before waitMinutes", () => {
    const claudePause = paused(1, "claude", null, { ago: 300 });
    const d = decide(
      [claudePause, paused(2, "codex", null)],
      policy({ onQuota: "switch" }),
    );
    expect(d).toMatchObject({ kind: "switch", provider: "claude" });
    const at = (d as { at: number }).at;
    expect(at).toBeGreaterThan(NOW);
    expect(at).toBeGreaterThanOrEqual(
      Date.parse(claudePause.pause!.createdAt) / 1000 + WAIT_MIN * 60,
    );
  });
});
