#!/usr/bin/env node
/**
 * Shared deterministic classifier for the Coding Friend auto-approve adapters:
 * auto-approve.codex.cjs (Codex), auto-approve.agy.cjs (Antigravity) and
 * auto-approve.devin.cjs (Devin). Not registered as a hook itself — Claude
 * Code and omp rely on their native auto / yolo modes instead.
 *
 * Rule-based classification only (no LLM):
 *   - pattern-based allow/deny/ask for known tools/commands
 *   - Write/Edit allowed when the file is inside the project dir
 *   - everything else is "unknown"; each adapter defers it to the host's
 *     native approval flow
 *
 * Each adapter reads the `autoApprove*` config keys and speaks its host's
 * hook contract; this module stays pure.
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Rule-based classification
// ---------------------------------------------------------------------------

/** Tools that are always safe */
const ALWAYS_ALLOW_TOOLS = new Set([
  "Read",
  "Glob",
  "Grep",
  "TodoWrite",
  "Agent",
  // Claude Code built-in tools — safe, no side effects
  "Skill",
  "ToolSearch",
  "TaskCreate",
  "TaskUpdate",
  "TaskGet",
  "TaskList",
  "TaskOutput",
  "TaskStop",
  "SendMessage",
  "EnterPlanMode",
  "ExitPlanMode",
  "ListMcpResourcesTool",
  "ReadMcpResourceTool",
  "AskUserQuestion",
  // Coding Friend memory MCP tools — internal AI memory management
  "mcp__coding-friend-memory__memory_search",
  "mcp__coding-friend-memory__memory_retrieve",
  "mcp__coding-friend-memory__memory_list",
  "mcp__coding-friend-memory__memory_store",
  "mcp__coding-friend-memory__memory_update",
  "mcp__coding-friend-memory__memory_delete",
  // Context7 MCP tools — read-only documentation queries
  "mcp__context7__resolve-library-id",
  "mcp__context7__query-docs",
]);

/**
 * Check if a file path resolves to within the project directory.
 * Uses realpathSync for existing paths (follows symlinks) and path.resolve
 * for new files (Write creates files that don't exist yet).
 * @param {string} filePath
 * @param {string} [projectDir] — project root (defaults to process.cwd())
 * @returns {boolean}
 */
function isInProjectDir(filePath, projectDir) {
  if (!filePath || typeof filePath !== "string") return false;
  const baseDir = projectDir || process.cwd();
  // Canonicalize project dir — handles symlinked project directories
  let canonicalRoot;
  try {
    canonicalRoot = fs.realpathSync(baseDir);
  } catch {
    canonicalRoot = baseDir;
  }
  let resolved;
  try {
    // For existing files/symlinks, resolve to canonical path (follows symlinks)
    resolved = fs.realpathSync(path.resolve(canonicalRoot, filePath));
  } catch {
    // File doesn't exist yet (Write creates new files) — use path.resolve only
    resolved = path.resolve(canonicalRoot, filePath);
  }
  return (
    resolved.startsWith(canonicalRoot + path.sep) || resolved === canonicalRoot
  );
}

/**
 * Read-only Bash commands that are safe to auto-approve.
 * Each entry is matched against the start of the command (after trimming).
 * Only simple commands qualify — compound commands (pipes, chains, redirects)
 * are sent to "unknown" (deferred to the host's native approval).
 */
const BASH_ALLOW_PREFIXES = [
  // File inspection — read-only
  "ls",
  "cat",
  "head",
  "tail",
  "grep",
  "rg",
  "find",
  "stat",
  "diff",
  "wc",
  "file",
  "tree",
  // Text processing — read-only
  "sort",
  "uniq",
  "cut",
  "tr",
  "jq",
  // xargs — safe when subcommand is read-only (checked in postMatchSafety)
  "xargs",
  // System info — read-only
  "which",
  "echo",
  "pwd",
  "date",
  "uname",
  "whoami",
  "hostname",
  "id",
  "type",
  "df",
  "du",
  "ps",
  "env",
  "printenv",
  // Path utilities — read-only
  "realpath",
  "basename",
  "dirname",
  "readlink",
  // Directory navigation — safe, no-op side effects
  "cd",
  // Directory creation — safe, idempotent
  "mkdir",
  // Git — read-only
  "git status",
  "git log",
  "git diff",
  "git branch",
  "git show",
  "git remote",
  "git tag",
  "git blame",
  "git rev-parse",
  "git ls-files",
  "git stash list",
  "git stash show",
  "git shortlog",
  "git worktree list",
  "git config --list",
  "git config -l",
  // Git — low-risk local writes (easily reversible)
  "git add",
  "git commit",
  "git stash push",
  "git stash save",
  // Node.js / npm — dev workflow (read-only / non-executing only)
  // NOTE: test runners are handled separately by TEST_RUNNER_PATTERN (always
  // allowed). Non-test script runners (npm run <script>, npx tsx/eslint) still
  // execute arbitrary code from package.json scripts or plugins, so they stay
  // in BASH_ASK_PREFIXES.
  "npx tsc --noEmit",
  "npx prettier",
  // pnpm — pure formatter only (prettier). Other non-test pnpm subcommands run
  // package scripts/plugins and stay in BASH_ASK_PREFIXES. Allow-list match runs
  // before the "pnpm" ask check, so this exception is honored.
  "pnpm prettier",
  "pnpm exec prettier",
  // Version checks — read-only
  "node --version",
  "node -v",
  "npm --version",
  "npm -v",
  "npm list",
  "npm ls",
  "python --version",
  "python3 --version",
  "rustc --version",
  "rustc -V",
  "rustup show",
  "rustup --version",
  "go version",
  // Cargo — read-only subcommands only. Build/run/check execute arbitrary code
  // via build.rs scripts and proc-macros, so those go to ASK. `cargo test` is
  // covered by TEST_RUNNER_PATTERN.
  "cargo --version",
  "cargo -V",
  "cargo version",
  "cargo help",
  "cargo tree",
  "cargo metadata",
  "cargo pkgid",
  "cargo locate-project",
  "cargo search",
  // Cargo fmt — pure formatter (rustfmt), no build.rs or proc-macro execution
  "cargo fmt",
];

/** Safe xargs subcommands — read-only operations only. Checked in postMatchSafety. */
const XARGS_SAFE_SUBCMDS = new Set([
  "grep",
  "rg",
  "wc",
  "head",
  "tail",
  "ls",
  "cat",
  "stat",
  "diff",
  "echo",
  "sort",
  "uniq",
  "cut",
  "tr",
  "jq",
  "file",
]);

/**
 * Detect shell operators that make a command compound/unsafe.
 * If any of these appear in the command, it cannot be auto-approved
 * by simple prefix matching — defer or ask instead.
 */
const SHELL_OPERATOR_PATTERN = /[\n|;&<]|>>?|`|\$\(/;

/**
 * Detect unsafe compound operators EXCLUDING pipe.
 * Checked AFTER stripping safe stderr redirects (2>&1).
 * Semicolons, &&, ||, backticks, $(), newlines, input redirect (<),
 * and any output redirect (>).
 *
 * NOTE: isSafeCompoundCommand no longer uses this pattern directly — it uses
 * TRULY_UNSAFE_OPERATORS (which excludes && and ||) and handles && and || via
 * segment-wise checking. This constant is exported for test coverage only.
 */
const UNSAFE_COMPOUND_PATTERN = /[;\n`>]|&&|\$\(|</;

/**
 * Detect operators that are truly unsafe even when segments are individually safe.
 * Does NOT include && or || — both are handled by segment-wise checking in
 *   isSafeCompoundCommand: if every clause separated by && or || is on the
 *   allow list, the whole chain is safe.
 * Does NOT include ; — semicolons are split and each clause is checked individually
 *   (same approach as && and ||), so "grep foo | head; echo done" is safe when all safe.
 * Excludes pipe (|) which is handled by isSafeCompoundCommand segment logic.
 * Single & (background operator, e.g. "cmd & evil") IS blocked — negative lookahead
 * (?<!&)&(?!&) matches lone & but not && or the & in 2>&1 (the latter is stripped
 * before this check runs, so only true background operators reach this pattern).
 */
const TRULY_UNSAFE_OPERATORS = /[\n`>]|(?<!&)&(?!&)|\$\(|</;

/**
 * Strip stderr-to-stdout redirects (e.g., "2>&1") from a command string.
 * These are safe and should not prevent auto-approval.
 * Only matches standalone "2>&1" tokens — not substrings like "sort2>&1" or "12>&1".
 */
function stripStderrRedirect(str) {
  return str.replace(/(?<=\s|^)2>&1(?=\s|$)/g, "").trim();
}

/**
 * Extract the subcommand from an xargs call, skipping flags and their arguments.
 * Handles common patterns: `xargs grep`, `xargs -n1 grep`, `xargs -0 grep`,
 * `xargs -n 1 grep`, `xargs -I{} grep {}`.
 * Returns null if no subcommand can be determined.
 * @param {string} cmd — the full xargs command (e.g. "xargs grep -l foo")
 * @returns {string|null}
 */
function extractXargsSubcmd(cmd) {
  const tokens = cmd
    .replace(/^xargs\s+/, "")
    .trim()
    .split(/\s+/);
  // Flags that take a SEPARATE next token as their argument (single-char form only)
  const flagsWithSeparateArg = new Set([
    "n",
    "L",
    "P",
    "s",
    "a",
    "d",
    "E",
    "I",
  ]);
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === "--") {
      return tokens[i + 1] || null;
    }
    if (!tok.startsWith("-")) {
      return tok; // first non-flag token is the subcommand
    }
    if (tok.startsWith("--")) {
      i++;
      continue;
    }
    // Short flag(s): -0, -r, -n, -n1, -I{}, -I PLACEHOLDER, etc.
    i++;
    const flagChars = tok.slice(1);
    // If exactly one flag char that requires a separate arg AND no arg embedded in token
    if (flagChars.length === 1 && flagsWithSeparateArg.has(flagChars)) {
      // Argument is the next token — skip it
      if (i < tokens.length && !tokens[i].startsWith("-")) i++;
    }
  }
  return null;
}

/**
 * Post-match safety check for allowed prefixes that have dangerous sub-forms.
 * Returns "allow" if safe, or a non-allow decision if the command is risky.
 * Used by both simple and compound command paths to keep behavior consistent.
 * @param {string} cmd — the command (or pipe segment) to check
 * @param {string} prefix — the matched allow prefix
 * @returns {"allow"|"unknown"|"ask"}
 */
function postMatchSafety(cmd, prefix) {
  if (prefix === "find" && cmd.includes("-delete")) return "unknown";
  if (prefix === "git commit" && cmd.includes("--amend")) return "ask";
  if (prefix === "xargs") {
    const subcmd = extractXargsSubcmd(cmd);
    if (!subcmd || !XARGS_SAFE_SUBCMDS.has(subcmd)) return "ask";
    return "allow";
  }
  return "allow";
}

/**
 * Replace quoted content in a shell command string with spaces, preserving
 * string length so that character positions remain valid.
 *
 * Rules (Bash quoting semantics):
 *   - Double-quoted regions: content replaced with spaces. Backslash-escaped
 *     chars inside ("\"" etc.) are consumed as-is (both chars → two spaces).
 *   - Single-quoted regions: content replaced with spaces. No escapes inside
 *     single quotes — even \' does not close them.
 *   - Backslash-escaped chars outside quotes: both the backslash and the next
 *     char are preserved as-is (they are not operators).
 *
 * Returns null when the string contains an unclosed quote, so callers can
 * treat it as unsafe (fail-closed). An unclosed quote like
 *   echo "foo | rm -rf /
 * must never be silently sanitized into something that looks safe.
 *
 * @param {string} str
 * @returns {string|null} — sanitized string (same length as input), or null on unmatched quote
 */
function removeQuotedContent(str) {
  const chars = str.split("");
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (ch === '"') {
      // Enter double-quoted region
      chars[i] = " ";
      i++;
      let closed = false;
      while (i < chars.length) {
        if (chars[i] === "\\") {
          // Backslash escape inside double quotes: consume both chars as spaces.
          // The escaped char cannot itself be a live shell operator.
          chars[i] = " ";
          i++;
          if (i < chars.length) {
            chars[i] = " ";
            i++;
          }
        } else if (chars[i] === '"') {
          // Closing double quote
          chars[i] = " ";
          i++;
          closed = true;
          break;
        } else if (chars[i] === "`") {
          // Backtick is NOT sanitized inside double quotes — bash expands it.
          // Keeping ` lets TRULY_UNSAFE_OPERATORS still catch it.
          i++;
        } else if (chars[i] === "$") {
          // $ followed by ( forms $(...) which bash expands inside double quotes.
          // Keep both $ and ( so TRULY_UNSAFE_OPERATORS catches $(.
          // Other uses of $ — e.g. ${VAR} or $VAR — are variable expansions, NOT
          // command substitutions. Bash does NOT re-parse the expanded value as shell
          // syntax: the value becomes a literal word/argument to the command. So
          // ${VAR} cannot inject operators and does not need special handling here.
          // The { after $ is blanked by the default else branch, which is fine.
          i++;
          if (i < chars.length && chars[i] === "(") {
            i++; // keep the ( too — don't blank it
          }
        } else {
          chars[i] = " ";
          i++;
        }
      }
      if (!closed) return null; // unmatched double quote
    } else if (ch === "'") {
      // Enter single-quoted region — no escapes inside
      chars[i] = " ";
      i++;
      let closed = false;
      while (i < chars.length) {
        if (chars[i] === "'") {
          chars[i] = " ";
          i++;
          closed = true;
          break;
        } else {
          chars[i] = " ";
          i++;
        }
      }
      if (!closed) return null; // unmatched single quote
    } else if (ch === "\\") {
      // Backslash escape outside quotes: keep both chars, skip ahead
      i += 2; // skip backslash and the escaped char
    } else {
      i++;
    }
  }
  return chars.join("");
}

/**
 * Split a string on a delimiter, guided by a sanitized version of the same
 * string. Positions of the delimiter in the sanitized string are used to split
 * the original, so quoted content is never mis-split.
 *
 * Both `str` and `sanitized` must have the same length (guaranteed when
 * `sanitized` comes from `removeQuotedContent(str)`).
 *
 * @param {string} str — original string to split
 * @param {string} sanitized — quote-sanitized version (same length)
 * @param {string} delimiter — substring to split on (e.g. "&&")
 * @returns {Array<{orig: string, san: string}>} — pairs of original/sanitized slices
 */
function splitBySanitized(str, sanitized, delimiter) {
  const dLen = delimiter.length;
  const result = [];
  let start = 0;
  let i = 0;
  while (i <= sanitized.length - dLen) {
    if (sanitized.slice(i, i + dLen) === delimiter) {
      result.push({
        orig: str.slice(start, i),
        san: sanitized.slice(start, i),
      });
      start = i + dLen;
      i = start;
    } else {
      i++;
    }
  }
  result.push({
    orig: str.slice(start),
    san: sanitized.slice(start),
  });
  return result;
}

/**
 * Split a string on either "&&" or "||" logical operators, guided by a
 * quote-sanitized version of the same string so that operators inside quoted
 * strings (e.g. grep "foo||bar", grep "a&&b") are not mistaken for shell
 * operators. Both && and || have equal shell precedence, so they are handled
 * identically: if every resulting clause is safe, the whole chain is safe.
 *
 * @param {string} str — original string to split
 * @param {string} sanitized — quote-sanitized version (same length)
 * @returns {Array<{orig: string, san: string}>} — pairs of original/sanitized slices
 */
function splitByLogicalOperators(str, sanitized) {
  const result = [];
  let start = 0;
  let i = 0;
  while (i <= sanitized.length - 2) {
    const chunk = sanitized.slice(i, i + 2);
    if (chunk === "&&" || chunk === "||") {
      result.push({
        orig: str.slice(start, i),
        san: sanitized.slice(start, i),
      });
      start = i + 2;
      i = start;
    } else {
      i++;
    }
  }
  result.push({
    orig: str.slice(start),
    san: sanitized.slice(start),
  });
  return result;
}

/**
 * Check if a compound command is safe by verifying every segment against the
 * allow list. Supports pipe chains, && chains, || chains, and ; chains (where
 * every clause is safe). Other operators — backticks, $(), redirects, single &
 * — are always rejected. 2>&1 is stripped before checking.
 *
 * Splitting order: ; (top-level) → && and || together via splitByLogicalOperators
 * (within each ; clause) → | (within each logical sub-clause). Each leaf segment
 * must either match an allow-list prefix or be an rm command targeting only files
 * within the project directory.
 *
 * Uses a quote-aware tokenizer so that shell metacharacters inside quoted
 * strings (e.g. grep "foo|bar", grep "foo||bar") are not mistaken for operators.
 *
 * @param {string} cmd — the full trimmed command
 * @param {string[]} [allowExtra] — additional allow prefixes from config
 * @param {string} [projectDir] — project root for rm project-scope checks
 * @returns {boolean}
 */
function isSafeCompoundCommand(cmd, allowExtra, projectDir) {
  // Strip safe stderr redirects first
  const stripped = stripStderrRedirect(cmd);

  // Compute quote-sanitized form. Bail out on unmatched quotes (fail-closed).
  const sanitized = removeQuotedContent(stripped);
  if (sanitized === null) return false;

  // Check for truly unsafe operators using the sanitized string so that
  // operators inside quoted content (e.g. grep "=>", grep "foo&&bar") are
  // not falsely detected. Strip >/dev/null and 2>/dev/null first — both
  // discard output and are safe, but their ">" would falsely trigger the check.
  // Security constraints:
  //   - Use [ \t]* (not \s*) so newlines are NOT consumed. \s* would eat the
  //     newline before `>/dev/null` and hide a command separator, letting an
  //     attacker append "echo ok\n>/dev/null sh -c '...'" past the guard.
  //   - Negative lookahead (?![\w.\-/]) anchors "/dev/null" to a path-token
  //     boundary so ">/dev/null.sh", ">/dev/nullxxx", ">/dev/null/../tmp/x"
  //     do NOT match and remain unsafe (would otherwise enable arbitrary
  //     stdout file writes).
  //   - >>/dev/null (append) is rejected by side effect: the regex strips the
  //     second ">" + "/dev/null", the leftover first ">" then trips
  //     TRULY_UNSAFE_OPERATORS. Do not remove that operator from the unsafe
  //     set without explicitly handling append redirects here first.
  const sanitizedForOpCheck = sanitized.replace(
    /[ \t]*2?>[ \t]*\/dev\/null(?![\w.\-/])/g,
    "",
  );
  if (TRULY_UNSAFE_OPERATORS.test(sanitizedForOpCheck)) return false;

  // Effective allow list = hook defaults + user-configured per-project extras.
  const effectiveAllow =
    allowExtra && allowExtra.length > 0
      ? [...BASH_ALLOW_PREFIXES, ...allowExtra]
      : BASH_ALLOW_PREFIXES;

  /**
   * Check if a single pipe-compound or simple segment is safe.
   * Splits on real pipe (not inside quotes, not preceded by backslash).
   * @param {string} orig — original segment text
   * @param {string} san — sanitized version (same length)
   */
  function isPipeSegmentSafe(orig, san) {
    // Split on | using the sanitized string so | inside quoted content is not
    // treated as a pipe. \| (out-of-quote escaped alternation) is re-merged below.
    const pipeParts = splitBySanitized(orig, san, "|");

    // Collect final parts, re-merging any \| that was split in the original
    const finalParts = [];
    let pending = null;
    for (const p of pipeParts) {
      const rawOrig = p.orig.trimEnd(); // trimEnd to check last char before |
      if (pending !== null) {
        // Previous split was a \| — merge back with current
        pending = {
          orig: pending.orig + "|" + p.orig,
          san: pending.san + "|" + p.san,
        };
        // Check if this part also ends with backslash (another \|)
        if (pending.orig.trimEnd().endsWith("\\")) {
          // keep pending
        } else {
          finalParts.push(pending);
          pending = null;
        }
      } else if (rawOrig.endsWith("\\")) {
        // This part ends with \, so the next | is \| — will be re-merged
        pending = p;
      } else {
        finalParts.push(p);
      }
    }
    if (pending !== null) finalParts.push(pending);

    return finalParts.every(({ orig: part }) => {
      const trimmed = part.trim();
      if (!trimmed) return false;
      // Allow rm targeting files entirely within the project directory
      const rmPaths = extractRmPaths(trimmed);
      if (
        rmPaths &&
        rmPaths.length > 0 &&
        rmPaths.every((p) => isInProjectDir(p, projectDir))
      ) {
        return true;
      }
      if (TEST_RUNNER_PATTERN.test(trimmed)) return true;
      for (const prefix of effectiveAllow) {
        if (matchesPrefix(trimmed, prefix)) {
          return postMatchSafety(trimmed, prefix) === "allow";
        }
      }
      return false;
    });
  }

  // Split on ; first — semicolons separate independent commands, each of which
  // must be safe on its own. Uses sanitized string so ; inside quoted content
  // (e.g. grep "foo;bar") is not mistaken for a command separator.
  const semiClauses = splitBySanitized(stripped, sanitized, ";");

  return semiClauses.every(({ orig: semiOrig, san: semiSan }) => {
    const trimmedSemiOrig = semiOrig.trim();
    const trimmedSemiSan = semiSan.trim();
    if (!trimmedSemiOrig) return false;

    // Within each semicolon clause, split on && and || to get chained sub-commands.
    // Both operators have equal shell precedence; every clause must be safe.
    const logicalClauses = splitByLogicalOperators(
      trimmedSemiOrig,
      trimmedSemiSan,
    );

    return logicalClauses.every(({ orig, san }) => {
      const trimmedOrig = orig.trim();
      const trimmedSan = san.trim();
      if (!trimmedOrig) return false;
      return isPipeSegmentSafe(trimmedOrig, trimmedSan);
    });
  });
}

/**
 * Destructive Bash patterns that must be blocked.
 * Each is a regex tested against the full command.
 */
const BASH_DENY_PATTERNS = [
  /\brm\s+(-\w*\s+)*-rf\s+[/~]/, // rm -rf / or ~ or $HOME
  /\brm\s+(-\w*\s+)*-rf\s+\$HOME/,
  /\bgit\s+push\s+(.*\s)?--force(?!-)/, // git push --force (not --force-with-lease)
  /\bgit\s+push\s+(.*\s)?-f\b/, // git push -f (short flag)
  /\bgit\s+reset\s+--hard\b/,
  /\bchmod\s+777\b/,
  /\b(curl|wget)\s+.+\|\s*(sh|bash)\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;?\s*:/, // fork bomb
  />\s*\/dev\/sda/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bsudo\s+rm\b/,
  /\bkill\s+-9\b/, // force kill
  /\bpkill\b/, // process kill
];

/**
 * Test runners — always auto-approved, across every language and framework.
 *
 * These do execute code the repo controls (test files, build scripts), which is
 * the same trust level as the source the agent is already editing. Running the
 * suite is the core verification loop, so prompting every time costs more than
 * it protects. Non-test script runners (`npm run build`, `npx tsx`) and package
 * installs stay in BASH_ASK_PREFIXES.
 *
 * Also honoured per segment inside a pipe or chain (isSafeCompoundCommand), so
 * `npm test 2>&1 | tail -50` and `cd web && pnpm exec playwright test` pass —
 * every other segment still has to be safe on its own.
 *
 * Opt back out with `autoApproveIgnore`.
 */

/** Optional launcher prefixes that delegate to a test binary. */
const TEST_LAUNCHERS = [
  "npx",
  "pnpm\\s+exec",
  "pnpm\\s+dlx",
  "pnpm",
  "yarn\\s+exec",
  "yarn\\s+dlx",
  "yarn",
  "bunx",
  "bun\\s+x",
  "bun",
  "uvx",
  "uv\\s+run",
  "poetry\\s+run",
  "pipenv\\s+run",
  "hatch\\s+run",
  "pdm\\s+run",
  "python3?\\s+-m",
  "bundle\\s+exec",
  "deno\\s+run\\s+(?:-\\S+\\s+)*",
];

/**
 * Local binary directories a test binary may be invoked through — these attach
 * directly to the binary name (`vendor/bin/phpunit`), with no space separator.
 */
const TEST_BIN_DIRS =
  "(?:\\.?/)?(?:vendor/bin|node_modules/\\.bin|\\.?venv/bin|bin)/";

/**
 * Test binaries invoked directly or via a launcher.
 * `playwright`/`cypress` are narrowed to their run subcommands — bare
 * `playwright install` shells out to a package manager (sudo apt-get).
 */
const TEST_BINARIES = [
  "jest",
  "vitest",
  "mocha",
  "ava",
  "tap",
  "karma",
  "jasmine",
  "playwright\\s+test",
  "cypress\\s+run",
  "wdio",
  "testcafe",
  "nightwatch",
  "pytest",
  "py\\.test",
  "tox",
  "nose2",
  "unittest",
  "rspec",
  "minitest",
  "cucumber",
  "phpunit",
  "pest",
  "codecept",
  "ctest",
  "gotestsum",
  "busted",
];

/** Whole commands that are test runs in their own right (no launcher). */
const TEST_COMMANDS = [
  "(?:npm|pnpm|yarn|bun)\\s+(?:test|t)",
  "(?:npm|pnpm|yarn|bun)\\s+run\\s+test\\S*",
  "go\\s+test",
  "cargo\\s+(?:test|nextest)",
  "dotnet\\s+test",
  "mvn\\s+test",
  "\\.?/?gradlew?\\s+test",
  "mix\\s+test",
  "swift\\s+test",
  "flutter\\s+test",
  "dart\\s+test",
  "deno\\s+test",
  "bazel\\s+test",
  "make\\s+test",
  "just\\s+test",
  "rake\\s+test",
  "sbt\\s+test",
  "stack\\s+test",
  "cabal\\s+test",
  "zig\\s+build\\s+test",
  "ninja\\s+test",
  "meson\\s+test",
];

/**
 * Matches a test-runner invocation. Lookahead (not \\b) after the binary name so
 * `jest-codemods` and `pytest-watch` do not match.
 */
const TEST_RUNNER_PATTERN = new RegExp(
  "^(?:" +
    `(?:(?:${TEST_LAUNCHERS.join("|")})\\s+|${TEST_BIN_DIRS})?` +
    `(?:${TEST_BINARIES.join("|")})` +
    "|" +
    `(?:${TEST_COMMANDS.join("|")})` +
    ")(?=\\s|$)",
);

/**
 * Bash commands that need user confirmation (not blocked, but not auto-approved).
 *
 * Build tools, package installs, and generic script runners live here — not the
 * allowlist — because they execute arbitrary code from files that a
 * prompt-injection attacker could tamper with (build.rs scripts, proc-macros,
 * package.json scripts, ESLint plugins). Requiring a prompt at least once gives
 * the user a chance to notice unexpected executions.
 *
 * Test runners are the deliberate exception — see TEST_RUNNER_PATTERN, which is
 * checked first and always allows them.
 *
 * Users who trust their repo and want fewer prompts can add these to their
 * Claude Code `permissions.allow` in `.claude/settings.json` — e.g.
 * `"Bash(npm run build *)"`, `"Bash(cargo build *)"`.
 */
const BASH_ASK_PREFIXES = [
  "git push",
  // npm / npx — execute arbitrary code from scripts or plugins
  "npm run",
  "npm install",
  "npm publish",
  "npx tsx",
  "npx eslint",
  // cargo — every non-read-only subcommand runs build.rs, proc-macros, or
  // test binaries, any of which can execute attacker-controlled code
  "cargo check",
  "cargo build",
  "cargo run",
  "cargo clippy",
  "cargo fix",
  "cargo bench",
  "cargo doc",
  "cargo add",
  "cargo remove",
  "cargo update",
  "cargo install",
  "cargo uninstall",
  "cargo clean",
  "cargo new",
  "cargo init",
  "cargo publish",
  "cargo yank",
  "cargo owner",
  "cargo login",
  // pnpm — executes arbitrary scripts, same risk as npm run
  "pnpm run",
  "pnpm exec",
  "pnpm install",
  "pnpm add",
  "pnpm remove",
  "pnpm publish",
  "pnpm",
  // Networking / containers / remote access
  "docker",
  "curl",
  "wget",
  "ssh",
  "scp",
];

/**
 * Plugin root directory — derived from this script's location.
 * In production: ~/.claude/plugins/cache/coding-friend-marketplace/coding-friend/<version>
 * In development: /path/to/coding-friend/plugin
 */
const PLUGIN_ROOT = path.resolve(__dirname, "..");

/**
 * Matches safe stdout/stderr redirects: `> /tmp/<name>`, `2> /tmp/<name>`, or `> /dev/null`.
 * Filename must be flat (no `/` after `/tmp/`) to prevent subdirectory traversal.
 * Combined with the `..` early-return in isCodingFriendCompound, this is the full redirect guard.
 *
 * Security constraints (mirror isSafeCompoundCommand line 542):
 *   - Use [ \t]* (not \s*) so newlines are NOT consumed.
 *   - Negative lookahead anchors "/dev/null" to a token boundary so
 *     ">/dev/null.sh" stays unsafe. The "/tmp/..." branch is already safe
 *     because [\w.\-]+ is greedy and excludes "/".
 */
const SAFE_REDIRECT_RE =
  /[ \t]*2?>[ \t]*(\/tmp\/[\w.\-]+|\/dev\/null(?![\w.\-/]))/g;

/**
 * Extract the script path from a bash command string (after "bash ").
 * Handles unquoted, double-quoted, and single-quoted paths.
 * @param {string} afterBash — the part after "bash "
 * @returns {string|null}
 */
function extractBashScriptPath(afterBash) {
  const s = afterBash.trimStart();
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1);
    return end > 0 ? s.slice(1, end) : null;
  }
  if (s.startsWith("'")) {
    const end = s.indexOf("'", 1);
    return end > 0 ? s.slice(1, end) : null;
  }
  return s.split(/\s/)[0] || null;
}

/**
 * Known safe `cf` CLI subcommands (coding-friend-cli).
 * Only these are auto-approved — avoids collision with other `cf` binaries
 * (e.g. Cloud Foundry CLI which also uses `cf push`, `cf delete`, etc.).
 */
const CF_SAFE_SUBCOMMANDS = new Set([
  "install",
  "uninstall",
  "disable",
  "enable",
  "init",
  "config",
  "host",
  "mcp",
  "permission",
  "statusline",
  "update",
  "status",
  "session",
  "memory",
  "dev",
]);

/**
 * Check if a Bash command is a coding-friend related command.
 * Only approves:
 *   - `cf <subcommand>` where subcommand is in CF_SAFE_SUBCOMMANDS
 *   - `bash` scripts located under PLUGIN_ROOT that exist on disk
 * Must be a simple command (no shell operators) — caller checks this.
 */
function isCodingFriendBash(trimmed) {
  // cf CLI commands — only known safe subcommands
  if (trimmed.startsWith("cf ") || trimmed.startsWith("cf\t")) {
    const afterCf = trimmed.slice(trimmed.indexOf("f") + 1).trim();
    const subcommand = afterCf.split(/\s/)[0];
    return CF_SAFE_SUBCOMMANDS.has(subcommand);
  }

  // Only allow bash scripts from the plugin's own directory
  if (!(trimmed.startsWith("bash ") || trimmed.startsWith("bash\t")))
    return false;

  const afterBash = trimmed.slice(trimmed.indexOf(" ") + 1);
  const scriptPath = extractBashScriptPath(afterBash);
  if (!scriptPath) return false;

  // Resolve symlinks and verify the file exists on disk (fail-closed)
  try {
    const resolved = fs.realpathSync(scriptPath);
    return resolved.startsWith(PLUGIN_ROOT + path.sep);
  } catch {
    return false;
  }
}

/**
 * Check if a compound Bash command consists only of CF plugin scripts with safe
 * redirects and/or allow-listed follow-up commands.
 *
 * Handles common patterns emitted by cf-review and other skills:
 *   bash "cf-plugin-script.sh" > /tmp/out.txt 2>&1 && wc -l /tmp/out.txt
 *   bash "cf-plugin-script.sh" 2>/tmp/err.txt
 *
 * Security constraints:
 *   - Stdout/stderr redirects only to /tmp/<flat-filename> or /dev/null
 *   - Append redirects (>>) are rejected
 *   - Path traversal (..) is rejected early
 *   - ||, ;, |, $(), ``, \n and < are rejected
 *   - At least one && clause must be a CF script (hasCFScript guard)
 *   - Remaining clauses must be in BASH_ALLOW_PREFIXES
 */
function isCodingFriendCompound(trimmed, allowExtra) {
  // Strip `2>&1` redirects first (always safe, handled by stripStderrRedirect)
  const stripped = stripStderrRedirect(trimmed);

  // Reject path traversal — CF scripts never use .. in paths
  if (stripped.includes("..")) return false;

  const sanitized = removeQuotedContent(stripped);
  if (sanitized === null) return false;

  // Strip safe redirects to check remaining operators on the skeleton command.
  // SAFE_REDIRECT_RE is module-level: matches `> /tmp/<name>`, `2> /tmp/<name>`, `/dev/null`.
  const sanitizedNoRedirect = sanitized.replace(SAFE_REDIRECT_RE, "");

  // After removing safe redirects, no truly unsafe operators should remain
  if (TRULY_UNSAFE_OPERATORS.test(sanitizedNoRedirect)) return false;

  const effectiveAllow =
    allowExtra && allowExtra.length > 0
      ? [...BASH_ALLOW_PREFIXES, ...allowExtra]
      : BASH_ALLOW_PREFIXES;

  // Split on && and || using the quote-sanitized form so operators inside quoted
  // content are not treated as shell operators. Every clause must be safe.
  const logicalClauses = splitByLogicalOperators(stripped, sanitized);
  if (!logicalClauses.length) return false;

  // At least one clause must be a CF plugin script
  let hasCFScript = false;

  const allSafe = logicalClauses.every(({ orig }) => {
    const clause = orig.trim();
    if (!clause) return false;

    // Strip safe redirects from the clause to isolate the core command
    const withoutRedirect = clause.replace(SAFE_REDIRECT_RE, "").trim();

    // Reject any remaining shell operators (pipes, subshells, etc.)
    if (SHELL_OPERATOR_PATTERN.test(withoutRedirect)) return false;

    // Check if it's a CF plugin bash script
    if (isCodingFriendBash(withoutRedirect)) {
      hasCFScript = true;
      return true;
    }

    // Check if it matches an allow-listed prefix
    for (const prefix of effectiveAllow) {
      if (matchesPrefix(withoutRedirect, prefix)) {
        return postMatchSafety(withoutRedirect, prefix) === "allow";
      }
    }

    return false;
  });

  return allSafe && hasCFScript;
}

/**
 * Check if a trimmed command matches a prefix.
 * Matches: exact, prefix + space, prefix + tab.
 */
function matchesPrefix(trimmed, prefix) {
  const p = prefix.trimEnd();
  return (
    trimmed === p || trimmed.startsWith(p + " ") || trimmed.startsWith(p + "\t")
  );
}

/**
 * Extract target file paths from a simple rm command.
 * Strips flags (tokens starting with `-`) and handles `--` end-of-options.
 * Returns the array of path arguments, or null if not an rm command or no paths found.
 * @param {string} trimmed — the full trimmed command
 * @returns {string[]|null}
 */
function extractRmPaths(trimmed) {
  if (!trimmed.startsWith("rm ") && !trimmed.startsWith("rm\t")) return null;
  const afterRm = trimmed.slice(2).trim();
  if (!afterRm) return null;

  const tokens = afterRm.split(/\s+/);
  const paths = [];
  let endOfOptions = false;
  for (const token of tokens) {
    if (endOfOptions) {
      paths.push(token);
    } else if (token === "--") {
      endOfOptions = true;
    } else if (token.startsWith("-")) {
      // Flag — skip
    } else {
      paths.push(token);
    }
  }
  return paths.length > 0 ? paths : null;
}

/**
 * Classify a tool call using rules only.
 * @param {string} toolName
 * @param {object} toolInput
 * @param {string} [projectDir] — project root for file path checks
 * @param {string[]} [allowExtra] — additional Bash allow prefixes from
 *   `autoApproveAllowExtra` config. Merged with BASH_ALLOW_PREFIXES after the
 *   DENY check, so it can never override deny patterns or postMatchSafety.
 * @returns {"allow"|"deny"|"ask"|"unknown"}
 */
function classifyByRules(toolName, toolInput, projectDir, allowExtra) {
  // Always-allow tools
  if (ALWAYS_ALLOW_TOOLS.has(toolName)) return "allow";

  // Working-dir file operations
  if (toolName === "Write" || toolName === "Edit") {
    const filePath = toolInput && toolInput.file_path;
    return isInProjectDir(filePath, projectDir) ? "allow" : "ask";
  }

  // Bash classification
  if (toolName === "Bash") {
    const cmd = (toolInput && toolInput.command) || "";
    const trimmed = cmd.trim();

    // Early-allow: rm targeting paths entirely within the project directory.
    // Checked before deny patterns so project-scoped cleanup is always permitted.
    // Only applies to simple commands (no shell operators).
    if (!SHELL_OPERATOR_PATTERN.test(trimmed)) {
      const rmPaths = extractRmPaths(trimmed);
      if (
        rmPaths &&
        rmPaths.length > 0 &&
        rmPaths.every((p) => isInProjectDir(p, projectDir))
      ) {
        return "allow";
      }
    }

    // Check deny patterns first (most dangerous) — allowExtra cannot bypass
    for (const pattern of BASH_DENY_PATTERNS) {
      if (pattern.test(trimmed)) return "deny";
    }

    // Effective allow list = hook defaults + per-project extras
    const effectiveAllow =
      allowExtra && allowExtra.length > 0
        ? [...BASH_ALLOW_PREFIXES, ...allowExtra]
        : BASH_ALLOW_PREFIXES;

    // Compound commands (pipes, chains, redirects, subshells) are never
    // safe to auto-approve by prefix alone — defer or ask
    const isCompound = SHELL_OPERATOR_PATTERN.test(trimmed);

    // Safe compound commands: pipe-only chains where every segment is safe
    if (isCompound && isSafeCompoundCommand(trimmed, allowExtra, projectDir)) {
      return "allow";
    }

    // CF plugin scripts with safe redirects and/or allow-listed follow-up commands
    if (isCompound && isCodingFriendCompound(trimmed, allowExtra)) {
      return "allow";
    }

    // Check allow prefixes (safe read-only commands) — only if simple command
    if (!isCompound) {
      for (const prefix of effectiveAllow) {
        if (matchesPrefix(trimmed, prefix)) {
          return postMatchSafety(trimmed, prefix);
        }
      }

      // Coding-friend related commands (scripts, cf CLI) — safe when simple
      if (isCodingFriendBash(trimmed)) return "allow";

      // Test runners (any language / framework) — always allowed
      if (TEST_RUNNER_PATTERN.test(trimmed)) return "allow";
    }

    // Check ask prefixes
    for (const prefix of BASH_ASK_PREFIXES) {
      if (matchesPrefix(trimmed, prefix)) return "ask";
    }

    // Unknown Bash command → defer to the host
    return "unknown";
  }

  // Unrecognized non-Bash tool → defer to the host
  return "unknown";
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------
module.exports = {
  classifyByRules,
  buildReason,
  isCodingFriendBash,
  isCodingFriendCompound,
  isInProjectDir,
  isSafeCompoundCommand,
  splitByLogicalOperators,
  extractBashScriptPath,
  extractRmPaths,
  SHELL_OPERATOR_PATTERN,
  UNSAFE_COMPOUND_PATTERN,
  TEST_RUNNER_PATTERN,
  PLUGIN_ROOT,
};

/**
 * Build a human-readable reason string for the decision.
 * @param {string} toolName
 * @param {object} toolInput
 * @param {"allow"|"deny"|"ask"} decision
 * @param {{ source?: "rule"|"working-dir"|"rm-project-dir", pattern?: string }} [context]
 * @returns {string}
 */
function buildReason(toolName, toolInput, decision, context) {
  if (decision === "allow") {
    if (context && context.source === "working-dir") {
      return "Auto-approved: file path is within working directory";
    }
    if (context && context.source === "rm-project-dir") {
      return "Auto-approved: rm targets files within project directory";
    }
    return `Auto-approved: '${toolName}' is a read-only operation`;
  }

  if (decision === "deny") {
    const cmd = (toolInput && toolInput.command) || "";
    const pattern = context && context.pattern ? context.pattern : "";
    if (pattern) {
      return `Blocked: '${cmd}' matches destructive pattern (${pattern}). Try a safer alternative.`;
    }
    return `Blocked: '${cmd}' matches destructive pattern. Try a safer alternative.`;
  }

  // ask
  return `Requires confirmation: '${toolName}' needs user review`;
}
