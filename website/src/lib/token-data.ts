import { readFileSync } from "fs";
import { join } from "path";

const tokenCounts = JSON.parse(
  readFileSync(
    join(process.cwd(), "../plugin/generated/token-counts.json"),
    "utf-8",
  ),
);

export type Tier = "low" | "medium" | "high";

export interface TokenEntry {
  tokens: number;
  tier: Tier;
}

export interface SkillTokenEntry extends TokenEntry {
  type: "slash" | "auto";
}

export interface AgentTokenEntry extends TokenEntry {
  model: string;
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

export function getTierIcon(tier: Tier): string {
  return (tokenCounts.tiers as Record<Tier, TierDef>)[tier].icon;
}

export function getTierDef(tier: Tier): TierDef {
  return (tokenCounts.tiers as Record<Tier, TierDef>)[tier];
}

export function getAllTokenData() {
  return tokenCounts;
}
