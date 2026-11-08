import { describe, expect, it } from "vitest";

import type { CfError, SessionTurn, TaskFollow, TaskView } from "./cf";
import {
  applyFollow,
  emptySnapshot,
  errorDelay,
  type Snapshot,
} from "./task-follow";

const ID = "abcd1234";
/** task-follow.ts: retry delay, item cap, items kept after a trim. */
const ERROR_RETRY_MS = 10_000;
const MAX_ITEMS = 2000;
const KEEP_ITEMS = 1500;

const task: TaskView = {
  schemaVersion: 1,
  id: ID,
  provider: "claude",
  prompt: "p",
  readOnly: false,
  checkout: "/repo",
  createdAt: "2026-11-07T00:00:00Z",
  state: "running",
  pendingAsks: [],
};

const turns = (n: number, from = 0): SessionTurn[] =>
  Array.from({ length: n }, (_, i) => ({
    kind: "user" as const,
    text: `t${from + i}`,
  }));

const res = (over: Partial<TaskFollow>): TaskFollow => ({
  task,
  terminal: false,
  attempt: { n: 1, provider: "claude", kind: "fresh" },
  live: { supported: true, status: "ok" },
  turns: [],
  cursor: "v1",
  more: false,
  reset: false,
  truncated: false,
  skipped: 0,
  redactions: { total: 0, byKind: {} },
  ...over,
});

/** What the list shows: markers as `#n`, turns as their text. */
const shown = (s: Snapshot) =>
  s.items.map((i) =>
    i.kind === "attempt" ? `#${i.n}` : (i as { text: string }).text,
  );

describe("applyFollow", () => {
  it.each([
    {
      name: "a marker before the first attempt's turns, none again for the same attempt",
      polls: [res({ turns: turns(2) }), res({ turns: turns(1, 2) })],
      want: ["#1", "t0", "t1", "t2"],
    },
    {
      name: "a new attempt adds its marker",
      polls: [
        res({ turns: turns(1) }),
        res({
          attempt: { n: 2, provider: "codex", kind: "switch" },
          turns: turns(1, 1),
        }),
      ],
      want: ["#1", "t0", "#2", "t1"],
    },
    {
      name: "a reset drops the attempt's turns from its marker on",
      polls: [
        res({ turns: turns(1) }),
        res({
          attempt: { n: 2, provider: "claude", kind: "resume" },
          turns: turns(2, 1),
        }),
        res({
          attempt: { n: 2, provider: "claude", kind: "resume" },
          reset: true,
          turns: turns(1, 9),
        }),
      ],
      want: ["#1", "t0", "#2", "t9"],
    },
  ])("$name", ({ polls, want }) => {
    const s = polls.reduce(applyFollow, emptySnapshot(ID));
    expect(shown(s)).toEqual(want);
    expect(s.loaded).toBe(true);
  });

  it(`trims past ${MAX_ITEMS} items down to ${KEEP_ITEMS}`, () => {
    // The marker plus MAX_ITEMS - 1 turns fill the list exactly.
    const s = applyFollow(
      emptySnapshot(ID),
      res({ turns: turns(MAX_ITEMS - 1) }),
    );
    expect(s.items).toHaveLength(MAX_ITEMS);
    expect(s.trimmed).toBe(false);
    const t = applyFollow(s, res({ turns: turns(1, MAX_ITEMS - 1) }));
    expect(t.trimmed).toBe(true);
    expect(t.items).toHaveLength(KEEP_ITEMS);
    expect(shown(t).at(-1)).toBe(`t${MAX_ITEMS - 1}`);
  });

  it("keys every item with a sequence number never reused across a reset or a trim", () => {
    let s = applyFollow(emptySnapshot(ID), res({ turns: turns(3) }));
    const before = s.items.map((i) => i.seq);
    s = applyFollow(s, res({ reset: true, turns: turns(2, 3) }));
    s = applyFollow(s, res({ turns: turns(MAX_ITEMS, 5) }));
    const keys = s.items.map((i) => i.seq);
    expect(new Set([...before, ...keys]).size).toBe(
      before.length + keys.length,
    );
    // Items that stay keep their key.
    const next = applyFollow(s, res({ turns: turns(1, 9999) }));
    expect(next.items.slice(0, keys.length).map((i) => i.seq)).toEqual(keys);
  });

  it("ignores an answer for another task", () => {
    const prev = applyFollow(emptySnapshot(ID), res({ turns: turns(1) }));
    const other = res({ task: { ...task, id: "zzzz9999" }, turns: turns(5) });
    expect(applyFollow(prev, other)).toBe(prev);
  });
});

describe("errorDelay", () => {
  it.each<[string, CfError, number | null]>([
    [
      "NOT_FOUND stops",
      { kind: "cliError", code: "NOT_FOUND", message: "", stderrTail: null },
      null,
    ],
    [
      "INVALID_ARGS stops",
      { kind: "cliError", code: "INVALID_ARGS", message: "", stderrTail: null },
      null,
    ],
    [
      "another cliError retries",
      { kind: "cliError", code: "IO_ERROR", message: "", stderrTail: null },
      ERROR_RETRY_MS,
    ],
  ])("%s", (_name, error, want) => {
    expect(errorDelay(error)).toBe(want);
  });
});
