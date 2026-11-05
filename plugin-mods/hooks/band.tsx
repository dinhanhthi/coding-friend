import { atom, read } from "claude-code";
import type { On } from "claude-code";

import type { ModsQuotaWindow } from "../types";
import { isInteractive } from "./register";
import type { ModsContext } from "./register";

// The one-line band above the prompt. It shows only what needs attention and
// passes otherwise. Phase 4 adds an MCP segment beside the quota one.

const BAND_MIN_PERCENT = 80;

// Written by quota.ts; validate wants each atom declared in the file that
// reads it, so the same literal ref is repeated here.
const quotaState = atom(
  { plugin: "coding-friend-mods", key: "quota" } as const,
  null,
);

export function registerBand(on: On, _ctx: ModsContext): void {
  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    try {
      if (!e.props.hasSurvey && (await isInteractive($))) {
        const segments: string[] = [];
        // A window past its reset no longer holds that percent: skip it.
        const nowMs = await $.clock.now();
        const live = (await read($, quotaState))?.filter(
          (w) => w.resetsAt * 1000 > nowMs,
        );
        const quota = quotaSegment(live ?? null);
        if (quota !== null) segments.push(quota);
        if (segments.length > 0) {
          const { Box, Text } = $.ui.resolve(e);
          return (
            <Box>
              <Text color="warning">{segments.join(" · ")}</Text>
            </Box>
          );
        }
      }
    } catch {
      // Fail-soft: the engine draws its own band.
    }
    return next(e);
  });
}

/** "Claude quota: 5h 91% · 7d 40%" when a window is at 80% or more, else null. */
function quotaSegment(windows: ModsQuotaWindow[] | null): string | null {
  if (!windows || !windows.some((w) => w.percentUsed >= BAND_MIN_PERCENT)) {
    return null;
  }
  const parts = windows.map(
    (w) => `${w.kind === "five_hour" ? "5h" : "7d"} ${w.percentUsed}%`,
  );
  return `Claude quota: ${parts.join(" · ")}`;
}
