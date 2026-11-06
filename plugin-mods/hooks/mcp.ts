import { atom, update } from "claude-code";
import type { EngineInterface, On, Timer } from "claude-code";

import type { ModsMcpState } from "../types";
import type { ModsContext } from "./register";

// MCP health: when a person is at the prompt, ping the two Coding Friend MCP
// servers through the engine's own connections and keep the result in
// $.state for the band. Never toasts.

const mcpState = atom(
  { plugin: "coding-friend-mods", key: "mcp" } as const,
  null,
);

// The engine connects MCP servers after session.start: a call made then
// rejects as if the server were absent (smoke on 2.1.318: absent at start,
// connected 4 s later). So the first ping waits, then one every 10 minutes.
const FIRST_PING_MS = 15_000;
const PING_EVERY_MS = 10 * 60_000;
const CALL_TIMEOUT_MS = 10_000;

// What $.mcp.call rejects with (a HooksError) when no connected server of that
// name has that tool, seen on 2.1.318:
//   <plugin>: $.mcp.call: no connected MCP tool "<tool>" on a server named "<server>"
// The engine says the same for an unknown server, a server not (yet)
// connected and a missing tool, so all three count as "absent".
const ABSENT_RE = /no connected MCP tool/;

let firstPing: Timer | null = null;
let everyPing: Timer | null = null;

export function registerMcp(on: On, _ctx: ModsContext): void {
  // The matcher keeps this apart from register.tsx's session.start (validate
  // refuses the same event twice without one) and limits it to a person at
  // the prompt: headless runs never ping.
  on("session.start", { isInteractive: true }, async ($, e, next) => {
    const started = await next(e);
    try {
      // A reload or re-enable fires session.start again: one schedule only.
      stopPings();
      firstPing = $.clock.after(FIRST_PING_MS, () => {
        void ping($);
      });
      everyPing = $.clock.every(PING_EVERY_MS, () => {
        void ping($);
      });
    } catch {
      // Fail-soft: no ping, no band entry.
    }
    return started;
  });

  on("session.end", async (_$, e, next) => {
    try {
      // A /clear or an in-session /resume goes on in the same process and no
      // session.start follows: keep pinging.
      if (e.reason !== "clear" && e.reason !== "resume") stopPings();
    } catch {}
    return next(e);
  });
}

function stopPings(): void {
  if (firstPing) firstPing.cancel();
  if (everyPing) everyPing.cancel();
  firstPing = null;
  everyPing = null;
}

async function ping($: EngineInterface): Promise<void> {
  try {
    const [memory, learn] = await Promise.all([
      pingServer($, "coding-friend-memory", "memory_list", { limit: 1 }),
      pingServer($, "coding-friend-learn", "list-categories", {}),
    ]);
    const checkedAt = await $.clock.now();
    await update($, mcpState, () => ({ memory, learn, checkedAt }));
  } catch {
    // Fail-soft: the last state stays.
  }
}

/** One tool call raced against CALL_TIMEOUT_MS. */
async function pingServer(
  $: EngineInterface,
  server: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<ModsMcpState> {
  let timedOut: (v: "timeout") => void = () => {};
  const timeout = new Promise<"timeout">((resolve) => {
    timedOut = resolve;
  });
  const timer = $.clock.after(CALL_TIMEOUT_MS, () => timedOut("timeout"));
  try {
    const result = await Promise.race([
      $.mcp.call(server, tool, args),
      timeout,
    ]);
    if (result === "timeout") return "error";
    return result.isError ? "error" : "ok";
  } catch (err) {
    return ABSENT_RE.test(errorMessage(err)) ? "absent" : "error";
  } finally {
    timer.cancel();
  }
}

function errorMessage(err: unknown): string {
  const message =
    typeof err === "object" && err !== null
      ? (err as { message?: unknown }).message
      : undefined;
  return typeof message === "string" ? message : String(err);
}
