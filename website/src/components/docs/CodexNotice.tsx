"use client";

import Callout from "@/components/docs/Callout";
import { useAgent } from "@/components/docs/AgentContext";

/**
 * Warning shown at the top of slash-skill docs when the Codex agent is
 * selected. Codex invokes skills with a `$` prefix instead of `/`.
 * Renders nothing for the Claude agent.
 */
export default function CodexNotice({ command }: { command: string }) {
  const { agent } = useAgent();
  if (agent !== "codex") return null;

  const dollar = command.startsWith("/") ? `$${command.slice(1)}` : command;

  return (
    <Callout type="warning" title="Using Codex CLI?">
      Codex uses <code>$</code> instead of <code>/</code> to invoke skills.
      Replace the <code>/</code> prefix with <code>$</code> — invoke this skill
      as <code>{dollar}</code> instead of <code>{command}</code>.
    </Callout>
  );
}
