import { expect, mock, test } from "claude-code/testing";

const NOW_MS = Date.parse("2026-11-05T10:00:00Z");
const RESETS_AT = "2026-11-05T14:30:00Z";
const LEVEL_KEY = `level:five_hour@${Math.floor(Date.parse(RESETS_AT) / 1000)}`;
const FRESH_RESETS_AT = "2026-11-05T19:30:00Z";
const FRESH_KEY = `level:five_hour@${Math.floor(Date.parse(FRESH_RESETS_AT) / 1000)}`;

test("each window toasts a level once", async ($, on) => {
  // The engine beneath the mod: an in-memory store the test can read (the
  // test's $ has no store noun), a clock and environment, no snapshot file
  // yet, and a write that succeeds.
  const store = new Map<string, unknown>();
  on("store.get", (_, e) => ({ value: store.get(e.key) }));
  on("store.set", (_, e) => {
    store.set(e.key, e.value);
    return { value: undefined };
  });
  mock.clock(on, { now: NOW_MS });
  mock.env(on, { HOME: "/home/test" });
  on("fs.stat", () => ({ deny: "no such file" }));
  on("fs.read", () => ({ deny: "no such file" }));
  on("process.run", () => ({
    value: {
      exitCode: 0,
      stdout: "",
      stderr: "",
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }));
  on("ui.toast", () => ({ value: undefined }));
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  on("session.measure", (_, e) => ({ changed: e.changed }));

  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });

  const measure = (percentUsed: number, resetsAt: string) =>
    $.session.measure({
      context: { window: 200000 },
      rateLimits: [{ kind: "five_hour", percentUsed, resetsAt }],
      changed: ["rateLimits"],
    });

  // This window already toasted 95: 91 must not lower or re-toast it.
  store.set(LEVEL_KEY, 95);
  await measure(91, RESETS_AT);
  expect(store.get(LEVEL_KEY)).toBe(95);

  // A fresh window: 91 crossed 90; 91.5 in the same window crossed nothing new.
  await measure(91, FRESH_RESETS_AT);
  await measure(91.5, FRESH_RESETS_AT);
  expect(store.get(FRESH_KEY)).toBe(90);
});
