import type { NavSection } from "./types";

export const docsNavigation: NavSection[] = [
  {
    title: "Getting Started",
    items: [
      { title: "Installation", slug: "getting-started/installation" },
      { title: "Quick Start", slug: "getting-started/quick-start" },
      { title: "Skills Overview", slug: "skills/overview" },
    ],
  },
  {
    title: "/Slash Skills",
    items: [
      {
        title: "/cf-ask",
        slug: "skills/cf-ask",
        manualOnly: true,
        tier: "medium",
      },
      {
        title: "/cf-commit",
        slug: "skills/cf-commit",
        manualOnly: true,
        tier: "low",
      },
      { title: "/cf-fix", slug: "skills/cf-fix", tier: "medium" },
      { title: "/cf-help", slug: "skills/cf-help", tier: "medium" },
      { title: "/cf-learn", slug: "skills/cf-learn", tier: "medium" },
      { title: "/cf-optimize", slug: "skills/cf-optimize", tier: "medium" },
      { title: "/cf-plan", slug: "skills/cf-plan", tier: "medium" },
      { title: "/cf-remember", slug: "skills/cf-remember", tier: "medium" },
      {
        title: "/cf-research",
        slug: "skills/cf-research",
        manualOnly: true,
        tier: "medium",
      },
      { title: "/cf-review", slug: "skills/cf-review", tier: "medium" },
      {
        title: "/cf-review-in",
        slug: "skills/cf-review-in",
        manualOnly: true,
        tier: "medium",
      },
      {
        title: "/cf-review-out",
        slug: "skills/cf-review-out",
        manualOnly: true,
        tier: "medium",
      },
      {
        title: "/cf-scan",
        slug: "skills/cf-scan",
        manualOnly: true,
        tier: "high",
      },
      { title: "/cf-session", slug: "skills/cf-session", tier: "medium" },
      {
        title: "/cf-ship",
        slug: "skills/cf-ship",
        manualOnly: true,
        tier: "low",
      },
    ],
  },
  {
    title: "Auto-Invoked Skills",
    items: [
      { title: "cf-auto-review", slug: "skills/cf-auto-review", tier: "low" },
      { title: "cf-sys-debug", slug: "skills/cf-sys-debug", tier: "medium" },
      { title: "cf-tdd", slug: "skills/cf-tdd", tier: "medium" },
      { title: "cf-verification", slug: "skills/cf-verification", tier: "low" },
    ],
  },
  {
    title: "CLI Commands",
    items: [
      { title: "Overview", slug: "cli/overview" },
      { title: "cf install", slug: "cli/cf-install" },
      { title: "cf uninstall", slug: "cli/cf-uninstall" },
      { title: "cf disable", slug: "cli/cf-disable" },
      { title: "cf enable", slug: "cli/cf-enable" },
      { title: "cf init", slug: "cli/cf-init" },
      { title: "cf config", slug: "cli/cf-config" },
      { title: "cf host", slug: "cli/cf-host" },
      { title: "cf mcp", slug: "cli/cf-mcp" },
      { title: "cf permission", slug: "cli/cf-permission" },
      { title: "cf statusline", slug: "cli/cf-statusline" },
      { title: "cf status", slug: "cli/cf-status" },
      { title: "cf update", slug: "cli/cf-update" },
      { title: "cf dev", slug: "cli/cf-dev" },
      { title: "cf session", slug: "cli/cf-session" },
      { title: "cf memory", slug: "cli/cf-memory" },
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
      { title: "Quality Evaluation", slug: "reference/evaluation" },
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
