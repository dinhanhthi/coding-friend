import tokenCounts from "@/generated/token-counts.json";

export type Tier = "low" | "medium" | "high";

export interface ItemStatuses {
  beta: boolean;
  temporal: "new" | "updated" | null;
}

export interface TokenEntry {
  tokens: number;
  tier: Tier;
}

export interface SkillTokenEntry extends TokenEntry {
  type: "slash" | "auto";
  created?: string;
  updated?: string;
  state?: "beta";
  temporal?: "new" | "updated";
}

export interface AgentTokenEntry extends TokenEntry {
  model: string;
  created?: string;
  updated?: string;
  state?: "beta";
  temporal?: "new" | "updated";
}

export interface TierDef {
  label: string;
  icon: string;
  maxTokens?: number;
}

export function getSkillTier(name: string): SkillTokenEntry | null {
  const skill = (tokenCounts.skills as Record<string, SkillTokenEntry>)[name];
  return skill ?? null;
}

export function getAgentTier(name: string): AgentTokenEntry | null {
  const agent = (tokenCounts.agents as Record<string, AgentTokenEntry>)[name];
  return agent ?? null;
}

export function getBootstrapTokens(): TokenEntry {
  return tokenCounts.bootstrap as TokenEntry;
}

export function getTierDef(tier: Tier): TierDef {
  return (tokenCounts.tiers as Record<Tier, TierDef>)[tier];
}

export function getAllTokenData() {
  return tokenCounts;
}

export function getItemStatus(
  state?: "beta",
  temporal?: "new" | "updated",
): ItemStatuses {
  return { beta: state === "beta", temporal: temporal ?? null };
}
