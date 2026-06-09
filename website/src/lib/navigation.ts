import type { NavItem, NavSection } from "./types";
import {
  getAllTokenData,
  getItemStatus,
  type SkillTokenEntry,
  type AgentTokenEntry,
} from "./token-data";

/** Build a skill-name → tier lookup from token-counts.json (once at module load). */
const skillTiers: Record<string, NavItem["tier"]> = (() => {
  const data = getAllTokenData();
  const skills = data.skills as Record<string, SkillTokenEntry>;
  const map: Record<string, NavItem["tier"]> = {};
  for (const [name, entry] of Object.entries(skills)) {
    map[name] = entry.tier;
  }
  return map;
})();

type ItemStatusEntry = { beta: boolean; temporal: "new" | "updated" | null };

/** Build a skill/agent-name → status lookup from token-counts.json (once at module load). */
const itemStatuses: Record<string, ItemStatusEntry> = (() => {
  const data = getAllTokenData();
  const map: Record<string, ItemStatusEntry> = {};
  for (const [name, entry] of Object.entries(
    data.skills as Record<string, SkillTokenEntry>,
  )) {
    map[name] = getItemStatus(entry.state, entry.temporal);
  }
  for (const [name, entry] of Object.entries(
    data.agents as Record<string, AgentTokenEntry>,
  )) {
    map[name] = getItemStatus(entry.state, entry.temporal);
  }
  return map;
})();

/** Return tier for a skill slug like "skills/cf-plan". */
function tierOf(slug: string): NavItem["tier"] {
  return skillTiers[slug.replace("skills/", "")];
}

/** Return beta flag for a skill slug like "skills/cf-plan". */
function betaOf(slug: string): boolean | undefined {
  return itemStatuses[slug.replace("skills/", "")]?.beta || undefined;
}

/** Return temporal status for a skill slug like "skills/cf-plan". */
function temporalOf(slug: string): "new" | "updated" | undefined {
  return itemStatuses[slug.replace("skills/", "")]?.temporal ?? undefined;
}

export const docsNavigation: NavSection[] = [
  {
    title: "Getting Started",
    items: [
      { title: "Installation", slug: "getting-started/installation" },
      { title: "Codex CLI", slug: "getting-started/codex" },
      { title: "Quick Start", slug: "getting-started/quick-start" },
      { title: "Skills Overview", slug: "skills/overview" },
      { title: "Best Practices", slug: "getting-started/best-practices" },
    ],
  },
  {
    title: "/Slash Skills",
    items: [
      {
        title: "/cf-ask",
        slug: "skills/cf-ask",
        manualOnly: true,
        tier: tierOf("skills/cf-ask"),
        beta: betaOf("skills/cf-ask"),
        temporal: temporalOf("skills/cf-ask"),
      },
      {
        title: "/cf-commit",
        slug: "skills/cf-commit",
        manualOnly: true,
        tier: tierOf("skills/cf-commit"),
        beta: betaOf("skills/cf-commit"),
        temporal: temporalOf("skills/cf-commit"),
      },
      {
        title: "/cf-design",
        slug: "skills/cf-design",
        tier: tierOf("skills/cf-design"),
        beta: betaOf("skills/cf-design"),
        temporal: temporalOf("skills/cf-design"),
      },
      {
        title: "/cf-fix",
        slug: "skills/cf-fix",
        tier: tierOf("skills/cf-fix"),
        beta: betaOf("skills/cf-fix"),
        temporal: temporalOf("skills/cf-fix"),
      },
      {
        title: "/cf-help",
        slug: "skills/cf-help",
        tier: tierOf("skills/cf-help"),
        beta: betaOf("skills/cf-help"),
        temporal: temporalOf("skills/cf-help"),
      },
      {
        title: "/cf-learn",
        slug: "skills/cf-learn",
        tier: tierOf("skills/cf-learn"),
        beta: betaOf("skills/cf-learn"),
        temporal: temporalOf("skills/cf-learn"),
      },
      {
        title: "/cf-optimize",
        slug: "skills/cf-optimize",
        tier: tierOf("skills/cf-optimize"),
        beta: betaOf("skills/cf-optimize"),
        temporal: temporalOf("skills/cf-optimize"),
      },
      {
        title: "/cf-plan",
        slug: "skills/cf-plan",
        tier: tierOf("skills/cf-plan"),
        beta: betaOf("skills/cf-plan"),
        temporal: temporalOf("skills/cf-plan"),
      },
      {
        title: "/cf-remember",
        slug: "skills/cf-remember",
        tier: tierOf("skills/cf-remember"),
        beta: betaOf("skills/cf-remember"),
        temporal: temporalOf("skills/cf-remember"),
      },
      {
        title: "/cf-research",
        slug: "skills/cf-research",
        manualOnly: true,
        tier: tierOf("skills/cf-research"),
        beta: betaOf("skills/cf-research"),
        temporal: temporalOf("skills/cf-research"),
      },
      {
        title: "/cf-review",
        slug: "skills/cf-review",
        tier: tierOf("skills/cf-review"),
        beta: betaOf("skills/cf-review"),
        temporal: temporalOf("skills/cf-review"),
      },
      {
        title: "/cf-review-in",
        slug: "skills/cf-review-in",
        manualOnly: true,
        tier: tierOf("skills/cf-review-in"),
        beta: betaOf("skills/cf-review-in"),
        temporal: temporalOf("skills/cf-review-in"),
      },
      {
        title: "/cf-review-out",
        slug: "skills/cf-review-out",
        manualOnly: true,
        tier: tierOf("skills/cf-review-out"),
        beta: betaOf("skills/cf-review-out"),
        temporal: temporalOf("skills/cf-review-out"),
      },
      {
        title: "/cf-scan",
        slug: "skills/cf-scan",
        manualOnly: true,
        tier: tierOf("skills/cf-scan"),
        beta: betaOf("skills/cf-scan"),
        temporal: temporalOf("skills/cf-scan"),
      },
      {
        title: "/cf-session",
        slug: "skills/cf-session",
        tier: tierOf("skills/cf-session"),
        beta: betaOf("skills/cf-session"),
        temporal: temporalOf("skills/cf-session"),
      },
      {
        title: "/cf-teach",
        slug: "skills/cf-teach",
        manualOnly: true,
        tier: tierOf("skills/cf-teach"),
        beta: betaOf("skills/cf-teach"),
        temporal: temporalOf("skills/cf-teach"),
      },
      {
        title: "/cf-warm",
        slug: "skills/cf-warm",
        manualOnly: true,
        tier: tierOf("skills/cf-warm"),
        beta: betaOf("skills/cf-warm"),
        temporal: temporalOf("skills/cf-warm"),
      },
      {
        title: "/cf-ship",
        slug: "skills/cf-ship",
        manualOnly: true,
        tier: tierOf("skills/cf-ship"),
        beta: betaOf("skills/cf-ship"),
        temporal: temporalOf("skills/cf-ship"),
      },
    ],
  },
  {
    title: "Only Auto-Invoked Skills",
    items: [
      {
        title: "cf-sys-debug",
        slug: "skills/cf-sys-debug",
        tier: tierOf("skills/cf-sys-debug"),
        beta: betaOf("skills/cf-sys-debug"),
        temporal: temporalOf("skills/cf-sys-debug"),
      },
      {
        title: "cf-tdd",
        slug: "skills/cf-tdd",
        tier: tierOf("skills/cf-tdd"),
        beta: betaOf("skills/cf-tdd"),
        temporal: temporalOf("skills/cf-tdd"),
      },
      {
        title: "cf-verification",
        slug: "skills/cf-verification",
        tier: tierOf("skills/cf-verification"),
        beta: betaOf("skills/cf-verification"),
        temporal: temporalOf("skills/cf-verification"),
      },
    ],
  },
  {
    title: "CLI Commands",
    items: [
      { title: "Overview", slug: "cli/overview" },
      { title: "cf config", slug: "cli/cf-config" },
      { title: "cf clean", slug: "cli/cf-clean" },
      { title: "cf dev", slug: "cli/cf-dev" },
      { title: "cf disable", slug: "cli/cf-disable" },
      { title: "cf enable", slug: "cli/cf-enable" },
      { title: "cf guide", slug: "cli/cf-guide" },
      { title: "cf init", slug: "cli/cf-init" },
      { title: "cf install", slug: "cli/cf-install" },
      { title: "cf learn", slug: "cli/cf-learn" },
      { title: "cf mcp", slug: "cli/cf-mcp" },
      { title: "cf memory", slug: "cli/cf-memory" },
      { title: "cf permission", slug: "cli/cf-permission" },
      { title: "cf session", slug: "cli/cf-session", beta: true },
      { title: "cf status", slug: "cli/cf-status" },
      { title: "cf statusline", slug: "cli/cf-statusline" },
      { title: "cf uninstall", slug: "cli/cf-uninstall" },
      { title: "cf update", slug: "cli/cf-update" },
    ],
  },
  {
    title: "Configuration",
    items: [
      { title: "Config File", slug: "configuration/config-json" },
      {
        title: "Custom Skill Guides",
        slug: "configuration/custom-skill-guides",
      },
      { title: "Ignore Patterns", slug: "configuration/ignore-patterns" },
      { title: "Privacy", slug: "configuration/privacy" },
    ],
  },
  {
    title: "Reference",
    items: [
      { title: "Agents", slug: "reference/agents" },
      {
        title: "Agent Context Handoff",
        slug: "reference/agent-context-handoff",
      },
      { title: "Hooks", slug: "reference/hooks" },
      { title: "Auto-Approve", slug: "reference/auto-approve" },
      { title: "Permissions", slug: "reference/permissions" },
      { title: "Security", slug: "reference/security" },
      { title: "Memory System", slug: "reference/memory-system" },
      { title: "CLI Requirements", slug: "reference/cli-requirements" },
      { title: "MCP Servers", slug: "reference/mcp" },
      { title: "Context Footprint", slug: "reference/context-usage" },
      { title: "Troubleshooting", slug: "reference/troubleshooting" },
    ],
  },
];

export function flattenNavigation() {
  const items: {
    title: string;
    slug: string;
    section: string;
    manualOnly?: boolean;
    tier?: "low" | "medium" | "high";
    beta?: boolean;
    temporal?: "new" | "updated";
  }[] = [];
  for (const section of docsNavigation) {
    for (const item of section.items) {
      items.push({ ...item, section: section.title });
    }
  }
  return items;
}

export function getPrevNext(currentSlug: string) {
  const flat = flattenNavigation();
  const index = flat.findIndex((item) => item.slug === currentSlug);
  return {
    prev: index > 0 ? flat[index - 1] : null,
    next: index < flat.length - 1 ? flat[index + 1] : null,
  };
}
