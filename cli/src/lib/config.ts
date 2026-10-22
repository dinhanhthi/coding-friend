import { resolve, isAbsolute } from "path";
import { z } from "zod";
import { readJson } from "./json.js";
import { localConfigPath, globalConfigPath, resolvePath } from "./paths.js";
import { resolveMainRepoRoot } from "./project-root.js";
import {
  CodingFriendConfig,
  DEFAULT_CONFIG,
  STATUSLINE_COMPONENT_IDS,
} from "../types.js";
import { log } from "./log.js";

/**
 * Deep merge two plain objects. Local values override global at every nesting
 * level, but sibling keys from global are preserved (not dropped).
 */
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: T,
): T {
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(override)) {
    const baseVal = result[key];
    const overVal = override[key];
    if (
      baseVal &&
      overVal &&
      typeof baseVal === "object" &&
      typeof overVal === "object" &&
      !Array.isArray(baseVal) &&
      !Array.isArray(overVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      );
    } else {
      result[key] = overVal;
    }
  }
  return result as T;
}

export const LearnCategorySchema = z.object({
  name: z.string(),
  description: z.string(),
});

export const LearnConfigSchema = z.object({
  language: z.string().optional(),
  outputDir: z.string().optional(),
  categories: z.array(LearnCategorySchema).optional(),
  autoCommit: z.boolean().optional(),
  readmeIndex: z.union([z.boolean(), z.literal("per-category")]).optional(),
  disabled: z.boolean().optional(),
});

export const StatuslineComponentSchema = z.enum(STATUSLINE_COMPONENT_IDS);

export const StatuslineConfigSchema = z.object({
  components: z.array(StatuslineComponentSchema).optional(),
  accountAliases: z.record(z.string(), z.string()).optional(),
});

export const MemoryConfigSchema = z.object({
  tier: z.enum(["auto", "full", "lite", "markdown"]).optional(),
  embedding: z
    .object({
      provider: z.enum(["transformers", "ollama"]).optional(),
      model: z.string().optional(),
      ollamaUrl: z.string().optional(),
    })
    .optional(),
  autoCapture: z.boolean().optional(),
  autoStart: z.boolean().optional(),
});

// Plain z.object (not strict): unknown keys are found by findUnknownKeys, so
// the JSON Schema never emits additionalProperties:false.
export const ReviewConfigSchema = z.object({
  withCodex: z.boolean().optional(),
  withClaude: z.boolean().optional(),
  withGrok: z.boolean().optional(),
  withCursor: z.boolean().optional(),
  withGemini: z.boolean().optional(),
  /** Default `/cf-review` to `--fix` (apply Critical/Important until clean). Autopilot passes `--no-fix`. */
  fix: z.boolean().optional(),
  /** Default `/cf-review` to `--commit` (implies `fix`). Autopilot passes `--no-fix`. */
  commit: z.boolean().optional(),
  /** Max /cf-review rounds in the autopilot fix loop (initial + re-reviews). Default 5. */
  maxRounds: z.number().int().min(1).optional(),
  // Both timeouts are whole positive seconds: zero, negative and fractional
  // values cannot be enforced as a deadline, so they are rejected here rather
  // than coerced somewhere downstream. Deliberately NOT offered in the
  // interactive `cf config` review menu — they are file-only settings.
  /** Seconds each external reviewer subprocess may run before it is killed. Default 300. */
  agentTimeout: z.number().int().min(1).optional(),
  /** Seconds an in-session reviewer job may run before the main agent stops waiting. Default 600. */
  nativeTimeout: z.number().int().min(1).optional(),
});

export const SHOWCASE_POSTER_SIZE_RE = /^(A4|A3|letter|\d+x\d+)$/;

const ShowcaseVideoConfigSchema = z.object({
  length: z.union([z.literal("auto"), z.number().int().min(1)]).optional(),
  aspect: z.enum(["16:9", "1:1", "9:16"]).optional(),
  audio: z.boolean().optional(),
  languages: z.array(z.string().min(1)).min(1).optional(),
});

const ShowcasePosterConfigSchema = z.object({
  size: z.string().regex(SHOWCASE_POSTER_SIZE_RE).optional(),
  formats: z
    .array(z.enum(["png", "pdf", "html"]))
    .min(1)
    .optional(),
  languages: z.array(z.string().min(1)).min(1).optional(),
});

export const ShowcaseConfigSchema = z.object({
  video: ShowcaseVideoConfigSchema.optional(),
  poster: ShowcasePosterConfigSchema.optional(),
});

// No .default(): `cf task` applies the defaults in code.
export const TaskConfigSchema = z.object({
  /** What `cf task` does when a worker hits its quota. Default "wait-then-switch". */
  onQuota: z.enum(["wait-then-switch", "wait", "switch"]).optional(),
  /** Minutes to wait when the quota reset time is unknown or near. Default 30. */
  waitMinutes: z.number().int().min(1).optional(),
  /** Providers to switch through, in order, on quota. Default ["claude", "codex"]. */
  fallback: z
    .array(z.enum(["claude", "codex"]))
    .min(1)
    .optional(),
});

/** Wall-clock "HH:MM", 24-hour. */
const CHEF_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// No .default(): the chef applies the defaults in code.
export const ChefConfigSchema = z.object({
  enabled: z.boolean().optional(),
  commit: z.boolean().optional(),
  notify: z.boolean().optional(),
  schedule: z.array(z.string().regex(CHEF_TIME_RE)).optional(),
  minWakeMinutes: z.number().int().min(1).optional(),
  maxWakesPerDay: z.number().int().min(1).optional(),
  maxTasksPerWake: z.number().int().min(1).optional(),
  maxConcurrentTasks: z.number().int().min(1).optional(),
});

export const ConfigSchema = z.object({
  language: z.string().optional(),
  docsDir: z.string().optional(),
  tdd: z.boolean().optional(),
  learn: LearnConfigSchema.optional(),
  statusline: StatuslineConfigSchema.optional(),
  memory: MemoryConfigSchema.optional(),
  review: ReviewConfigSchema.optional(),
  autoApprove: z.boolean().optional(),
  autoApproveIgnore: z.array(z.string()).optional(),
  autoApproveAllowExtra: z.array(z.string()).optional(),
  privacyBlock: z.boolean().optional(),
  scoutBlock: z.boolean().optional(),
  disableGUIPlan: z.boolean().optional(),
  guiPlanFormat: z.enum(["html", "md"]).optional(),
  planAuto: z.boolean().optional(),
  planCommitPerTask: z.boolean().optional(),
  showcase: ShowcaseConfigSchema.optional(),
  projectRegistry: z.boolean().optional(),
  autoApproveLLM: z.boolean().optional(),
  task: TaskConfigSchema.optional(),
  chef: ChefConfigSchema.optional(),
});

/** JSON Schema (input side) for the config file. */
export function getConfigJsonSchema() {
  return z.toJSONSchema(ConfigSchema, { io: "input" });
}

/** Known config keys for typo suggestions */
const KNOWN_KEYS = Object.keys(ConfigSchema.shape);

/** Nested objects whose unknown keys are reported, in warning order. */
const NESTED_KNOWN_KEYS: Array<[string[], string[]]> = [
  [["review"], Object.keys(ReviewConfigSchema.shape)],
  [["showcase"], Object.keys(ShowcaseConfigSchema.shape)],
  [["showcase", "video"], Object.keys(ShowcaseVideoConfigSchema.shape)],
  [["showcase", "poster"], Object.keys(ShowcasePosterConfigSchema.shape)],
  [["task"], Object.keys(TaskConfigSchema.shape)],
  [["chef"], Object.keys(ChefConfigSchema.shape)],
];

/** Removed keys mapped to their replacement, for a migration hint */
const RENAMED_KEYS: Record<string, string> = {
  autoApproveCodex: "autoApprove",
};

function suggestKey(unknown: string): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const known of KNOWN_KEYS) {
    const dist = levenshtein(unknown.toLowerCase(), known.toLowerCase());
    if (dist < bestDist && dist <= 3) {
      bestDist = dist;
      best = known;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

interface UnknownKey {
  /** Parent path: [] for top level, ["review"] for review.*, etc. */
  path: string[];
  key: string;
}

/**
 * Find keys not declared in the schema, at top level and inside `review` and
 * `showcase`. Order matches what z.strictObject reported: nested keys, then
 * top-level keys.
 */
export function findUnknownKeys(raw: Record<string, unknown>): UnknownKey[] {
  const found: UnknownKey[] = [];
  for (const [path, known] of NESTED_KNOWN_KEYS) {
    let obj: unknown = raw;
    for (const key of path) obj = isPlainObject(obj) ? obj[key] : undefined;
    if (!isPlainObject(obj)) continue;
    for (const key of Object.keys(obj)) {
      if (!known.includes(key)) found.push({ path, key });
    }
  }
  for (const key of Object.keys(raw)) {
    if (!KNOWN_KEYS.includes(key)) found.push({ path: [], key });
  }
  return found;
}

function warnUnknownKey({ path, key }: UnknownKey): void {
  const isNested = path.length > 0;
  const fullKey = isNested ? `${path.join(".")}.${key}` : key;
  const renamedTo = isNested ? undefined : RENAMED_KEYS[key];
  const suggestion = isNested ? null : suggestKey(key);
  const hint = renamedTo
    ? ` It was replaced by '${renamedTo}' — set that instead.`
    : suggestion
      ? ` Did you mean '${suggestion}'?`
      : "";
  log.warn(`Unknown config key '${fullKey}'.${hint}`);
}

/**
 * Validate merged config with Zod. Warns on invalid values and unknown keys.
 * Returns sanitized config with invalid fields stripped.
 */
function validateConfig(merged: Record<string, unknown>): CodingFriendConfig {
  // z.object strips unknown keys silently, so find them before parsing.
  const unknownKeys = findUnknownKeys(merged);
  const result = ConfigSchema.safeParse(merged);
  if (result.success && unknownKeys.length === 0) {
    return result.data as CodingFriendConfig;
  }

  // Warn in the order z.strictObject used: value issues in schema order,
  // nested unknown keys right after their section's value issues, then
  // top-level unknown keys last.
  type Entry = { path: PropertyKey[]; unknown?: UnknownKey; message?: string };
  const entries: Entry[] = [
    ...(result.success ? [] : result.error.issues),
    ...unknownKeys.map((u) => ({ path: u.path, unknown: u })),
  ];
  const rank = (e: Entry): [number, number] =>
    e.path.length === 0
      ? [Infinity, 0]
      : [KNOWN_KEYS.indexOf(String(e.path[0])), e.unknown ? 1 : 0];
  entries.sort((a, b) => {
    const [a0, a1] = rank(a);
    const [b0, b1] = rank(b);
    return a0 === b0 ? a1 - b1 : a0 < b0 ? -1 : 1;
  });

  // Warn and strip unknown keys and invalid fields
  const sanitized = { ...merged };

  for (const entry of entries) {
    if (entry.unknown) {
      warnUnknownKey(entry.unknown);
      stripPath(sanitized, [...entry.unknown.path, entry.unknown.key]);
    } else {
      // Type/value errors
      log.warn(
        `Config: ${entry.path.join(".")} — ${entry.message}. Using default.`,
      );
      // Strip the invalid field by walking the path
      stripPath(sanitized, entry.path);
    }
  }

  // Re-merge with defaults to fill stripped fields
  return deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    sanitized,
  ) as CodingFriendConfig;
}

/** Remove a nested key from an object given a path */
function stripPath(obj: Record<string, unknown>, path: PropertyKey[]): void {
  if (path.length === 0) return;
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = String(path[i]);
    if (current[key] && typeof current[key] === "object") {
      current = current[key] as Record<string, unknown>;
    } else {
      return;
    }
  }
  delete current[String(path[path.length - 1])];
}

/**
 * Strip unsupported fields from a raw config object using the schema.
 * Falls back to the original if there is an unknown key (top level or
 * review.* / showcase.*) or parsing fails, and warns so callers can see the issue.
 */
export function sanitizeRawConfig(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  // z.object strips unknown keys silently, so find them before parsing.
  const unknownKeys = findUnknownKeys(raw).map((u) => u.key);
  if (unknownKeys.length === 0) {
    const result = ConfigSchema.safeParse(raw);
    if (result.success) {
      return result.data as Record<string, unknown>;
    }
  }
  const keyList = unknownKeys.length > 0 ? `: ${unknownKeys.join(", ")}` : "";
  log.warn(
    `sanitizeRawConfig: unrecognized config keys${keyList} — returning raw config`,
  );
  return raw;
}

/**
 * Load merged config: local deep-merges over global, both deep-merge over defaults.
 * Validates the merged result with Zod schema.
 */
export function loadConfig(): CodingFriendConfig {
  const global = readJson<CodingFriendConfig>(globalConfigPath());
  const local = readJson<CodingFriendConfig>(localConfigPath());
  const base = deepMerge(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    (global ?? {}) as Record<string, unknown>,
  );
  const merged = deepMerge(base, (local ?? {}) as Record<string, unknown>);
  return validateConfig(merged);
}

/**
 * `chef.enabled` from the global config only, never the cwd's local config.
 * A missing file or key means enabled.
 */
export function readGlobalChefEnabled(): boolean {
  const global = readJson<CodingFriendConfig>(globalConfigPath());
  return global?.chef?.enabled !== false;
}

/**
 * Resolve the docs directory for learn commands.
 * Priority: explicit arg > config learn.outputDir > default docs/learn
 * @deprecated Use resolveLearnDir() for learn-specific resolution (global-only).
 */
export function resolveDocsDir(explicitPath?: string): string {
  if (explicitPath) {
    return resolvePath(explicitPath);
  }

  const local = readJson<CodingFriendConfig>(localConfigPath());
  if (local?.learn?.outputDir) {
    return resolvePath(local.learn.outputDir);
  }

  const global = readJson<CodingFriendConfig>(globalConfigPath());
  if (global?.learn?.outputDir) {
    return resolvePath(global.learn.outputDir);
  }

  return resolvePath("docs/learn");
}

/**
 * Resolve the learn output directory — global config only.
 * Priority: explicit arg > globalCfg.learn.outputDir > ~/.coding-friend/learn
 */
export function resolveLearnDir(
  globalCfg: CodingFriendConfig | null,
  explicitPath?: string,
): string {
  if (explicitPath) {
    return resolvePath(explicitPath);
  }
  if (globalCfg?.learn?.outputDir) {
    return resolvePath(globalCfg.learn.outputDir);
  }
  return resolvePath("~/.coding-friend/learn");
}

/**
 * Resolve the docs directory for memory commands.
 * Priority: explicit arg > config.docsDir + "/memory" > default "docs/memory"
 */
export function resolveMemoryDir(explicitPath?: string): string {
  if (explicitPath) {
    return resolvePath(explicitPath);
  }

  const config = loadConfig();

  if (config.docsDir) {
    return resolvePath(`${config.docsDir}/memory`);
  }

  return resolvePath("docs/memory");
}

/**
 * Resolve the memory directory for a project given a base directory.
 * Walks from baseDir → main repo root (via git worktree logic) → config docsDir → memory dir.
 * Reads <root>/.coding-friend/config.json directly (not via loadConfig/cwd).
 * Intended for user-scope MCP server wrappers that receive CLAUDE_PROJECT_DIR at runtime.
 */
export function resolveProjectMemoryDir(baseDir: string): string {
  const root = resolveMainRepoRoot(baseDir);

  const configPath = resolve(root, ".coding-friend", "config.json");
  const config = readJson<{ docsDir?: string }>(configPath);
  const docsDir = config?.docsDir ?? "docs";

  if (isAbsolute(docsDir)) {
    return resolve(docsDir, "memory");
  }

  return resolve(root, docsDir, "memory");
}
