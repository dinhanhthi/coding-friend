import type { CommanderError } from "commander";
import { errorEnvelope, type Envelope } from "./output.js";

// Commander codes for help/version output: not usage errors, no envelope.
const DISPLAY_CODES = new Set([
  "commander.helpDisplayed",
  "commander.version",
  "commander.help",
]);

// Stdio MCP servers: stdout is the JSON-RPC stream, so nothing may follow.
const MCP_SERVE_COMMANDS = new Set(["mcp-serve", "mcp-serve-learn"]);

/** postAction hook: JSON runs and stdio MCP servers skip the update check and auto-update. */
export function shouldSkipPostAction(actionCommand: {
  name(): string;
  opts(): Record<string, unknown>;
}): boolean {
  return (
    MCP_SERVE_COMMANDS.has(actionCommand.name()) ||
    Boolean(actionCommand.opts().json)
  );
}

/** USAGE envelope for a commander error, or null for help/version display. */
export function toUsageEnvelope(err: CommanderError): Envelope<never> | null {
  if (DISPLAY_CODES.has(err.code)) return null;
  return errorEnvelope("USAGE", err.message);
}
