import type { NavSection } from "./types";

export const docsNavigation: NavSection[] = [
  {
    title: "Getting Started",
    items: [
      { title: "Installation", slug: "getting-started/installation" },
      { title: "Quick Start", slug: "getting-started/quick-start" },
    ],
  },
  {
    title: "Skills",
    items: [
      { title: "Overview", slug: "skills/overview" },
      { title: "/cf-plan", slug: "skills/cf-plan" },
      { title: "/cf-fix", slug: "skills/cf-fix" },
      { title: "/cf-ask", slug: "skills/cf-ask", manualOnly: true },
      { title: "/cf-optimize", slug: "skills/cf-optimize" },
      { title: "/cf-review", slug: "skills/cf-review" },
      { title: "/cf-commit", slug: "skills/cf-commit", manualOnly: true },
      { title: "/cf-ship", slug: "skills/cf-ship", manualOnly: true },
      { title: "/cf-remember", slug: "skills/cf-remember" },
      { title: "/cf-learn", slug: "skills/cf-learn" },
      { title: "/cf-research", slug: "skills/cf-research", manualOnly: true },
      { title: "/cf-session", slug: "skills/cf-session" },
      { title: "/cf-help", slug: "skills/cf-help" },
    ],
  },
  {
    title: "Auto-Invoked",
    items: [
      { title: "cf-tdd", slug: "skills/cf-tdd" },
      { title: "cf-sys-debug", slug: "skills/cf-sys-debug" },
      { title: "cf-auto-review", slug: "skills/cf-auto-review" },
      { title: "cf-verification", slug: "skills/cf-verification" },
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
      { title: "cf update", slug: "cli/cf-update" },
      { title: "cf dev", slug: "cli/cf-dev" },
      { title: "cf session", slug: "cli/cf-session" },
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
      { title: "Permissions", slug: "reference/permissions" },
      { title: "Security", slug: "reference/security" },
    ],
  },
];

export function flattenNavigation() {
  const items: {
    title: string;
    slug: string;
    section: string;
    manualOnly?: boolean;
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
