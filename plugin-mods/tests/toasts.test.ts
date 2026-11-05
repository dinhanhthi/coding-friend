import { expect, test } from "claude-code/testing";

const REPORT = "## Summary\nAll good.\nReview status: COMPLETE";

test("a finished review toasts once, by SubagentStop or by the Agent result", async ($, on) => {
  // The engine beneath the mod: an interactive session, a toast that shows,
  // and an Agent call whose result names the subagent that ran.
  const toasts: string[] = [];
  on("ui.toast", (_, e) => {
    toasts.push(String((e as { text?: unknown }).text));
    return { value: undefined };
  });
  on("session.start", (_, e) => ({ cwd: e.cwd }));
  on("classic.SubagentStop", () => ({}));
  let agentId = "";
  on("tool.call", () => ({
    result: { agentId },
    text: `Done.\n${REPORT}`,
  }));

  await $.session.start({ cwd: "/", surface: "terminal", isInteractive: true });

  const review = (id: string, message?: string) =>
    $.classic.SubagentStop({
      stop_hook_active: false,
      agent_id: id,
      agent_transcript_path: `/t/${id}.jsonl`,
      agent_type: "coding-friend:cf-reviewer",
      ...(message === undefined ? {} : { last_assistant_message: message }),
    });
  const agentCall = (id: string, toolUseId: string) => {
    agentId = id;
    return $.tool.call({
      tool: "Agent",
      description: "review",
      prompt: "review the diff",
      subagent_type: "cf-reviewer",
      tool_use_id: toolUseId,
    });
  };

  // (a) SubagentStop read the status line: the Agent result must not toast again.
  await review("a1", REPORT);
  await agentCall("a1", "t1");
  expect(toasts).toEqual(["cf-review: COMPLETE"]);

  // (b) No last message: the Agent result is the fallback, once.
  toasts.length = 0;
  await review("a2");
  await agentCall("a2", "t2");
  expect(toasts).toEqual(["cf-review: COMPLETE"]);

  // (c) The Agent result toasted first: a later SubagentStop must not toast again.
  toasts.length = 0;
  await agentCall("a3", "t3");
  await review("a3", REPORT);
  expect(toasts).toEqual(["cf-review: COMPLETE"]);
});
