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
  disabled?: boolean;
}

export type StatuslineComponent =
  | "version"
  | "folder"
  | "model"
  | "branch"
  | "account"
  | "context"
  | "rate_limit"
  | "session"
  | "task_agent";

export interface StatuslineConfig {
  components?: StatuslineComponent[];
  accountAliases?: Record<string, string>;
}

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

export interface MemoryConfig {
  tier?: "auto" | "full" | "lite" | "markdown";
  embedding?: {
    provider?: "transformers" | "ollama";
    model?: string;
    ollamaUrl?: string;
  };
  autoCapture?: boolean;
  autoStart?: boolean;
}

export interface ReviewConfig {
  withCodex?: boolean;
  withClaude?: boolean;
  withGrok?: boolean;
  withCursor?: boolean;
  withGemini?: boolean;
  /** Default `/cf-review` to `--fix` (apply Critical/Important until clean). Autopilot passes `--no-fix`. */
  fix?: boolean;
  /** Default `/cf-review` to `--commit` (implies `fix`). Autopilot passes `--no-fix`. */
  commit?: boolean;
  /** Max /cf-review rounds in the autopilot fix loop (initial + re-reviews). Default 5. */
  maxRounds?: number;
  /** Seconds each external reviewer subprocess may run before it is killed. Default 300. */
  agentTimeout?: number;
  /** Seconds an in-session reviewer job may run before the main agent stops waiting. Default 600. */
  nativeTimeout?: number;
}

/** Saved `/cf-showcase --default` answers for video mode. */
export interface ShowcaseVideoConfig {
  /** Target length in whole seconds, or "auto" to let the agent decide. */
  length?: "auto" | number;
  aspect?: "16:9" | "1:1" | "9:16";
  audio?: boolean;
  languages?: string[];
}

/** Saved `/cf-showcase --default` answers for poster mode. */
export interface ShowcasePosterConfig {
  /** "A4", "A3", "letter", or "<width>x<height>" in pixels. */
  size?: string;
  formats?: ("png" | "pdf" | "html")[];
  languages?: string[];
}

export interface ShowcaseConfig {
  video?: ShowcaseVideoConfig;
  poster?: ShowcasePosterConfig;
}

/** Default cap for autopilot /cf-review fix-loop rounds when `review.maxRounds` is unset. */
export const DEFAULT_REVIEW_MAX_ROUNDS = 5;

export interface CodingFriendConfig {
  language?: string;
  docsDir?: string;
  tdd?: boolean;
  learn?: LearnConfig;
  statusline?: StatuslineConfig;
  memory?: MemoryConfig;
  review?: ReviewConfig;
  autoApprove?: boolean;
  autoApproveIgnore?: string[];
  autoApproveAllowExtra?: string[];
  privacyBlock?: boolean;
  scoutBlock?: boolean;
  disableGUIPlan?: boolean;
  guiPlanFormat?: "html" | "md";
  planAuto?: boolean;
  planCommitPerTask?: boolean;
  /** Default `/cf-plan-review` to `--fix` (apply Critical/Important without asking). `--no-fix` forces off. */
  planReviewFix?: boolean;
  /** Defaults read by `/cf-showcase --default`. */
  showcase?: ShowcaseConfig;
}

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
