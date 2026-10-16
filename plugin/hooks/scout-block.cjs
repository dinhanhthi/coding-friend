#!/usr/bin/env node
/**
 * PreToolUse hook: Block access to directories matching ignore patterns.
 *
 * Default patterns (always active):
 *   node_modules, .pnpm, dist, build, .next, .nuxt, .svelte-kit,
 *   out, .output, __pycache__, .venv, venv, .tox,
 *   vendor, target, .git, coverage, .nyc_output,
 *   .turbo, .cache, .parcel-cache, .webpack
 *
 * Merge strategy (layers applied in order):
 *   1. Defaults are always loaded first
 *   2. Global ~/.coding-friend/ignore
 *   3. Local .coding-friend/ignore (else the plugin-root fallback)
 *   Each layer's negations (!pattern) remove matching patterns from the
 *   accumulated set, then its block patterns are added on top — so local
 *   overrides global. Empty or missing ignore files = only defaults apply.
 *
 * Integration contract:
 *   stdin  – JSON with tool_input, tool_name
 *   stdout – JSON with hookSpecificOutput on block, {} on allow
 *   Exit 0 = allow, Exit 2 = block
 *
 * Configuration:
 *   "scoutBlock": false in ~/.coding-friend/config.json (global) or
 *   .coding-friend/config.json (local, overrides global) disables the hook.
 *   Fails open on any parse or unexpected error.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

// ---------------------------------------------------------------------------
// Default patterns — always blocked unless negated by user
// ---------------------------------------------------------------------------
const DEFAULT_PATTERNS = [
  "node_modules",
  ".pnpm",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "out",
  ".output",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  "vendor",
  "target",
  ".git",
  "coverage",
  ".nyc_output",
  ".turbo",
  ".cache",
  ".parcel-cache",
  ".webpack",
];

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Normalize a file path for matching:
 * - backslash → forward slash
 * - strip leading ./
 * - strip leading /
 */
function normalizePath(p) {
  if (!p || typeof p !== "string") return "";
  let norm = p.replace(/\\/g, "/");
  if (norm.startsWith("./")) norm = norm.slice(2);
  if (norm.startsWith("/")) norm = norm.slice(1);
  return norm;
}

/**
 * Parse an ignore file into { blocks: string[], negations: string[] }.
 * Skips comments (#) and empty lines. Strips trailing /.
 */
function parseIgnoreFile(content) {
  const blocks = [];
  const negations = [];
  if (!content) return { blocks, negations };

  for (let line of content.split("\n")) {
    // strip inline comments
    const commentIdx = line.indexOf("#");
    if (commentIdx !== -1) line = line.slice(0, commentIdx);
    line = line.trim();
    if (!line) continue;

    if (line.startsWith("!")) {
      let pat = line.slice(1).trim();
      pat = pat.replace(/\/+$/, ""); // strip trailing /
      if (pat) negations.push(pat);
    } else {
      let pat = line.replace(/\/+$/, ""); // strip trailing /
      if (pat) blocks.push(pat);
    }
  }
  return { blocks, negations };
}

/**
 * Build effective pattern list: base (defaults) − negations + user blocks.
 */
function buildEffectivePatterns(
  userBlocks,
  userNegations,
  base = DEFAULT_PATTERNS,
) {
  // Start with base, remove any that are negated
  const negSet = new Set(userNegations);
  const effective = base.filter((p) => !negSet.has(p));
  // Append user block patterns
  for (const p of userBlocks) {
    if (!effective.includes(p)) effective.push(p);
  }
  return effective;
}

/**
 * Check if a normalized path matches a simple directory pattern.
 * A pattern like "node_modules" matches:
 *   - node_modules/...  (starts with)
 *   - .../node_modules/... (contains as segment)
 *   - .../node_modules (ends with)
 *   - exact match
 */
function pathMatchesPattern(normPath, pattern) {
  if (!normPath || !pattern) return false;
  // Exact match
  if (normPath === pattern) return true;
  // Starts with pattern/
  if (normPath.startsWith(pattern + "/")) return true;
  // Contains /pattern/ as segment
  if (normPath.includes("/" + pattern + "/")) return true;
  // Ends with /pattern
  if (normPath.endsWith("/" + pattern)) return true;
  return false;
}

/**
 * Check if a path is blocked by any of the effective patterns.
 * Returns the matching pattern or null.
 */
function isBlocked(filePath, patterns) {
  const norm = normalizePath(filePath);
  if (!norm) return null;
  for (const pat of patterns) {
    if (pathMatchesPattern(norm, pat)) return pat;
  }
  return null;
}

/**
 * Read `scoutBlock` from a config.json. Missing or malformed file → undefined.
 */
function readScoutBlockSetting(configPath) {
  if (!fs.existsSync(configPath)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")).scoutBlock;
  } catch {
    // Malformed config — ignore, continue with defaults
    return undefined;
  }
}

/**
 * Hook is disabled when the effective scoutBlock is false (local overrides
 * global when defined).
 */
function isScoutBlockDisabled(globalConfigPath, localConfigPath) {
  const local = readScoutBlockSetting(localConfigPath);
  const effective =
    local !== undefined ? local : readScoutBlockSetting(globalConfigPath);
  return effective === false;
}

// Missing or unreadable (directory, no permission) → "" so defaults and the
// other layer still apply instead of the whole hook failing open.
function readIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

/**
 * Layer ignore files: defaults → global → local (else plugin-root fallback).
 */
function loadLayeredPatterns(globalIgnore, localIgnore, pluginIgnore) {
  let patterns = DEFAULT_PATTERNS;
  const localContent = fs.existsSync(localIgnore)
    ? readIfExists(localIgnore)
    : readIfExists(pluginIgnore);
  for (const content of [readIfExists(globalIgnore), localContent]) {
    const { blocks, negations } = parseIgnoreFile(content);
    patterns = buildEffectivePatterns(blocks, negations, patterns);
  }
  return patterns;
}

// Path and pattern may come from untrusted input; keep the reason one line.
function sanitizeForReason(s) {
  return String(s).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ");
}

/**
 * Block reason addressed to the human. Within one ignore layer, `!pattern`
 * only removes patterns from earlier layers, so a custom pattern is unblocked
 * by deleting its line, a default by adding `!pattern` (and deleting any
 * `pattern` line in that same file, since blocks are applied after negations).
 */
function blockReason(p, pattern) {
  const safeP = sanitizeForReason(p);
  const safePattern = sanitizeForReason(pattern);
  const how = DEFAULT_PATTERNS.includes(pattern)
    ? `adding "!${safePattern}" to .coding-friend/ignore (project) or ~/.coding-friend/ignore (global), and removing any "${safePattern}" line from that file`
    : `removing "${safePattern}" from the ignore file that lists it (.coding-friend/ignore or ~/.coding-friend/ignore)`;
  return `Access to '${safeP}' blocked by ignore pattern: ${safePattern}. Do not edit ignore files yourself; ask the user, who can allow it by ${how}.`;
}

// Codex edits files through `apply_patch`; its targets live inside the patch
// envelope carried in tool_input.command. Tolerate leading whitespace and
// casing so blocking catches every header Codex would honor.
const APPLY_PATCH_HEADER_PATTERN =
  /^[ \t]*\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gim;

function extractApplyPatchPaths(command) {
  if (typeof command !== "string") return [];
  const paths = [];
  for (const match of command.matchAll(APPLY_PATCH_HEADER_PATTERN)) {
    paths.push(match[1].trim());
  }
  return paths;
}

/**
 * Extract file paths from tool_input JSON.
 * Looks at: file_path, path, pattern, and apply_patch envelopes in command
 */
function extractPaths(toolInput) {
  if (!toolInput || typeof toolInput !== "object") return [];
  const paths = [];
  if (toolInput.file_path) paths.push(toolInput.file_path);
  if (toolInput.path) paths.push(toolInput.path);
  if (toolInput.pattern) paths.push(toolInput.pattern);
  paths.push(...extractApplyPatchPaths(toolInput.command));
  return paths;
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------
module.exports = {
  DEFAULT_PATTERNS,
  normalizePath,
  parseIgnoreFile,
  buildEffectivePatterns,
  pathMatchesPattern,
  isBlocked,
  isScoutBlockDisabled,
  loadLayeredPatterns,
  blockReason,
  extractApplyPatchPaths,
  extractPaths,
};

// ---------------------------------------------------------------------------
// Main — only runs when executed directly (not when required for tests)
// ---------------------------------------------------------------------------
if (require.main === module) {
  main();
}

function main() {
  try {
    const globalDir = path.join(os.homedir(), ".coding-friend");

    // Check if disabled via config (local overrides global)
    if (
      isScoutBlockDisabled(
        path.join(globalDir, "config.json"),
        ".coding-friend/config.json",
      )
    ) {
      process.stdout.write("{}");
      process.exit(0);
    }

    // Load ignore layers: defaults → global → local (else plugin root)
    const pluginRoot =
      process.env.CLAUDE_PLUGIN_ROOT ||
      path.resolve(path.dirname(__filename), "..");
    const patterns = loadLayeredPatterns(
      path.join(globalDir, "ignore"),
      ".coding-friend/ignore",
      path.join(pluginRoot, ".coding-friend/ignore"),
    );

    // Read stdin
    let input = "";
    try {
      input = fs.readFileSync(0, "utf8");
    } catch {
      // No stdin — fail open
      process.stdout.write("{}");
      process.exit(0);
    }

    if (!input.trim()) {
      process.stdout.write("{}");
      process.exit(0);
    }

    let parsed;
    try {
      parsed = JSON.parse(input);
    } catch {
      // Malformed JSON — fail open
      process.stdout.write("{}");
      process.exit(0);
    }

    const toolInput = parsed.tool_input;
    if (!toolInput || typeof toolInput !== "object") {
      process.stdout.write("{}");
      process.exit(0);
    }

    const paths = extractPaths(toolInput);
    for (const p of paths) {
      const matchedPattern = isBlocked(p, patterns);
      if (matchedPattern) {
        const result = {
          hookSpecificOutput: {
            decision: "block",
            reason: blockReason(p, matchedPattern),
          },
        };
        process.stdout.write(JSON.stringify(result, null, 2));
        process.exit(2);
      }
    }

    // Allow
    process.stdout.write("{}");
    process.exit(0);
  } catch {
    // Unexpected error — fail open
    process.stdout.write("{}");
    process.exit(0);
  }
}
