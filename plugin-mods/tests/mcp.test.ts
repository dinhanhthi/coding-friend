import { expect, mock, test } from "claude-code/testing";

test("interactive: first ping at 15 s, then every 10 min", async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 });
  const calls: string[] = [];
  let learnMode: "absent" | "hang" = "absent";
  on("mcp.call", (_, e) => {
    calls.push(e.server);
    if (e.server === "coding-friend-memory") {
      return {
        value: { content: [{ type: "text", text: "[]" }], isError: false },
      };
    }
    if (learnMode === "hang") return new Promise(() => {});
    return {
      deny: `no connected MCP tool "${e.tool}" on a server named "${e.server}"`,
    };
  });
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  on("session.end", (_, e) => ({ sessionId: "s" }));
  let last: unknown = null;
  let version = 0;
  on("state.set", (_, e) => {
    const w = e as { key?: string; value?: unknown };
    if (w.key === "mcp") last = w.value;
    version += 1;
    return { value: { isSet: true, version } };
  });
  on("state.get", (_, e) => {
    const w = e as { key?: string };
    return { value: { value: w.key === "mcp" ? last : undefined, version } };
  });

  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  await clock.settle();
  expect(calls.length).toBe(0);
  expect(last).toBe(null);

  await clock.advance(15_000);
  expect(calls.length).toBe(2);
  expect(last).toEqual({
    memory: "ok",
    learn: "absent",
    checkedAt: 1_015_000,
  });

  learnMode = "hang";
  await clock.advance(10 * 60_000 - 15_000);
  expect(calls.length).toBe(4);
  await clock.advance(10_000);
  const s = last as { memory: string; learn: string } | null;
  expect(s && s.memory).toBe("ok");
  expect(s && s.learn).toBe("error");
});

test("headless: never pings", async ($, on) => {
  const clock = mock.clock(on, { now: 0 });
  const calls: string[] = [];
  on("mcp.call", (_, e) => {
    calls.push(e.server);
    return { value: { content: [], isError: false } };
  });
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  await $.session.start({ cwd: "/", surface: null, isInteractive: false });
  await clock.advance(30 * 60_000);
  expect(calls.length).toBe(0);
});

test("/clear and /resume keep the pings; another session.end stops them", async ($, on) => {
  const clock = mock.clock(on, { now: 0 });
  const calls: string[] = [];
  on("mcp.call", (_, e) => {
    calls.push(e.server);
    return { value: { content: [], isError: false } };
  });
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  on("session.end", () => ({ sessionId: "s" }));
  on("state.set", () => ({ value: { isSet: true, version: 1 } }));
  on("state.get", () => ({ value: { value: undefined, version: 0 } }));
  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });
  const end = (
    $.session as unknown as { end: (e: unknown) => Promise<unknown> }
  ).end;
  // A /clear ends the conversation, not the process: no session.start follows.
  await end({ reason: "clear" });
  await clock.advance(15_000);
  expect(calls.length).toBe(2);
  // An in-session /resume goes on in the same process too.
  await end({ reason: "resume" });
  await clock.advance(10 * 60_000 - 15_000);
  expect(calls.length).toBe(4);
  await end({ reason: "prompt_input_exit" });
  await clock.advance(30 * 60_000);
  expect(calls.length).toBe(4);
});
