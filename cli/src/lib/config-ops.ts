import { existsSync, readFileSync } from "fs";
import { z } from "zod";
import { ConfigSchema, deepMerge, findUnknownKeys } from "./config.js";
import { writeJsonAtomic } from "./json.js";
import { CliError } from "./output.js";
import { globalConfigPath, localConfigPath } from "./paths.js";
import { DEFAULT_CONFIG } from "../types.js";

export type ConfigScope = "global" | "local";
type Obj = Record<string, unknown>;

export interface ConfigKeyView {
  key: string;
  value: unknown;
  source: ConfigScope | "default" | null;
}

export interface ConfigFullView {
  global: Obj;
  local: Obj;
  effective: Obj;
  paths: { global: string; local: string };
}

export interface ConfigScopeView {
  scope: ConfigScope;
  path: string;
  config: Obj;
}

export interface ConfigSetResult {
  scope: ConfigScope;
  path: string;
  key: string;
  value: unknown;
  warnings: string[];
}

function isObj(v: unknown): v is Obj {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function scopePath(scope: ConfigScope): string {
  return scope === "global" ? globalConfigPath() : localConfigPath();
}

/** Turn --global/--local flags into a scope. Both → INVALID_ARGS; neither → undefined. */
export function scopeFromFlags(opts: {
  global?: boolean;
  local?: boolean;
}): ConfigScope | undefined {
  if (opts.global && opts.local) {
    throw new CliError("INVALID_ARGS", "Pass only one of --global or --local");
  }
  if (opts.global) return "global";
  if (opts.local) return "local";
  return undefined;
}

/** Read a raw config file: missing → {}, unparseable or non-object → INVALID_VALUE. */
function readRaw(path: string): Obj {
  if (!existsSync(path)) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    throw new CliError("INVALID_VALUE", `${path} is not valid JSON`);
  }
  if (!isObj(parsed)) {
    throw new CliError("INVALID_VALUE", `${path} is not a JSON object`);
  }
  return parsed;
}

const FORBIDDEN_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

function splitKey(key: string): string[] {
  const parts = key.split(".");
  if (!key || parts.some((p) => p === "" || FORBIDDEN_SEGMENTS.has(p))) {
    throw new CliError("INVALID_ARGS", `Invalid config key '${key}'`);
  }
  return parts;
}

function lookup(obj: Obj, parts: string[]): { found: boolean; value: unknown } {
  let cur: unknown = obj;
  for (const p of parts) {
    if (!isObj(cur) || !Object.hasOwn(cur, p))
      return { found: false, value: undefined };
    cur = cur[p];
  }
  return { found: true, value: cur };
}

export function getConfigView(): ConfigFullView;
export function getConfigView(
  key: string | undefined,
  scope?: ConfigScope,
): ConfigFullView | ConfigKeyView | ConfigScopeView;
export function getConfigView(
  key?: string,
  scope?: ConfigScope,
): ConfigFullView | ConfigKeyView | ConfigScopeView {
  if (scope && !key) {
    const path = scopePath(scope);
    return { scope, path, config: readRaw(path) };
  }

  const paths = { global: globalConfigPath(), local: localConfigPath() };
  const global = readRaw(paths.global);
  const local = readRaw(paths.local);

  if (!key) {
    const effective = deepMerge(
      deepMerge(DEFAULT_CONFIG as unknown as Obj, global),
      local,
    );
    return { global, local, effective, paths };
  }

  const parts = splitKey(key);
  const sources: [ConfigKeyView["source"], Obj][] = scope
    ? [[scope, scope === "global" ? global : local]]
    : [
        ["local", local],
        ["global", global],
        ["default", DEFAULT_CONFIG as unknown as Obj],
      ];
  for (const [source, obj] of sources) {
    const hit = lookup(obj, parts);
    if (hit.found) return { key, value: hit.value, source };
  }
  return { key, value: null, source: null };
}

function parseValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function setPath(obj: Obj, parts: string[], value: unknown): void {
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    if (!Object.hasOwn(cur, p) || !isObj(cur[p])) {
      if (value === null) return;
      cur[p] = {};
    }
    cur = cur[p] as Obj;
  }
  const leaf = parts[parts.length - 1];
  if (value === null) delete cur[leaf];
  else cur[leaf] = value;
}

function isPrefix(a: PropertyKey[], b: PropertyKey[]): boolean {
  return a.length <= b.length && a.every((p, i) => String(p) === String(b[i]));
}

/** First unknown segment of `parts` against the zod object schemas, if any. */
function unknownSegment(parts: string[]): string | undefined {
  let schema: z.ZodType = ConfigSchema;
  for (let i = 0; i < parts.length; i++) {
    while (schema instanceof z.ZodOptional)
      schema = schema.unwrap() as z.ZodType;
    if (!(schema instanceof z.ZodObject)) return undefined;
    const shape = schema.shape as Record<string, z.ZodType>;
    if (!Object.hasOwn(shape, parts[i])) return parts.slice(0, i + 1).join(".");
    schema = shape[parts[i]];
  }
  return undefined;
}

/** Validate the changed path of a candidate config against the known schema. */
function validateChange(candidate: Obj, parts: string[]): void {
  const known = structuredClone(candidate);
  for (const u of findUnknownKeys(known)) {
    const parent = u.path.length ? (known[u.path[0]] as Obj) : known;
    delete parent[u.key];
  }
  const result = ConfigSchema.safeParse(known);
  if (result.success) return;
  const issue = result.error.issues.find(
    (i) => isPrefix(parts, i.path) || isPrefix(i.path, parts),
  );
  if (issue) {
    const at = issue.path.length ? issue.path.join(".") : parts.join(".");
    throw new CliError(
      "INVALID_VALUE",
      `Invalid value for '${at}': ${issue.message}`,
    );
  }
}

/**
 * Set (or with value `null`, delete) a dotted key in one config file.
 * Known keys are validated; unknown keys are written with a warning.
 */
export function setConfigValue(
  scope: ConfigScope | undefined,
  key: string,
  raw: string,
): ConfigSetResult {
  if (!scope) {
    throw new CliError(
      "INVALID_ARGS",
      "cf config set needs --global or --local",
    );
  }
  const parts = splitKey(key);
  const value = parseValue(raw);
  const path = scopePath(scope);
  const candidate = structuredClone(readRaw(path));
  setPath(candidate, parts, value);

  const warnings: string[] = [];
  if (value !== null) {
    validateChange(candidate, parts);
    const name = unknownSegment(parts);
    if (name) warnings.push(`Unknown config key '${name}' — written anyway`);
  }

  writeJsonAtomic(path, candidate);
  return { scope, path, key, value, warnings };
}
