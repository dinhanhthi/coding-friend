"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Agent = "claude" | "codex";

const STORAGE_KEY = "cf-docs-agent";

interface AgentContextValue {
  agent: Agent;
  setAgent: (agent: Agent) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent>("claude");

  // Restore on hard reload / new tab. Read in an effect so the first render
  // matches the server ("claude") and avoids a hydration mismatch.
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "codex" || saved === "claude") setAgent(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, agent);
  }, [agent]);

  return (
    <AgentContext.Provider value={{ agent, setAgent }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used within an AgentProvider");
  return ctx;
}

/** Swap displayed slash-skills labels to Codex's `$` style. */
export function withAgentPrefix(label: string, agent: Agent): string {
  if (agent !== "codex") return label;
  if (label.startsWith("/Slash")) return label.replace("/Slash", "$Dollar");
  if (label.startsWith("/")) return `$${label.slice(1)}`;
  return label;
}

/** Render a label with the active agent's prefix applied. */
export function AgentLabel({ children }: { children: string }) {
  const { agent } = useAgent();
  return <>{withAgentPrefix(children, agent)}</>;
}

export function AgentToggle() {
  const { agent, setAgent } = useAgent();
  return (
    <div className="inline-flex rounded-full border border-[#a0a0a05d] p-0.5">
      {(["claude", "codex"] as Agent[]).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setAgent(value)}
          className={`cursor-pointer rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
            agent === value
              ? "bg-violet-500/20 text-violet-300"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {value}
        </button>
      ))}
    </div>
  );
}
