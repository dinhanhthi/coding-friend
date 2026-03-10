export interface LearnCategory {
  name: string;
  description: string;
}

export interface LearnConfig {
  language?: string;
  outputDir?: string;
  categories?: LearnCategory[];
  autoCommit?: boolean;
  readmeIndex?: boolean | "per-category";
}

export type StatuslineComponent =
  | "version"
  | "folder"
  | "model"
  | "branch"
  | "context"
  | "rate_limit";

export interface StatuslineConfig {
  components?: StatuslineComponent[];
}

export const STATUSLINE_COMPONENTS: {
  id: StatuslineComponent;
  label: string;
}[] = [
  { id: "version", label: "Plugin version (cf v0.3.0)" },
  { id: "folder", label: "Project name (MyProject)" },
  { id: "model", label: "Active model (Opus 4.6)" },
  { id: "branch", label: "Git branch (⎇ main)" },
  { id: "context", label: "Context window usage (ctx 42%)" },
  {
    id: "rate_limit",
    label: "Rate limit — current & weekly usage (requires curl & jq)",
  },
];

export const ALL_COMPONENT_IDS: StatuslineComponent[] =
  STATUSLINE_COMPONENTS.map((c) => c.id);

export interface CodingFriendConfig {
  language?: string;
  docsDir?: string;
  learn?: LearnConfig;
  statusline?: StatuslineConfig;
}

export const DEFAULT_CONFIG: Required<
  Pick<CodingFriendConfig, "language" | "docsDir">
> & { learn: Required<LearnConfig> } = {
  language: "en",
  docsDir: "docs",
  learn: {
    language: "en",
    outputDir: "docs/learn",
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
  },
};
