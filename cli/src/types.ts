// Config types are inferred from the zod schemas in lib/config.ts (the single
// source). Type-only imports: config.ts imports values from this file.
import type { z } from "zod";
import type {
  ConfigSchema,
  LearnCategorySchema,
  LearnConfigSchema,
  MemoryConfigSchema,
  ReviewConfigSchema,
  ShowcaseConfigSchema,
  StatuslineComponentSchema,
  StatuslineConfigSchema,
} from "./lib/config.js";

export type LearnCategory = z.infer<typeof LearnCategorySchema>;
export type LearnConfig = z.infer<typeof LearnConfigSchema>;

/** Single source for statusline component ids (zod enum in lib/config.ts). */
export const STATUSLINE_COMPONENT_IDS = [
  "version",
  "folder",
  "model",
  "branch",
  "account",
  "context",
  "rate_limit",
  "session",
  "task_agent",
] as const;

export type StatuslineComponent = z.infer<typeof StatuslineComponentSchema>;
export type StatuslineConfig = z.infer<typeof StatuslineConfigSchema>;

export const STATUSLINE_COMPONENTS: {
  id: StatuslineComponent;
  label: string;
}[] = [
  { id: "version", label: "Plugin version (cf v0.3.0)" },
  { id: "folder", label: "Project name (MyProject)" },
  { id: "model", label: "Active model (Opus 4.6)" },
  { id: "branch", label: "Git branch (⎇ main)" },
  {
    id: "account",
    label: "Account info — name, email (from ~/.claude.json)",
  },
  { id: "context", label: "Context window usage (ctx 42%)" },
  {
    id: "rate_limit",
    label: "Rate limit — current & weekly usage (requires jq)",
  },
  {
    id: "session",
    label: "Claude Code session ID (🆔 a1b2c3d4-…)",
  },
  {
    id: "task_agent",
    label: "Task progress & active agent (Tasks: 2/5 | Agent: cf-reviewer)",
  },
];

export const ALL_COMPONENT_IDS: StatuslineComponent[] =
  STATUSLINE_COMPONENTS.map((c) => c.id);

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;
export type ReviewConfig = z.infer<typeof ReviewConfigSchema>;
export type ShowcaseConfig = z.infer<typeof ShowcaseConfigSchema>;
export type ShowcaseVideoConfig = NonNullable<ShowcaseConfig["video"]>;
export type ShowcasePosterConfig = NonNullable<ShowcaseConfig["poster"]>;

/** Default cap for autopilot /cf-review fix-loop rounds when `review.maxRounds` is unset. */
export const DEFAULT_REVIEW_MAX_ROUNDS = 5;

export type CodingFriendConfig = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Required<
  Pick<CodingFriendConfig, "language" | "docsDir">
> & { learn: Required<LearnConfig> } = {
  language: "en",
  docsDir: "docs",
  learn: {
    language: "en",
    outputDir: "~/.coding-friend/learn",
    categories: [
      {
        name: "concepts",
        description: "Design patterns, algorithms, architecture principles",
      },
      { name: "patterns", description: "Repository pattern, observer pattern" },
      {
        name: "languages",
        description: "Language-specific features, syntax, idioms",
      },
      { name: "tools", description: "Libraries, frameworks, CLI tools" },
      {
        name: "debugging",
        description: "Debugging techniques, bug fixes",
      },
    ],
    autoCommit: false,
    readmeIndex: false,
    disabled: false,
  },
};
