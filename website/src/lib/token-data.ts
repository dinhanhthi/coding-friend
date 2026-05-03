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
}

export interface AgentTokenEntry extends TokenEntry {
  model: string;
  created?: string;
  updated?: string;
  state?: "beta";
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

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

export function getItemStatus(
  created?: string,
  updated?: string,
  state?: "beta",
): ItemStatuses {
  const now = Date.now();
  let temporal: "new" | "updated" | null = null;
  if (created && now - new Date(created).getTime() <= TWO_WEEKS_MS)
    temporal = "new";
  else if (updated && now - new Date(updated).getTime() <= TWO_WEEKS_MS)
    temporal = "updated";
  return { beta: state === "beta", temporal };
}
