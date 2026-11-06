import type { EngineInterface, On } from "claude-code";

import { isInteractive } from "./register";
import type { ModsContext } from "./register";
import {
  isMainReviewer,
  parsePhaseCommit,
  parseReviewStatus,
} from "./lib/signals.mjs";

// Toasts when the main cf-reviewer finishes (its "Review status:" line) and
// when /cf-plan autopilot commits a phase ("phase N/M <name>"). Reviewer
// messages and tool output are untrusted: only the signals.mjs regexes read
// them, and what is shown comes out cleaned and truncated. Every hook parses
// after next(e) has answered and never changes or blocks the call.

/** Precheck on a Bash command before reading its output. */
const GIT_COMMIT_RE = /\bgit\b[\s\S]*\bcommit\b/;

const MAX_SEEN = 50;

// Reviews already toasted ("agent:<id>", "call:<tool_use_id>"), so a review
// toasts once, whichever of SubagentStop and the Agent tool.call fallback
// reads it first.
const seen = new Set<string>();

function remember(key: string): void {
  if (seen.has(key)) return;
  if (seen.size >= MAX_SEEN) {
    const oldest = seen.values().next().value;
    if (oldest !== undefined) seen.delete(oldest);
  }
  seen.add(key);
}

/** The agent id of a completed Agent tool record, or null. */
function agentIdOf(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null;
  const id = (result as { agentId?: unknown }).agentId;
  return typeof id === "string" ? id : null;
}

async function toastReview(
  $: EngineInterface,
  status: { status: string; detail?: string },
): Promise<void> {
  if (!(await isInteractive($))) return;
  $.ui.toast(
    "cf-review: " +
      status.status +
      (status.detail ? " — " + status.detail : ""),
  );
}

export function registerToasts(on: On, _ctx: ModsContext): void {
  // Main signal: the reviewer's own last message.
  on("classic.SubagentStop", async ($, e, next) => {
    try {
      // Skipped when the Agent fallback has toasted this review already.
      if (!seen.has(`agent:${e.agent_id}`) && isMainReviewer(e.agent_type)) {
        const status = parseReviewStatus(e.last_assistant_message);
        if (status !== null) {
          // Marked before any await: the parent's Agent call resolves after
          // this and must not toast the same review again. Unmatched (no
          // message, or a hand-back whose last text has no status line): the
          // fallback reads the Agent result instead.
          remember(`agent:${e.agent_id}`);
          await toastReview($, status);
        }
      }
    } catch {
      // Fail-soft: a broken toast never breaks the session.
    }
    return next(e);
  }).catch(($, e, next) => next(e));

  // Fallback when SubagentStop found no status line (last_assistant_message
  // is optional): the Agent call's result text, once per agent id and per
  // tool_use_id.
  on("tool.call", { tool: "Agent" }, async ($, e, next) => {
    const ran = await next(e);
    try {
      if (ran.deny !== undefined || ran.isError === true) return ran;
      if (!isMainReviewer(e.subagent_type)) return ran;
      const agentId = agentIdOf(ran.result);
      if (agentId !== null && seen.has(`agent:${agentId}`)) return ran;
      if (seen.has(`call:${e.tool_use_id}`)) return ran;
      const status = parseReviewStatus(ran.text);
      if (status === null) return ran;
      if (agentId !== null) remember(`agent:${agentId}`);
      remember(`call:${e.tool_use_id}`);
      await toastReview($, status);
    } catch {
      // Fail-soft.
    }
    return ran;
  }).catch(($, e, next) => next(e));

  // Phase commit: git's own `[branch sha] subject` line of `git commit` output.
  on("tool.call", { tool: "Bash" }, async ($, e, next) => {
    let isCommit = false;
    try {
      isCommit = typeof e.command === "string" && GIT_COMMIT_RE.test(e.command);
    } catch {
      isCommit = false;
    }
    const ran = await next(e);
    try {
      if (!isCommit || ran.deny !== undefined || ran.isError === true) {
        return ran;
      }
      const phase = parsePhaseCommit(ran.text);
      if (phase === null) return ran;
      if (!(await isInteractive($))) return ran;
      $.ui.toast(`phase ${phase.n}/${phase.m} committed: ${phase.name}`);
    } catch {
      // Fail-soft.
    }
    return ran;
  }).catch(($, e, next) => next(e));
}
