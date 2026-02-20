export interface LearnCategory {
  name: string;
  description: string;
}

export interface LearnConfig {
  outputDir?: string;
  categories?: LearnCategory[];
  autoCommit?: boolean;
  readmeIndex?: boolean | "per-category";
}

export interface CodingFriendConfig {
  language?: string;
  docsDir?: string;
  devRulesReminder?: boolean;
  learn?: LearnConfig;
}

export const DEFAULT_CONFIG: Required<
  Pick<CodingFriendConfig, "language" | "docsDir" | "devRulesReminder">
> & { learn: Required<LearnConfig> } = {
  language: "en",
  docsDir: "docs",
  devRulesReminder: true,
  learn: {
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
