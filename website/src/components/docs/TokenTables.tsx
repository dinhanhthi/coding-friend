import {
  getAllTokenData,
  type Tier,
  type SkillTokenEntry,
  type AgentTokenEntry,
} from "@/lib/token-data";
import TokenBadge from "@/components/ui/TokenBadge";

/* ────────────────────────────────────────────────────────────
   METADATA — human-curated descriptions for each table row.
   Token counts, tiers, and models are read from token-counts.json.
   ──────────────────────────────────────────────────────────── */

const slashCommandMeta: Record<string, string> = {
  "cf-scan": "Scan project and bootstrap memory",
  "cf-learn": "Extract human learning docs",
  "cf-fix": "Quick bug fix workflow",
  "cf-remember": "Capture project knowledge",
  "cf-ask": "Quick Q&A about codebase",
  "cf-help": "Answer questions about Coding Friend",
  "cf-plan": "Brainstorm and plan",
  "cf-review": "Multi-layer code review",
  "cf-review-out": "Generate review prompt for external AI",
  "cf-review-in": "Collect external review results",
  "cf-optimize": "Structured optimization",
  "cf-research": "In-depth research",
  "cf-session": "Save/load sessions",
  "cf-commit": "Smart conventional commits",
  "cf-ship": "Verify, commit, push, PR",
};

const autoSkillMeta: Record<string, string> = {
  "cf-sys-debug": "Debugging issues",
  "cf-tdd": "Writing new code",
  "cf-verification": "Before claiming done",
};

const agentMeta: Record<string, string> = {
  "cf-writer": "Lightweight doc writing",
  "cf-writer-deep": "Deep reasoning docs",
  "cf-explorer": "Codebase exploration",
  "cf-planner": "Task decomposition",
  "cf-reviewer": "Multi-layer review",
  "cf-implementer": "TDD implementation",
};

const modelDisplayName: Record<string, string> = {
  haiku: "Haiku",
  sonnet: "Sonnet",
  opus: "Opus",
};

/* ── overview.mdx metadata (richer descriptions + trigger info) ── */

const overviewSlashMeta: Record<
  string,
  { description: string; triggeredBy: string }
> = {
  "cf-plan": {
    description: "Brainstorm and create structured implementation plans",
    triggeredBy: "slash + auto",
  },
  "cf-fix": {
    description: "Quick bug fix workflow with problem verification",
    triggeredBy: "slash + auto",
  },
  "cf-ask": {
    description: "Quick Q&A about your codebase with persistent memory",
    triggeredBy: "slash",
  },
  "cf-optimize": {
    description: "Structured optimization with before/after measurement",
    triggeredBy: "slash + auto",
  },
  "cf-scan": {
    description: "Scan project and bootstrap memory with project knowledge",
    triggeredBy: "slash",
  },
  "cf-review": {
    description: "Multi-layer code review in a forked subagent",
    triggeredBy: "slash + auto",
  },
  "cf-commit": {
    description: "Smart conventional commits with diff analysis",
    triggeredBy: "slash",
  },
  "cf-ship": {
    description: "Verify, commit, push, and create PR in one command",
    triggeredBy: "slash",
  },
  "cf-remember": {
    description: "Capture project knowledge for AI memory across sessions",
    triggeredBy: "slash + auto",
  },
  "cf-learn": {
    description: "Extract human learning docs from coding sessions",
    triggeredBy: "slash + auto",
  },
  "cf-research": {
    description: "In-depth research with web search and parallel subagents",
    triggeredBy: "slash",
  },
  "cf-session": {
    description: "Save session to docs/sessions/ to resume on another machine",
    triggeredBy: "slash",
  },
  "cf-help": {
    description: "Answer questions about Coding Friend",
    triggeredBy: "slash + auto",
  },
};

const overviewAutoMeta: Record<
  string,
  { activatesWhen: string; whatItDoes: string }
> = {
  "cf-tdd": {
    activatesWhen: "Writing new code",
    whatItDoes: "Enforces test-driven development: RED → GREEN → REFACTOR",
  },
  "cf-sys-debug": {
    activatesWhen: "Debugging issues",
    whatItDoes:
      "Guides 4-phase systematic debugging + documentation: Investigate, Analyze, Test, Fix, then Document",
  },
  "cf-verification": {
    activatesWhen: "Before claiming task complete",
    whatItDoes:
      "Ensures tests pass, changes verified, no regressions introduced",
  },
};

const agentRefMeta: Record<string, string> = {
  "cf-explorer": "Read-only codebase exploration and context gathering",
  "cf-reviewer": "Multi-layer code review with integrated 5-layer methodology",
  "cf-implementer": "TDD-driven implementation with test-first approach",
  "cf-planner": "Task decomposition, approach brainstorming, and planning",
  "cf-writer": "Lightweight document writing and markdown generation",
  "cf-writer-deep": "Deep reasoning for nuanced technical documentation",
};

/* ────────────────────────────────────────────────────────────
   HELPERS
   ──────────────────────────────────────────────────────────── */

function approxTokens(tokens: number): string {
  if (tokens >= 1000) {
    const rounded = Math.round(tokens / 100) * 100;
    return `~${rounded.toLocaleString("en-US")}`;
  }
  return `~${tokens}`;
}

/* ────────────────────────────────────────────────────────────
   COMPONENTS
   ──────────────────────────────────────────────────────────── */

export function BootstrapTokens() {
  const data = getAllTokenData();
  const tokens = data.bootstrap.tokens;
  return <>{approxTokens(tokens)} tokens</>;
}

const tierSystemRows: { tier: Tier; range: string; meaning: string }[] = [
  {
    tier: "low",
    range: "< 1,000 tokens",
    meaning: "Lightweight — small prompt footprint",
  },
  {
    tier: "medium",
    range: "1,000 – 2,500 tokens",
    meaning: "Moderate — standard prompt footprint",
  },
  {
    tier: "high",
    range: "> 2,500 tokens",
    meaning: "Heavy — large prompt footprint",
  },
];

export function TierSystemTable() {
  return (
    <table>
      <thead>
        <tr>
          <th>Tier</th>
          <th>Icon</th>
          <th>Token Range</th>
          <th>Meaning</th>
        </tr>
      </thead>
      <tbody>
        {tierSystemRows.map(({ tier, range, meaning }) => (
          <tr key={tier}>
            <td>{tier.charAt(0).toUpperCase() + tier.slice(1)}</td>
            <td>
              <TokenBadge tier={tier} showTooltip={false} />
            </td>
            <td>{range}</td>
            <td>{meaning}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SlashCommandsTable() {
  const data = getAllTokenData();
  const skills = data.skills as Record<string, SkillTokenEntry>;

  const slashSkills = Object.entries(skills)
    .filter(([, v]) => v.type === "slash")
    .sort(([, a], [, b]) => b.tokens - a.tokens);

  return (
    <table>
      <thead>
        <tr>
          <th>Command</th>
          <th>Context</th>
          <th>Approx. Tokens</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        {slashSkills.map(([name, entry]) => (
          <tr key={name}>
            <td>
              <a href={`/docs/skills/${name}/`}>{`/${name}`}</a>
            </td>
            <td>
              <TokenBadge tier={entry.tier} />
            </td>
            <td>{approxTokens(entry.tokens)}</td>
            <td>{slashCommandMeta[name] ?? name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AutoSkillsTable() {
  const data = getAllTokenData();
  const skills = data.skills as Record<string, SkillTokenEntry>;

  const autoSkills = Object.entries(skills)
    .filter(([, v]) => v.type === "auto")
    .sort(([, a], [, b]) => b.tokens - a.tokens);

  return (
    <table>
      <thead>
        <tr>
          <th>Skill</th>
          <th>Context</th>
          <th>Approx. Tokens</th>
          <th>Activates When</th>
        </tr>
      </thead>
      <tbody>
        {autoSkills.map(([name, entry]) => (
          <tr key={name}>
            <td>
              <a href={`/docs/skills/${name}/`}>{name}</a>
            </td>
            <td>
              <TokenBadge tier={entry.tier} />
            </td>
            <td>{approxTokens(entry.tokens)}</td>
            <td>{autoSkillMeta[name] ?? name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function AgentsTable() {
  const data = getAllTokenData();
  const agents = data.agents as Record<string, AgentTokenEntry>;

  const sortedAgents = Object.entries(agents).sort(
    ([, a], [, b]) => b.tokens - a.tokens,
  );

  return (
    <table>
      <thead>
        <tr>
          <th>Agent</th>
          <th>Context</th>
          <th>Approx. Tokens</th>
          <th>Model</th>
          <th>Purpose</th>
        </tr>
      </thead>
      <tbody>
        {sortedAgents.map(([name, entry]) => (
          <tr key={name}>
            <td>
              <code>{name}</code>
            </td>
            <td>
              <TokenBadge tier={entry.tier} />
            </td>
            <td>{approxTokens(entry.tokens)}</td>
            <td>{modelDisplayName[entry.model] ?? entry.model}</td>
            <td>{agentMeta[name] ?? name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ────────────────────────────────────────────────────────────
   OVERVIEW.MDX COMPONENTS
   ──────────────────────────────────────────────────────────── */

export function OverviewSlashCommandsTable() {
  const data = getAllTokenData();
  const skills = data.skills as Record<string, SkillTokenEntry>;

  const slashSkills = Object.entries(skills)
    .filter(([, v]) => v.type === "slash")
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <table>
      <thead>
        <tr>
          <th>Command</th>
          <th>Description</th>
          <th>Triggered by</th>
          <th>Context</th>
        </tr>
      </thead>
      <tbody>
        {slashSkills.map(([name, entry]) => {
          const meta = overviewSlashMeta[name];
          return (
            <tr key={name}>
              <td>
                <a href={`/docs/skills/${name}/`}>{`/${name}`}</a>
              </td>
              <td>{meta?.description ?? slashCommandMeta[name] ?? name}</td>
              <td>{meta?.triggeredBy ?? "slash"}</td>
              <td>
                <TokenBadge tier={entry.tier} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function OverviewAutoSkillsTable() {
  const data = getAllTokenData();
  const skills = data.skills as Record<string, SkillTokenEntry>;

  const autoSkills = Object.entries(skills)
    .filter(([, v]) => v.type === "auto")
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <table>
      <thead>
        <tr>
          <th>Skill</th>
          <th>Activates When</th>
          <th>What It Does</th>
          <th>Context</th>
        </tr>
      </thead>
      <tbody>
        {autoSkills.map(([name, entry]) => {
          const meta = overviewAutoMeta[name];
          return (
            <tr key={name}>
              <td>
                <a href={`/docs/skills/${name}/`}>{name}</a>
              </td>
              <td>{meta?.activatesWhen ?? name}</td>
              <td>{meta?.whatItDoes ?? name}</td>
              <td>
                <TokenBadge tier={entry.tier} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ────────────────────────────────────────────────────────────
   AGENTS.MDX COMPONENT
   ──────────────────────────────────────────────────────────── */

export function AgentRefTable() {
  const data = getAllTokenData();
  const agents = data.agents as Record<string, AgentTokenEntry>;

  const sortedAgents = Object.entries(agents).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <table>
      <thead>
        <tr>
          <th>Agent</th>
          <th>Model</th>
          <th>Context</th>
          <th>Purpose</th>
        </tr>
      </thead>
      <tbody>
        {sortedAgents.map(([name, entry]) => (
          <tr key={name}>
            <td>
              <code>{name}</code>
            </td>
            <td>Claude {modelDisplayName[entry.model] ?? entry.model}</td>
            <td>
              <TokenBadge tier={entry.tier} />
            </td>
            <td>{agentRefMeta[name] ?? agentMeta[name] ?? name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
