import { z } from "zod";
import { readJson } from "./json.js";
import { localConfigPath, globalConfigPath, resolvePath } from "./paths.js";
import { CodingFriendConfig, DEFAULT_CONFIG } from "../types.js";
import { log } from "./log.js";

/**
 * Deep merge two plain objects. Local values override global at every nesting
 * level, but sibling keys from global are preserved (not dropped).
 */
function deepMerge<T extends Record<string, unknown>>(base: T, override: T): T {
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

const LearnCategorySchema = z.object({
  name: z.string(),
  description: z.string(),
});

const LearnConfigSchema = z.object({
  language: z.string().optional(),
  outputDir: z.string().optional(),
  categories: z.array(LearnCategorySchema).optional(),
  autoCommit: z.boolean().optional(),
  readmeIndex: z.union([z.boolean(), z.literal("per-category")]).optional(),
});

const StatuslineComponentSchema = z.enum([
  "version",
  "folder",
  "model",
  "branch",
  "account",
  "context",
  "rate_limit",
  "task_agent",
]);

const StatuslineConfigSchema = z.object({
  components: z.array(StatuslineComponentSchema).optional(),
  accountAliases: z.record(z.string(), z.string()).optional(),
});

const MemoryConfigSchema = z.object({
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

const ConfigSchema = z.strictObject({
  language: z.string().optional(),
  docsDir: z.string().optional(),
  learn: LearnConfigSchema.optional(),
  statusline: StatuslineConfigSchema.optional(),
  memory: MemoryConfigSchema.optional(),
  autoApprove: z.boolean().optional(),
  autoApproveIgnore: z.array(z.string()).optional(),
  autoApproveAllowExtra: z.array(z.string()).optional(),
});

/** Known config keys for typo suggestions */
const KNOWN_KEYS = [
  "language",
  "docsDir",
  "learn",
  "statusline",
  "memory",
  "autoApprove",
  "autoApproveIgnore",
  "autoApproveAllowExtra",
];

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

/**
 * Validate merged config with Zod. Warns on invalid values and unknown keys.
 * Returns sanitized config with invalid fields stripped.
 */
function validateConfig(merged: Record<string, unknown>): CodingFriendConfig {
  const result = ConfigSchema.safeParse(merged);
  if (result.success) return result.data as CodingFriendConfig;

  // Process errors: warn and strip invalid fields
  const sanitized = { ...merged };

  for (const issue of result.error.issues) {
    const pathStr = issue.path.join(".");

    if (issue.code === "unrecognized_keys") {
      // Unknown keys — may be at top level or nested inside sub-objects
      const keys = (issue as { keys: string[] }).keys ?? [];
      for (const key of keys) {
        const isNested = issue.path.length > 0;
        const fullKey = isNested ? `${issue.path.join(".")}.${key}` : key;
        const suggestion = isNested ? null : suggestKey(key);
        const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
        log.warn(`Unknown config key '${fullKey}'.${hint}`);
        stripPath(sanitized, [...issue.path, key]);
      }
    } else {
      // Type/value errors
      log.warn(`Config: ${pathStr} — ${issue.message}. Using default.`);
      // Strip the invalid field by walking the path
      stripPath(sanitized, issue.path);
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
 * Falls back to the original if parsing fails (e.g. unknown top-level key),
 * and warns so callers can see the issue.
 */
export function sanitizeRawConfig(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const result = ConfigSchema.safeParse(raw);
  if (result.success) {
    return result.data as Record<string, unknown>;
  }
  // Extract key names from unrecognized_keys issues for a helpful warning
  const unknownKeys: string[] = [];
  for (const issue of result.error.issues) {
    if (issue.code === "unrecognized_keys") {
      const keys = (issue as { keys: string[] }).keys ?? [];
      unknownKeys.push(...keys);
    }
  }
  const keyList = unknownKeys.length > 0 ? `: ${unknownKeys.join(", ")}` : "";
  log.warn(`sanitizeRawConfig: unrecognized config keys${keyList} — returning raw config`);
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
 * Resolve the docs directory for learn commands.
 * Priority: explicit arg > config learn.outputDir > default docs/learn
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
