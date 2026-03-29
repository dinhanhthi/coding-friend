/**
 * Generate token counts for all plugin skills, agents, and bootstrap context.
 *
 * What it does:
 *   1. Reads every SKILL.md in plugin/skills/<name>/
 *   2. Reads every agent .md in plugin/agents/
 *   3. Reads the bootstrap context (plugin/context/bootstrap.md)
 *   4. Counts tokens for each using @lenml/tokenizer-claude
 *   5. Assigns a context tier: ⚡ low (<1,000), ⚡⚡ medium (1,000–2,500), ⚡⚡⚡ high (>2,500)
 *   6. Writes the result to website/src/generated/token-counts.json
 *
 * Output JSON structure:
 *   - generatedAt: ISO timestamp
 *   - tokenizer: tokenizer package used
 *   - tiers: tier definitions with thresholds
 *   - bootstrap: { tokens, tier }
 *   - skills: { [name]: { tokens, tier, type: "slash" | "auto" } }
 *   - agents: { [name]: { tokens, tier, model } }
 *
 * When to run:
 *   - After any SKILL.md or agent .md file is added, removed, or modified
 *   - Before release, to keep website token data in sync
 *
 * Usage:
 *   npm run generate:tokens
 *
 * The website imports the generated JSON (via website/src/lib/token-data.ts)
 * to display context footprint info on skill and agent doc pages.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { join, basename, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = join(__dirname, "..", "plugin");
const OUTPUT_PATH = join(
  __dirname,
  "..",
  "website",
  "src",
  "generated",
  "token-counts.json",
);

const AUTO_SKILLS = new Set(["cf-tdd", "cf-sys-debug", "cf-verification"]);

const TIERS = {
  low: { label: "Low", maxTokens: 1000, icon: "⚡" },
  medium: { label: "Medium", maxTokens: 2500, icon: "⚡⚡" },
  high: { label: "High", icon: "⚡⚡⚡" },
} as const;

type Tier = keyof typeof TIERS;

function getTier(tokens: number): Tier {
  if (tokens < TIERS.low.maxTokens) return "low";
  if (tokens < TIERS.medium.maxTokens) return "medium";
  return "high";
}

let tokenizer: { encode: (text: string) => number[] } | null = null;

async function getTokenizer() {
  if (!tokenizer) {
    const { fromPreTrained } = await import("@lenml/tokenizer-claude");
    tokenizer = fromPreTrained();
  }
  return tokenizer;
}

async function countTokens(text: string): Promise<number> {
  const t = await getTokenizer();
  return t.encode(text).length;
}

function readFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) {
      result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return result;
}

function loadPreviousCounts(): {
  bootstrap?: number;
  skills: Record<string, number>;
  agents: Record<string, number>;
} {
  const result = { skills: {} as Record<string, number>, agents: {} as Record<string, number> };
  if (!existsSync(OUTPUT_PATH)) return result;
  try {
    const data = JSON.parse(readFileSync(OUTPUT_PATH, "utf-8"));
    if (data.bootstrap?.tokens) result.bootstrap = data.bootstrap.tokens;
    for (const [name, info] of Object.entries(data.skills ?? {})) {
      result.skills[name] = (info as { tokens: number }).tokens;
    }
    for (const [name, info] of Object.entries(data.agents ?? {})) {
      result.agents[name] = (info as { tokens: number }).tokens;
    }
  } catch {
    // ignore corrupt file
  }
  return result;
}

function formatDelta(prev: number | undefined, curr: number): string {
  if (prev === undefined) return `${String(curr).padStart(5)} tokens (new)`;
  if (prev === curr) return `${String(curr).padStart(5)} tokens`;
  const sign = curr > prev ? "+" : "";
  return `${String(prev).padStart(5)} → ${String(curr).padStart(5)} tokens (${sign}${curr - prev})`;
}

async function main() {
  const previous = loadPreviousCounts();

  const skills: Record<
    string,
    { tokens: number; tier: Tier; type: "slash" | "auto" }
  > = {};
  const agents: Record<string, { tokens: number; tier: Tier; model: string }> =
    {};

  // Process skills
  const skillsDir = join(PLUGIN_DIR, "skills");
  for (const dir of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const skillFile = join(skillsDir, dir.name, "SKILL.md");
    if (!existsSync(skillFile)) continue;

    const content = readFileSync(skillFile, "utf-8");
    const tokens = await countTokens(content);
    const type = AUTO_SKILLS.has(dir.name) ? "auto" : "slash";

    skills[dir.name] = { tokens, tier: getTier(tokens), type };
  }

  // Process agents
  const agentsDir = join(PLUGIN_DIR, "agents");
  for (const file of readdirSync(agentsDir)) {
    if (!file.endsWith(".md")) continue;
    const name = basename(file, ".md");
    const content = readFileSync(join(agentsDir, file), "utf-8");
    const tokens = await countTokens(content);
    const frontmatter = readFrontmatter(content);
    const model = frontmatter["model"] || "unknown";

    agents[name] = { tokens, tier: getTier(tokens), model };
  }

  // Process bootstrap
  const bootstrapPath = join(PLUGIN_DIR, "context", "bootstrap.md");
  const bootstrapContent = readFileSync(bootstrapPath, "utf-8");
  const bootstrapTokens = await countTokens(bootstrapContent);

  const output = {
    generatedAt: new Date().toISOString(),
    tokenizer: "@lenml/tokenizer-claude",
    tiers: TIERS,
    bootstrap: { tokens: bootstrapTokens, tier: getTier(bootstrapTokens) },
    skills,
    agents,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");

  // Print summary
  console.log("\n📊 Token counts generated!\n");
  console.log(
    `Bootstrap: ${formatDelta(previous.bootstrap, bootstrapTokens)} (${getTier(bootstrapTokens)})\n`,
  );

  console.log("Skills:");
  const sortedSkills = Object.entries(skills).sort(
    ([, a], [, b]) => b.tokens - a.tokens,
  );
  for (const [name, data] of sortedSkills) {
    const icon = TIERS[data.tier].icon;
    const delta = formatDelta(previous.skills[name], data.tokens);
    console.log(
      `  ${icon.padEnd(4)} ${name.padEnd(20)} ${delta}  (${data.type})`,
    );
  }

  // Report removed skills
  for (const name of Object.keys(previous.skills)) {
    if (!skills[name]) {
      console.log(
        `        ${name.padEnd(20)} removed (was ${previous.skills[name]} tokens)`,
      );
    }
  }

  console.log("\nAgents:");
  const sortedAgents = Object.entries(agents).sort(
    ([, a], [, b]) => b.tokens - a.tokens,
  );
  for (const [name, data] of sortedAgents) {
    const icon = TIERS[data.tier].icon;
    const delta = formatDelta(previous.agents[name], data.tokens);
    console.log(
      `  ${icon.padEnd(4)} ${name.padEnd(20)} ${delta}  (${data.model})`,
    );
  }

  // Report removed agents
  for (const name of Object.keys(previous.agents)) {
    if (!agents[name]) {
      console.log(
        `        ${name.padEnd(20)} removed (was ${previous.agents[name]} tokens)`,
      );
    }
  }

  console.log(`\nOutput: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
