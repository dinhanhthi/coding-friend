import { atom, read, update } from "claude-code";
import type { EngineInterface, PluginOptions, Register } from "claude-code";

import { registerBand } from "./band";
import { registerMcp } from "./mcp";
import { registerPlanCommand, registerPlanPane } from "./plan-pane";
import { registerQuota } from "./quota";
import { registerToasts } from "./toasts";

// Every hook here is fail-soft: it catches its own errors and always returns
// next(e), so a broken mod never breaks the session.

const interactive = atom(
  { plugin: "coding-friend-mods", key: "isInteractive" } as const,
  false,
);

export type ModsContext = {
  options: PluginOptions;
};

// True only when a person is at the prompt. Toasts, bands, panes and timers
// run only then; headless runs (-p, SDK) only write the quota snapshot.
// Imported by name: validate refuses $ passed to a function held in an object.
export async function isInteractive($: EngineInterface): Promise<boolean> {
  try {
    return await read($, interactive);
  } catch {
    return false;
  }
}

export const register: Register = (on, options) => {
  on("session.start", async ($, e, next) => {
    try {
      await update($, interactive, () => e.isInteractive);
    } catch {
      // Unknown stays false: no UI.
    }
    try {
      // This file owns the plain session.start, so plan-pane's command is
      // registered here.
      await registerPlanCommand($);
    } catch {
      // No /cf-plan-status this session.
    }
    return next(e);
  });

  // The engine reads the module statically: each registrar is a top-level
  // function imported from the plugin's own files and called by name.
  const ctx: ModsContext = { options };
  // Each in its own try: one broken feature must not stop the others.
  try {
    registerQuota(on, ctx);
  } catch {}
  try {
    registerBand(on, ctx);
  } catch {}
  try {
    registerToasts(on, ctx);
  } catch {}
  try {
    registerMcp(on, ctx);
  } catch {}
  try {
    registerPlanPane(on, ctx);
  } catch {}
};
