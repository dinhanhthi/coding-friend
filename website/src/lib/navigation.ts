import type { NavItem, NavSection } from "./types";
import { getAllTokenData, type SkillTokenEntry } from "./token-data";

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

/** Return tier for a skill slug like "skills/cf-plan". */
function tierOf(slug: string): NavItem["tier"] {
  return skillTiers[slug.replace("skills/", "")];
}

export const docsNavigation: NavSection[] = [
  {
    title: "Getting Started",
    items: [
      { title: "Installation", slug: "getting-started/installation" },
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
      },
      {
        title: "/cf-commit",
        slug: "skills/cf-commit",
        manualOnly: true,
        tier: tierOf("skills/cf-commit"),
      },
      {
        title: "/cf-fix",
        slug: "skills/cf-fix",
        tier: tierOf("skills/cf-fix"),
      },
      {
        title: "/cf-help",
        slug: "skills/cf-help",
        tier: tierOf("skills/cf-help"),
      },
      {
        title: "/cf-learn",
        slug: "skills/cf-learn",
        tier: tierOf("skills/cf-learn"),
      },
      {
        title: "/cf-optimize",
        slug: "skills/cf-optimize",
        tier: tierOf("skills/cf-optimize"),
      },
      {
        title: "/cf-plan",
        slug: "skills/cf-plan",
        tier: tierOf("skills/cf-plan"),
      },
      {
        title: "/cf-remember",
        slug: "skills/cf-remember",
        tier: tierOf("skills/cf-remember"),
      },
      {
        title: "/cf-research",
        slug: "skills/cf-research",
        manualOnly: true,
        tier: tierOf("skills/cf-research"),
      },
      {
        title: "/cf-review",
        slug: "skills/cf-review",
        tier: tierOf("skills/cf-review"),
      },
      {
        title: "/cf-review-in",
        slug: "skills/cf-review-in",
        manualOnly: true,
        tier: tierOf("skills/cf-review-in"),
      },
      {
        title: "/cf-review-out",
        slug: "skills/cf-review-out",
        manualOnly: true,
        tier: tierOf("skills/cf-review-out"),
      },
      {
        title: "/cf-scan",
        slug: "skills/cf-scan",
        manualOnly: true,
        tier: tierOf("skills/cf-scan"),
      },
      {
        title: "/cf-session",
        slug: "skills/cf-session",
        tier: tierOf("skills/cf-session"),
      },
      {
        title: "/cf-ship",
        slug: "skills/cf-ship",
        manualOnly: true,
        tier: tierOf("skills/cf-ship"),
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
      },
      { title: "cf-tdd", slug: "skills/cf-tdd", tier: tierOf("skills/cf-tdd") },
      {
        title: "cf-verification",
        slug: "skills/cf-verification",
        tier: tierOf("skills/cf-verification"),
      },
    ],
  },
  {
    title: "CLI Commands",
    items: [
      { title: "Overview", slug: "cli/overview" },
      { title: "cf config", slug: "cli/cf-config" },
      { title: "cf dev", slug: "cli/cf-dev" },
      { title: "cf disable", slug: "cli/cf-disable" },
      { title: "cf enable", slug: "cli/cf-enable" },
      { title: "cf host", slug: "cli/cf-host" },
      { title: "cf init", slug: "cli/cf-init" },
      { title: "cf install", slug: "cli/cf-install" },
      { title: "cf mcp", slug: "cli/cf-mcp" },
      { title: "cf memory", slug: "cli/cf-memory" },
      { title: "cf permission", slug: "cli/cf-permission" },
      { title: "cf session", slug: "cli/cf-session" },
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
      { title: "Hooks", slug: "reference/hooks" },
      { title: "Auto-Approve", slug: "reference/auto-approve" },
      { title: "Permissions", slug: "reference/permissions" },
      { title: "Security", slug: "reference/security" },
      { title: "Memory System", slug: "reference/memory-system" },
      { title: "Context Footprint", slug: "reference/context-usage" },
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
