import type { CommanderError } from "commander";
import { errorEnvelope, type Envelope } from "./output.js";

// Commander codes for help/version output: not usage errors, no envelope.
const DISPLAY_CODES = new Set([
  "commander.helpDisplayed",
  "commander.version",
  "commander.help",
]);

/** postAction hook: JSON runs skip the update check and auto-update. */
export function shouldSkipPostAction(actionCommand: {
  opts(): Record<string, unknown>;
}): boolean {
  return Boolean(actionCommand.opts().json);
}

/** USAGE envelope for a commander error, or null for help/version display. */
export function toUsageEnvelope(err: CommanderError): Envelope<never> | null {
  if (DISPLAY_CODES.has(err.code)) return null;
  return errorEnvelope("USAGE", err.message);
}
