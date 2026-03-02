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
 * Merge strategy:
 *   1. Defaults are always loaded first
 *   2. User patterns from .coding-friend/ignore are added on top
 *   3. Negation patterns (!pattern) remove matching defaults
 *   4. Empty or missing ignore file = only defaults apply
 *
 * Integration contract:
 *   stdin  – JSON with tool_input, tool_name
 *   stdout – JSON with hookSpecificOutput on block, {} on allow
 *   Exit 0 = allow, Exit 2 = block
 *
 * Configuration:
 *   "scoutBlock": false in .coding-friend/config.json disables the hook entirely.
 *   Fails open on any parse or unexpected error.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Default patterns — always blocked unless negated by user
// ---------------------------------------------------------------------------
const DEFAULT_PATTERNS = [
  'node_modules',
  '.pnpm',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'out',
  '.output',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  'vendor',
  'target',
  '.git',
  'coverage',
  '.nyc_output',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.webpack',
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
  if (!p || typeof p !== 'string') return '';
  let norm = p.replace(/\\/g, '/');
  if (norm.startsWith('./')) norm = norm.slice(2);
  if (norm.startsWith('/')) norm = norm.slice(1);
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

  for (let line of content.split('\n')) {
    // strip inline comments
    const commentIdx = line.indexOf('#');
    if (commentIdx !== -1) line = line.slice(0, commentIdx);
    line = line.trim();
    if (!line) continue;

    if (line.startsWith('!')) {
      let pat = line.slice(1).trim();
      pat = pat.replace(/\/+$/, ''); // strip trailing /
      if (pat) negations.push(pat);
    } else {
      let pat = line.replace(/\/+$/, ''); // strip trailing /
      if (pat) blocks.push(pat);
    }
  }
  return { blocks, negations };
}

/**
 * Build effective pattern list: defaults + user blocks − negations.
 */
function buildEffectivePatterns(userBlocks, userNegations) {
  // Start with defaults, remove any that are negated
  const negSet = new Set(userNegations);
  const effective = DEFAULT_PATTERNS.filter((p) => !negSet.has(p));
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
  if (normPath.startsWith(pattern + '/')) return true;
  // Contains /pattern/ as segment
  if (normPath.includes('/' + pattern + '/')) return true;
  // Ends with /pattern
  if (normPath.endsWith('/' + pattern)) return true;
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
 * Extract file paths from tool_input JSON.
 * Looks at: file_path, path, pattern
 */
function extractPaths(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return [];
  const paths = [];
  if (toolInput.file_path) paths.push(toolInput.file_path);
  if (toolInput.path) paths.push(toolInput.path);
  if (toolInput.pattern) paths.push(toolInput.pattern);
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
    // Check if disabled via config
    const configPath = '.coding-friend/config.json';
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.scoutBlock === false) {
          process.stdout.write('{}');
          process.exit(0);
        }
      } catch {
        // Malformed config — ignore, continue with defaults
      }
    }

    // Load user ignore file
    let userContent = '';
    const pluginRoot =
      process.env.CLAUDE_PLUGIN_ROOT ||
      path.resolve(path.dirname(__filename), '..');
    const localIgnore = '.coding-friend/ignore';
    const pluginIgnore = path.join(pluginRoot, '.coding-friend/ignore');

    if (fs.existsSync(localIgnore)) {
      userContent = fs.readFileSync(localIgnore, 'utf8');
    } else if (fs.existsSync(pluginIgnore)) {
      userContent = fs.readFileSync(pluginIgnore, 'utf8');
    }

    const { blocks, negations } = parseIgnoreFile(userContent);
    const patterns = buildEffectivePatterns(blocks, negations);

    // Read stdin
    let input = '';
    try {
      input = fs.readFileSync(0, 'utf8');
    } catch {
      // No stdin — fail open
      process.stdout.write('{}');
      process.exit(0);
    }

    if (!input.trim()) {
      process.stdout.write('{}');
      process.exit(0);
    }

    let parsed;
    try {
      parsed = JSON.parse(input);
    } catch {
      // Malformed JSON — fail open
      process.stdout.write('{}');
      process.exit(0);
    }

    const toolInput = parsed.tool_input;
    if (!toolInput || typeof toolInput !== 'object') {
      process.stdout.write('{}');
      process.exit(0);
    }

    const paths = extractPaths(toolInput);
    for (const p of paths) {
      const matchedPattern = isBlocked(p, patterns);
      if (matchedPattern) {
        const result = {
          hookSpecificOutput: {
            decision: 'block',
            reason: `Access to '${p}' blocked by ignore pattern: ${matchedPattern}`,
          },
        };
        process.stdout.write(JSON.stringify(result, null, 2));
        process.exit(2);
      }
    }

    // Allow
    process.stdout.write('{}');
    process.exit(0);
  } catch {
    // Unexpected error — fail open
    process.stdout.write('{}');
    process.exit(0);
  }
}
