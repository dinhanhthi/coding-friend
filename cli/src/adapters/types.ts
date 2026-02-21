import { CodingFriendConfig } from "../types.js";

// ---------------------------------------------------------------------------
// Platform identifiers
// ---------------------------------------------------------------------------

export const PLATFORM_IDS = [
  "claude-code",
  "cursor",
  "windsurf",
  "copilot",
  "roo-code",
  "opencode",
  "codex",
  "antigravity",
] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export type InstallScope = "global" | "local";

// ---------------------------------------------------------------------------
// Generated file descriptor
// ---------------------------------------------------------------------------

export interface GeneratedFile {
  /** Absolute path where the file should be written */
  path: string;
  /** File content */
  content: string;
  /** If true, merge with existing file using section markers */
  merge?: boolean;
}

// ---------------------------------------------------------------------------
// Parsed skill
// ---------------------------------------------------------------------------

export interface ParsedSkill {
  /** Skill directory name, e.g. "cf-tdd" */
  dirName: string;
  /** From YAML frontmatter */
  name: string;
  /** From YAML frontmatter */
  description: string;
  /** Whether the skill can be invoked by name via slash */
  userInvocable: boolean;
  /** Raw markdown body (everything after frontmatter) */
  body: string;
  /** Full raw content including frontmatter */
  raw: string;
}

// ---------------------------------------------------------------------------
// Parsed hook
// ---------------------------------------------------------------------------

export interface ParsedHook {
  /** Claude Code event name, e.g. "PreToolUse" */
  event: string;
  /** Matcher pattern, e.g. "Read|Write|Edit|Glob|Grep" */
  matcher: string;
  /** Path to the shell script relative to plugin root */
  scriptPath: string;
  /** Script filename, e.g. "privacy-block.sh" */
  scriptName: string;
  /** Whether this hook runs asynchronously */
  async: boolean;
  /** The actual script content */
  scriptContent: string;
}

// ---------------------------------------------------------------------------
// Global path info
// ---------------------------------------------------------------------------

export interface GlobalPathInfo {
  /** Global rules directory or file */
  rules?: string;
  /** Global hooks config path */
  hooks?: string;
  /** Global skills directory */
  skills?: string;
  /** Global plugins directory */
  plugins?: string;
  /** Human-readable note about limitations */
  note?: string;
}

// ---------------------------------------------------------------------------
// Generation options
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  /** Where the coding-friend plugin is installed (contains skills/, hooks/) */
  pluginRoot: string;
  /** Project root (for local scope) */
  projectRoot: string;
  /** Parsed skills to include */
  skills: ParsedSkill[];
  /** Parsed hooks to include */
  hooks: ParsedHook[];
  /** User config */
  config: CodingFriendConfig;
}

// ---------------------------------------------------------------------------
// Platform adapter interface
// ---------------------------------------------------------------------------

export interface PlatformAdapter {
  /** Human-readable name, e.g. "Cursor" */
  name: string;
  /** Unique identifier */
  id: PlatformId;

  // -- Detection -----------------------------------------------------------

  /** Check if this platform is used in the given project */
  detect(projectRoot: string): boolean;

  // -- Capabilities --------------------------------------------------------

  /** Whether this platform supports global file-based installation */
  supportsGlobalInstall(): boolean;
  /** Whether this platform supports lifecycle hooks */
  supportsHooks(): boolean;
  /** Whether this platform supports MCP servers */
  supportsMCP(): boolean;

  // -- Generation ----------------------------------------------------------

  /** Generate all files for the given scope */
  generate(scope: InstallScope, options: GenerateOptions): GeneratedFile[];

  // -- Metadata ------------------------------------------------------------

  /** List all file paths that will be created/modified */
  getOutputPaths(scope: InstallScope, options: GenerateOptions): string[];
  /** Glob patterns to add to .gitignore (local installs only) */
  getGitignorePatterns(): string[];
  /** Global config directory info */
  getGlobalPaths(): GlobalPathInfo;
}

// ---------------------------------------------------------------------------
// Section markers for safe file merging
// ---------------------------------------------------------------------------

export const SECTION_MARKER_START = "<!-- coding-friend:start -->";
export const SECTION_MARKER_END = "<!-- coding-friend:end -->";
