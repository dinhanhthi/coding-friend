#!/usr/bin/env bash
# PreToolUse hook: Block access to sensitive files.
#
# Prevents the agent from reading files that match sensitive patterns
# such as .env, .pem, .key, SSH keys, AWS/GPG credentials, and paths
# containing "secret" or "credentials" (except source/doc files such as
# secret-manager.ts). See lib/privacy-patterns.sh.
#
# Safe patterns (.example, .sample, .template) are allowlisted and
# bypass the block. Runs before Read, Write, Edit, Glob, Grep tools.
# Grep's pattern is a content regex, not a path, so it is not checked;
# Glob's pattern and Grep's glob are matched as globs.
#
# Integration contract:
#   stdin  – JSON with tool_name, tool_input (file_path, path, glob, command,
#            pattern)
#   stdout – JSON with hookSpecificOutput on block, {} on allow
#   Exit 0 = allow, Exit 2 = block
#
# Configuration:
#   "privacyBlock": false in .coding-friend/config.json disables the hook.

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# shellcheck source=../lib/cf-paths.sh
source "$PLUGIN_ROOT/lib/cf-paths.sh"
cf_resolve_paths
# shellcheck source=../lib/privacy-patterns.sh
source "$PLUGIN_ROOT/lib/privacy-patterns.sh"

# Check if hook is disabled via config
CONFIG_FILE="$CF_CONFIG_FILE"
if [ -f "$CONFIG_FILE" ]; then
  if grep -q '"privacyBlock"[[:space:]]*:[[:space:]]*false' "$CONFIG_FILE" 2>/dev/null; then
    echo '{}'
    exit 0
  fi
fi

# Read tool input from stdin
INPUT=$(cat)

# json_escape <string> — print <string> as the body of a JSON string. The
# backslash goes first so later escapes are not doubled; the other C0 controls
# are dropped. Pure bash 3.2 + tr: the deny output must not depend on node.
json_escape() {
  local s="$1" bs='\'
  s=${s//"$bs"/"$bs$bs"}
  s=${s//\"/"$bs\""}
  s=${s//$'\t'/"${bs}t"}
  s=${s//$'\n'/"${bs}n"}
  s=${s//$'\r'/"${bs}r"}
  printf '%s' "$s" | tr -d '\001-\010\013\014\016-\037'
}

# emit_deny <reason> — print the deny JSON and exit 2 (block).
emit_deny() {
  local reason
  reason="$(json_escape "$1")"
  cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "$reason"
  }
}
EOF
  exit 2
}

# Extract path-like fields, one per line. With node, parse the JSON: a grep
# `"[^"]*"` capture stops at an escaped quote (a\"b.env), and the command
# field (Codex apply_patch) carries a JSON-escaped patch whose target paths
# sit in its headers. Without node, or when the input is not a JSON object,
# fall back to the grep capture, and deny any apply_patch or command field
# (fail closed: the patch headers cannot be read without node).
# `path` and `glob` are also probed as "<value>/" so a directory such as
# ~/.ssh matches the '\.ssh/' rows. A Grep glob or a Glob pattern (.e*,
# **/id_*, *.p\em) is matched, per brace alternative and path segment, with
# its \ escapes resolved, against PRIVACY_GLOB_NAMES by lib/privacy-glob.cjs
# (the matcher privacy-block.agy.sh uses).
# Every output line starts with its kind: "p" + a path to check, or "d" + a
# deny reason, so no path content can pass for a reason.
CANDIDATES=""
NODE_PARSED=0
if command -v node >/dev/null 2>&1; then
  privacy_export_env
  if CANDIDATES=$(printf '%s' "$INPUT" | node -e '
    const lib = require(process.argv[1]);
    const matcher = lib.createMatcher(process["env"], { hiddenDot: false });
    // braceAlts(glob) — glob with its {a,b} lists expanded (capped).
    function braceAlts(glob) {
      const alts = [glob];
      for (let i = 0; i < alts.length && alts.length < 256; i++) {
        const m = /\{([^{}]*)\}/.exec(alts[i]);
        if (!m) continue;
        const pre = alts[i].slice(0, m.index);
        const post = alts[i].slice(m.index + m[0].length);
        alts.splice(i--, 1, ...m[1].split(",").map((a) => pre + a + post));
      }
      return alts;
    }
    let s = "";
    process.stdin.on("data", (d) => (s += d));
    process.stdin.on("end", () => {
      let j;
      try {
        j = JSON.parse(s);
      } catch {
        process.exit(1);
      }
      if (!j || typeof j !== "object") process.exit(1);
      const ti =
        j.tool_input && typeof j.tool_input === "object" ? j.tool_input : {};
      const out = [];
      const add = (v) => {
        if (typeof v !== "string") return;
        for (const p of v.split(/\r?\n|\r/)) if (p) out.push("p" + p);
      };
      const addDir = (v) => {
        if (typeof v !== "string") return;
        add(v);
        for (const p of v.split(/\r?\n|\r/)) if (p) out.push("p" + p.replace(/\/$/, "") + "/");
      };
      const deny = (g, why) =>
        out.push("dAccess to \u0027" + g + "\u0027 blocked by privacy-block. " + why);
      // checkGlob(v) — per line and brace alternative: probe the text with
      // its \ escapes resolved (ripgrep reads \e as e), then match the glob.
      const checkGlob = (v) => {
        if (typeof v !== "string") return;
        for (const g of v.split(/\r?\n|\r/)) {
          if (!g) continue;
          const alts = braceAlts(g);
          if (alts.length >= 256) deny(g, "Glob brace list too large to check");
          for (const a of alts) {
            const word = lib.lexGlob(a);
            addDir(lib.text(word));
            const name = matcher.globPattern(word);
            if (name) {
              deny(g, "Glob matches sensitive name: " + name);
              break;
            }
          }
        }
      };
      add(ti.file_path);
      addDir(ti.path);
      // Claude Code splits a Grep glob on whitespace, then each piece
      // without braces on ",", and passes every piece as its own --glob.
      // A piece with one leading "!" excludes its matches (ripgrep -g): it
      // reads nothing, so skip it. A "!!" piece is checked without its "!"s.
      if (typeof ti.glob === "string") {
        for (const piece of ti.glob.split(/\s+/)) {
          for (let g of /[{}]/.test(piece) ? [piece] : piece.split(",")) {
            if (g[0] === "!") {
              if (g[1] !== "!") continue;
              g = g.replace(/^!+/, "");
            }
            addDir(g);
            checkGlob(g);
          }
        }
      }
      // Grep pattern is a content regex, not a path (Devin sends "grep").
      if (String(j.tool_name || "").toLowerCase() !== "grep") {
        add(ti.pattern);
        checkGlob(ti.pattern);
      }
      const cmd = Array.isArray(ti.command)
        ? ti.command.join("\n")
        : String(ti.command || "");
      const re =
        /^[ \t]*\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gim;
      let m;
      while ((m = re.exec(cmd))) add(m[1].trim());
      process.stdout.write(out.join("\n"));
    });
  ' "$PLUGIN_ROOT/lib/privacy-glob.cjs" 2>/dev/null); then
    NODE_PARSED=1
  fi
fi

if [ "$NODE_PARSED" -eq 0 ]; then
  CANDIDATES=""
  TOOL_NAME=$(printf '%s' "$INPUT" | grep -o '"tool_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"tool_name"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)
  if printf '%s' "$TOOL_NAME" | grep -qi '^apply_patch$' \
    || printf '%s' "$INPUT" | grep -q '"command"'; then
    emit_deny "privacy-block needs node to inspect apply_patch"
  fi
  # A JSON string body: an escaped quote (a\"b.env) must not end the capture.
  # The sed pass then un-escapes \" and \\ left to right.
  json_str='"([^"\\]|\\.)*"'
  for key in file_path path glob pattern; do
    # Grep's pattern is a content regex, not a path (Devin sends lowercase "grep").
    if [ "$key" = pattern ] && printf '%s' "$TOOL_NAME" | grep -qi '^grep$'; then
      continue
    fi
    value=$(printf '%s' "$INPUT" | grep -oE "\"$key\"[[:space:]]*:[[:space:]]*$json_str" | head -1 | sed "s/^\"$key\"[[:space:]]*:[[:space:]]*\"//;s/\"\$//" | sed 's/\\\([\\"]\)/\1/g' || true)
    [ -z "$value" ] && continue
    # Degraded mode: a wildcard Grep glob, or a \-escaped glob or Glob
    # pattern, cannot be matched without node. A Glob pattern with only
    # wildcards keeps the literal checks: denying them all would block Glob.
    case "$key:$value" in
      glob:*[*?[{]* | glob:*\\* | pattern:*\\*)
        emit_deny "privacy-block needs node to check the glob '$value'"
        ;;
    esac
    # A Grep glob is one --glob per whitespace or comma piece (see above).
    # Every piece is checked, "!" pieces too, with their "!"s removed.
    pieces="$value"
    if [ "$key" = glob ]; then
      pieces="${pieces//,/$'\n'}"
      pieces="${pieces//[[:space:]]/$'\n'}"
    fi
    while IFS= read -r piece; do
      if [ "$key" = glob ]; then
        while [ "${piece#!}" != "$piece" ]; do piece="${piece#!}"; done
      fi
      [ -z "$piece" ] && continue
      CANDIDATES="$CANDIDATES"$'\n'"p$piece"
      case "$key" in
        path | glob) CANDIDATES="$CANDIDATES"$'\n'"p${piece%/}/" ;;
      esac
    done <<< "$pieces"
  done
fi

PATHS_ARRAY=()
while IFS= read -r candidate; do
  [ -n "$candidate" ] && PATHS_ARRAY+=("$candidate")
done <<< "$CANDIDATES"

# bash 3.2 + set -u: "${arr[@]}" aborts on empty arrays; [@]:- yields one empty word.
for line in "${PATHS_ARRAY[@]:-}"; do
  case "$line" in
    d*) emit_deny "${line#d}" ;;
    p?*) path="${line#p}" ;;
    *) continue ;;
  esac

  pattern="$(privacy_sensitive_pattern "$path" || true)"
  if [ -n "$pattern" ]; then
    emit_deny "Access to '$path' blocked by privacy-block. File matches sensitive pattern: $pattern"
  fi
done

# Allow
echo '{}'
