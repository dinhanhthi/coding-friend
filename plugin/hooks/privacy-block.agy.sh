#!/usr/bin/env bash
# PreToolUse hook (Antigravity): block access to sensitive files.
#
# Same patterns as privacy-block.sh. Speaks AGY's hook contract:
#   stdin  – JSON with camelCase toolCall.args
#   stdout – {"decision":"allow"} or {"decision":"deny","reason":"..."}
#   Exit 0 always (including deny). Malformed JSON fails open; a missing
#   node fails closed (every matched tool is denied).
#
# Configuration:
#   "privacyBlock": false in .coding-friend/config.json disables the hook.

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../lib/agy-hook-io.sh
source "$PLUGIN_ROOT/lib/agy-hook-io.sh"
# shellcheck source=../lib/privacy-patterns.sh
source "$PLUGIN_ROOT/lib/privacy-patterns.sh"
# shellcheck source=../lib/cf-paths.sh
source "$PLUGIN_ROOT/lib/cf-paths.sh"

# Hook cwd is the plugin dir. Read payload first, cd to workspacePaths[0],
# then resolve project config (privacyBlock / .coding-friend/).
agy_read_payload

# Without a working node the payload cannot be read (agy-hook-io.sh parses it
# with node), so nothing would be checked: deny every tool the matcher sends
# here (all of them read or write files). `node -e 0` also catches a node on
# PATH that does not run (a version-manager shim, a broken install). This runs
# before the config lookup: without node the workspace is unknown, so the
# project's privacyBlock: false cannot be read, and a config found from the
# hook's cwd must not turn it off. The JSON is a literal: agy_emit_deny needs
# node too. The payload is read first so the caller's write never breaks.
if ! node -e 0 >/dev/null 2>&1; then
  printf '%s\n' '{"decision":"deny","reason":"privacy-block needs node to check file and command tools on Antigravity. Install node: without it the project config cannot be read."}'
  exit 0
fi

WS="$(agy_field 'workspacePaths[0]' || true)"
WS="${WS//$'\n'/}"
WS="${WS//$'\r'/}"
case "$WS" in
  "~") WS="$HOME" ;;
  "~/"*) WS="$HOME/${WS#\~/}" ;;
esac
if [ -n "$WS" ] && [ -d "$WS" ]; then
  cd "$WS"
fi

cf_resolve_paths

# Check if hook is disabled via config
CONFIG_FILE="$CF_CONFIG_FILE"
if [ -f "$CONFIG_FILE" ]; then
  if grep -q '"privacyBlock"[[:space:]]*:[[:space:]]*false' "$CONFIG_FILE" 2>/dev/null; then
    agy_emit_allow
    exit 0
  fi
fi

# The node checks (lib/privacy-glob.cjs) read the patterns from env vars.
privacy_export_env

# privacy_agy_glob_pattern <path> — print the sensitive name that a glob
# segment of <path> (*, ? or [...]) could match, and return 0. Same matcher as
# run_command (lib/privacy-glob.cjs over PRIVACY_GLOB_NAMES), with \ escapes
# resolved (\e is a literal e); a node failure prints a reason too (fail closed).
PRIVACY_AGY_GLOB_JS='const lib = require(process.argv[1]);
const hit = lib.createMatcher(process["env"]).globPattern(lib.lexGlob(process.argv[2]));
if (hit) process.stdout.write("glob " + hit + "\n");'
privacy_agy_glob_pattern() {
  local hit
  hit="$(node -e "$PRIVACY_AGY_GLOB_JS" "$PLUGIN_ROOT/lib/privacy-glob.cjs" "$1" 2>/dev/null)" ||
    hit="privacy-block could not check the glob"
  [ -n "$hit" ] || return 1
  printf '%s\n' "$hit"
}

# Directory SearchPath values like ~/.ssh have no trailing slash; also check
# the slash-terminated form so '\.ssh/' (and similar) still match.
# Glob Pattern values (*.env, .env*) are de-globbed (* and ? stripped) so
# they still match the .env patterns in privacy-patterns.sh, and matched as
# globs against sensitive names (.en? has no .env left once de-globbed).
# A value with a backslash is also checked with every backslash removed
# (.\env is .env to a glob engine).
privacy_agy_denied_pattern() {
  local path="$1"
  local check_path deglobbed unesc
  case "$path" in
    *[*?[]*) privacy_agy_glob_pattern "$path" && return 0 ;;
  esac
  deglobbed="${path//[*?]/}"
  local probes=("$path" "${path%/}/" "$deglobbed" "${deglobbed%/}/")
  case "$path" in
    *\\*)
      unesc="${path//\\/}"
      probes+=("$unesc" "${unesc%/}/" "${unesc//[*?]/}")
      ;;
  esac
  for check_path in "${probes[@]}"; do
    [ -z "$check_path" ] && continue
    privacy_sensitive_pattern "$check_path" && return 0
  done
  return 1
}

# PRIVACY_AGY_JS — the run_command check, run as ONE node process (a bash
# loop forked ~80 greps per token and hit AGY's 10 s hook timeout). It reads
# the payload on stdin, the glob matcher from lib/privacy-glob.cjs (argv[1])
# and the patterns of privacy-patterns.sh from the CF_PRIVACY_* env vars, and
# prints the matched pattern on deny, nothing on allow. Per token it applies
# privacy_agy_denied_pattern's rules; it also handles what only the shell
# would turn into a name: \-newline continuations, quotes (a quoted * or { is
# literal), $'...' strings, simple brace lists ({a,b}), unquoted globs and
# quoted globs a nested shell may expand (sh -c 'cat .e*') or that reach,
# through a pipe or redirection, a command outside SAFE_CONSUMERS (echo
# 'cat .e*' | runuser x), and fails closed
# on non-list braces, $'\x..' escapes that yield a printable character and
# $-splices next to a dot-name prefix
# (cat .$a, cat $(echo .)env). Any error exits non-zero, which the caller
# turns into a deny.
IFS= read -r -d '' PRIVACY_AGY_JS <<'JS' || true
"use strict";
const { ere, list, one, text, isGlob, lexGlob, createMatcher } = require(process.argv[1]);
const E = process["env"];
const SAFE = list(E, "CF_PRIVACY_SAFE").map(ere);
const named = (k) => list(E, k).map((p) => [p, ere(p)]);
const SENSITIVE = named("CF_PRIVACY_SENSITIVE");
const KEYWORD = named("CF_PRIVACY_KEYWORD");
const GLOB_NAMES = list(E, "CF_PRIVACY_GLOB_NAMES");
const CODE_EXT = one(E, "CF_PRIVACY_CODE_EXT");
const SECRET_STEM = one(E, "CF_PRIVACY_SECRET_STEM");
const DOC_EXT = one(E, "CF_PRIVACY_DOC_EXT");
if (!SENSITIVE.length || !KEYWORD.length || !GLOB_NAMES.length) {
  throw new Error("missing patterns");
}
const MATCHER = createMatcher(E);

// privacy_sensitive_pattern from privacy-patterns.sh.
function sensitive(p) {
  if (SAFE.some((r) => r.test(p))) return null;
  for (const [s, r] of SENSITIVE) if (r.test(p)) return s;
  let base = p.replace(/\/$/, "");
  base = base.slice(base.lastIndexOf("/") + 1);
  if (/[\s;&|<>$`]/.test(p)) base = "";
  if (
    base &&
    CODE_EXT.test(base) &&
    (!SECRET_STEM.test(base) || DOC_EXT.test(base))
  ) {
    return null;
  }
  for (const [s, r] of KEYWORD) if (r.test(p)) return s;
  return null;
}

// A word is a list of {c, q}: q 0 = unquoted, 1 = single-quoted or escaped,
// 2 = double-quoted. Only unquoted * ? [ { are shell syntax.

// privacy_agy_denied_pattern: glob match, then <tok>, <tok>/ and the same two
// with unquoted * and ? removed. filter (a jq/yq filter) skips the literal
// probes: it is not a file name.
function denied(word, filter) {
  if (word.some(isGlob)) {
    const g = MATCHER.globPattern(word, false);
    if (g) return "glob " + g;
  }
  if (filter) return null;
  const tok = text(word);
  const deglob = text(word.filter((x) => !(x.q === 0 && (x.c === "*" || x.c === "?"))));
  for (const p of [tok, tok.replace(/\/$/, "") + "/", deglob, deglob.replace(/\/$/, "") + "/"]) {
    if (!p || p === "/") continue;
    const s = sensitive(p);
    if (s) return s;
  }
  return null;
}

// lex(line, quotes) — the line as {c, q} items with quotes and backslashes
// removed. A backslash is dropped even in single quotes, as a nested shell
// (bash -c '...') would read it. Inside $'...' (mode 3) a backslash takes
// the next character, so $'\'' is one quote. With quotes false every quote
// is dropped and nothing counts as quoted (used when the quotes do not
// balance, and as a second pass when comments or here-docs may hide a quote).
function lex(line, quotes) {
  const out = [];
  let mode = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (mode === 3) {
      if (c === "'") mode = 0;
      else if (c === "\\") {
        i++;
        if (i < line.length) out.push({ c: line[i], q: 1 });
      } else out.push({ c, q: 1 });
      continue;
    }
    if (c === "\\") {
      if (mode !== 1) {
        i++;
        if (i < line.length) out.push({ c: line[i], q: 1 });
      }
      continue;
    }
    if (mode === 1 && c !== "'") {
      out.push({ c, q: 1 });
      continue;
    }
    if (c === "'" && mode !== 2) {
      mode = mode === 1 ? 0 : quotes ? 1 : 0;
      continue;
    }
    if (c === '"') {
      if (mode === 2 || quotes) mode = mode === 2 ? 0 : 2;
      continue;
    }
    if (c === "$" && mode === 0 && line[i + 1] === "'") {
      if (quotes) {
        mode = 3;
        i++;
      }
      continue;
    }
    if (c === "$" && mode === 0 && line[i + 1] === '"') continue;
    out.push({ c, q: mode });
  }
  return { items: out, open: mode !== 0 };
}

// Dot-name prefixes a $ expansion could complete: .e .en .env .s .ss ...
const PREFIXES = [];
for (const name of GLOB_NAMES) {
  if (name[0] !== "." || /[*?[]/.test(name)) continue;
  for (let i = 2; i <= name.length; i++) PREFIXES.push(name.slice(1, i));
}
const FRAGMENT = new RegExp("(^|/)\\.(" + PREFIXES.join("|") + ")?$", "i");
const RUN = /[A-Za-z0-9_.\/~]/;
const EXPANDS = /[$`(){}]/;

// spliceCheck(items) — with a live $ or backtick, deny a run of path
// characters that is a dot-name prefix (.e, ~/.ss): an expansion can finish
// it. A lone "." only counts next to an expansion character, or after "="
// when an expansion can splice it: one in the same word, a later use of the
// assigned name (a=.; cat ${a}env, $a'env', ${!r}), or a later }, ) or `
// followed by a name character (export a=.; cat $(printenv a)env). A lone
// "." word that a command stores in a variable (read a <<< ., set -- .,
// for a in ., printf -v a ., mapfile) counts when a later }, ), `, $1 or
// $name'...' is directly followed by a name character. So find . -name "$n",
// find . -name "${P}_x" and PYTHONPATH=. python x.py "$OUT" stay allowed;
// after a "/" its neighbour is that "/", so "$dir/." stays allowed too.
const isLive = (items, i) =>
  (items[i].c === "`" && items[i].q !== 1) ||
  (items[i].c === "$" && items[i].q !== 1 && !!items[i + 1] && items[i + 1].q !== 1 &&
    /[A-Za-z0-9_{(@*#?!$-]/.test(items[i + 1].c));
function assignSplice(items, eq, end) {
  let start = eq;
  while (start > 0 && /[A-Za-z0-9_]/.test(items[start - 1].c)) start--;
  const name = text(items.slice(start, eq));
  let k = end;
  while (k < items.length && !(items[k].q === 0 && /[\s;&|()<>]/.test(items[k].c))) {
    if (isLive(items, k)) return true;
    k++;
  }
  for (; k < items.length; k++) {
    const x = items[k];
    if (x.q !== 1 && /[})`]/.test(x.c) && items[k + 1] && /[A-Za-z0-9_.]/.test(items[k + 1].c)) return true;
    if (!isLive(items, k) || x.c !== "$") continue;
    // The name ends where the quoting changes: $a'env' uses a.
    let e = k + 1;
    while (e < items.length && e < k + 3 + name.length && items[e].q === items[k + 1].q) e++;
    const ref = /^\{?(!|([A-Za-z_][A-Za-z0-9_]*))/.exec(text(items.slice(k + 1, e)));
    if (ref && (ref[1] === "!" || ref[2] === name)) return true;
  }
  return false;
}
const NAME_CHAR = /[A-Za-z0-9_]/;
function laterSplice(items, k) {
  const nameAt = (e) => !!items[e] && NAME_CHAR.test(items[e].c);
  for (; k < items.length; k++) {
    const x = items[k];
    if (x.q !== 1 && /[})`]/.test(x.c) && nameAt(k + 1)) return true;
    if (!isLive(items, k) || x.c !== "$") continue;
    const n = items[k + 1];
    if (/[0-9@*#?!$-]/.test(n.c)) {
      if (nameAt(k + 2)) return true;
      continue;
    }
    // $name'env': the name ends where the quoting changes.
    let e = k + 1;
    while (nameAt(e) && items[e].q === n.q) e++;
    if (e > k + 1 && nameAt(e)) return true;
  }
  return false;
}
const sepAt = (x) => !x || (x.q === 0 && /[\s;&|<>()]/.test(x.c));
// storesDot(items, i) — where a use of the stored value can follow, when the
// simple command around items[i] puts its words into a variable (read /
// mapfile / readarray fed by <<<, set, for, printf -v): after the word, or
// anywhere for a loop's done <<< (its body comes first); else -1.
function storesDot(items, i) {
  let k = i;
  while (k > 0 && !(items[k - 1].q === 0 && /[;&|()`\n]/.test(items[k - 1].c))) k--;
  const ws = text(items.slice(k, i)).split(/\s+/).filter(Boolean);
  while (ws.length && /^(\{|!|builtin|command|[A-Za-z_][A-Za-z0-9_]*=.*)$/.test(ws[0])) ws.shift();
  const c = ws[0] || "";
  if (c === "done") return 0;
  if (/^(read|mapfile|readarray|set|for)$/.test(c)) return i;
  return c === "printf" && ws.some((w) => /^-v/.test(w)) ? i : -1;
}
function spliceCheck(items) {
  if (!items.some((x, i) => isLive(items, i))) return null;
  for (let i = 0; i < items.length; ) {
    if (!RUN.test(items[i].c)) {
      i++;
      continue;
    }
    let j = i;
    while (j < items.length && RUN.test(items[j].c)) j++;
    const m = FRAGMENT.exec(text(items.slice(i, j)));
    if (m) {
      if (m[2]) return "partial name with $ expansion";
      const b = i + m.index + m[1].length - 1;
      const before = items[b];
      const after = items[j];
      const near = (x) => x && x.q !== 1 && EXPANDS.test(x.c);
      const assign = before && before.c === "=" && before.q === 0 && assignSplice(items, b, j);
      const from = j - i === 1 && sepAt(items[i - 1]) && sepAt(after) ? storesDot(items, i) : -1;
      const lone = from >= 0 && laterSplice(items, from);
      if (near(before) || near(after) || assign || lone) {
        return "partial name with $ expansion";
      }
    }
    i = j;
  }
  return null;
}

// braceExpand(word, out, st, alt) — push word's brace expansion to out. Only
// unquoted lists of simple words ({ts,js}) expand; a ${...} is skipped; a
// {a..b} range or a list with quotes, spaces or $ inside sets st.deny when
// it touches a word character or a dot. alt marks a word a list produced;
// past 256 of those st.deny is set too.
const SIMPLE = /^[A-Za-z0-9._,-]$/;
const ATTACHED = /[A-Za-z0-9_.]/;
function braceExpand(word, out, st, alt) {
  if (st.deny) return;
  if (st.n > 256) {
    st.deny = "brace list too large to check";
    return;
  }
  const stack = [];
  for (let i = 0; i < word.length; i++) {
    const x = word[i];
    if (x.q !== 0 || (x.c !== "{" && x.c !== "}")) continue;
    if (x.c === "{") {
      const prev = word[i - 1];
      stack.push({ i, param: !!prev && prev.c === "$" && prev.q === 0 });
      continue;
    }
    const open = stack.pop();
    if (!open || open.param) continue;
    const body = word.slice(open.i + 1, i);
    const comma = body.some((b) => b.q === 0 && b.c === ",");
    const range = body.some(
      (b, k) => b.q === 0 && b.c === "." && body[k + 1] && body[k + 1].q === 0 && body[k + 1].c === ".",
    );
    if (!comma && !range) continue;
    if (comma && body.every((b) => b.q === 0 && SIMPLE.test(b.c))) {
      const pre = word.slice(0, open.i);
      const post = word.slice(i + 1);
      let part = [];
      for (const b of body.concat([{ c: ",", q: 0 }])) {
        if (b.c !== ",") {
          part.push(b);
          continue;
        }
        braceExpand(pre.concat(part, post), out, st, true);
        part = [];
      }
      return;
    }
    const before = word[open.i - 1];
    const after = word[i + 1];
    if ((before && ATTACHED.test(before.c)) || (after && ATTACHED.test(after.c))) {
      st.deny = "brace expression";
      return;
    }
  }
  if (alt) st.n++;
  out.push(word);
}

function split(items, sep) {
  const out = [[]];
  items.forEach((x, i) => {
    if (sep(x, i, items)) out.push([]);
    else out[out.length - 1].push(x);
  });
  return out.filter((w) => w.length);
}

// A token ends at these unquoted characters, and at "=" unless it is part
// of a [=c=] glob unit (an unquoted "[" before it or "]" after it). A quoted
// string splits at the same characters, "=" and quotes too (xargs reads
// names from echo "a .key b"), unless it is opaque: a known non-file
// argument (opaqueItems), which stays one token. What a nested shell runs
// from a quoted string is checked by nested().
const unq = (x, c) => !!x && x.q === 0 && x.c === c;
const tokenSep = (opaque) => (x, i, w) =>
  x.q === 0
    ? /[\s;&|<>(){}`$,]/.test(x.c) ||
      (x.c === "=" && !unq(w[i - 1], "[") && !unq(w[i + 1], "]"))
    : !opaque.has(x) && /[\s;&|<>(){}`$,='"]/.test(x.c);

// commands(items) — each simple command as its words (split at unquoted
// whitespace only, so a redirection stays in its word), leading NAME=value
// words dropped.
function commands(items) {
  const out = [];
  for (const cmd of split(items, (x) => x.q === 0 && /[;&|()`\n]/.test(x.c))) {
    const words = split(cmd, (x) => x.q === 0 && /\s/.test(x.c));
    let k = 0;
    while (k < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(text(words[k])) && words[k][0].q === 0) k++;
    if (k < words.length) out.push(words.slice(k));
  }
  return out;
}

// opaqueItems(cmds) — the items of quoted arguments that name no file and
// stay one token: a git commit/tag message; a grep/rg/ag/ack or sed pattern
// or script (the first non-option word, or the -e value); an awk program;
// a perl -e / node -e|-p / python -c / ruby -e expression.
const GIT = /(^|\/)git$/;
const PATTERN_CMD = /(^|\/)(grep|egrep|fgrep|rg|ag|ack|sed)$/;
const AWK = /(^|\/)g?awk$/;
const INTERP = /(^|\/)(perl|node|python[0-9.]*|ruby)$/;
function opaqueItems(cmds) {
  const out = new Set();
  const add = (w) => w && w.forEach((x) => out.add(x));
  const firstArg = (words) => words.slice(1).find((w) => text(w)[0] !== "-");
  for (const words of cmds) {
    const c = text(words[0]);
    const ts = words.map(text);
    if (GIT.test(c)) {
      if (!ts.includes("commit") && !ts.includes("tag")) continue;
      ts.forEach((t, k) => {
        if (/^(-[A-Za-z]*m|--message)$/.test(t)) add(words[k + 1]);
        else if (/^(-[A-Za-z]*m.|--message=)/.test(t)) add(words[k]);
      });
    } else if (PATTERN_CMD.test(c)) {
      // With -e or -f the first non-option word is a file.
      let explicit = false;
      ts.forEach((t, k) => {
        if (/^(-e|--regexp|--expression)$/.test(t)) add(words[k + 1]);
        else if (/^(-e.|--regexp=|--expression=)/.test(t)) add(words[k]);
        else if (!/^(-f|--file)/.test(t)) return;
        explicit = true;
      });
      if (!explicit) add(firstArg(words));
    } else if (AWK.test(c)) {
      if (!ts.some((t) => /^(-f|--file)/.test(t))) add(firstArg(words));
    } else if (INTERP.test(c)) {
      ts.forEach((t, k) => {
        if (/^(-[A-Za-z]*[eEpc]|--eval|--print)$/.test(t)) add(words[k + 1]);
      });
    }
  }
  return out;
}

// nested(items, depth) — check what a nested shell runs (sh -c '...',
// eval ...) as a command of its own, so a glob quoted for the outer shell
// counts as a glob; and match find's -name/-path/-regex value as a glob,
// strictly (2 literal characters of a name). Words count anywhere in their
// command segment (sudo sh -c, xargs sh -c), which ends at | |& || && & ;
// or a newline. After a command that hands a string to a shell (su -c,
// sudo -s, watch, ssh host, script -c, parallel, env -S) every quoted word
// of its segment is checked that way: where its command string sits
// varies with the options. So it is after a shell's
// -c (options may sit between -c and the script; the first non-option word
// is checked too), after any -c / -Command word whatever the command, and in
// the whole line when a shell or source / . reads its script from stdin
// (echo '...' | sh, sh <<< '...', . /dev/stdin). rg -g/--glob/--iglob and grep
// --include values select files: they are matched like find -name.
// Any word shaped like -c / -Command sets reentry whatever the command word
// is ($SHELL -c, rbash -c, gcc -c): rechecking can only deny more. A quoted
// word known to name no file (a grep pattern, a git message, a jq filter) is
// skipped when that is all that set reentry. SHELL tests a command word
// (stdinShell); SHELL_WORD, any word, so git stash / git push set no shell
// flag.
const SHELL = /(^|[\/\\])([a-z]*sh[0-9.]*|powershell)(\.exe)?$/i;
const SHELL_WORD = /(^|\/)(sh|bash|zsh|dash|ksh|ash|mksh|csh|tcsh|fish|pwsh)$/;
const SHELL_C = /^-[A-Za-z]*[cC][A-Za-z]*$/;
const SOURCE_STDIN = /^(\/dev\/stdin|-|\/dev\/fd\/0|<.*)$/;
const REENTRY = /(^|\/)(su|sudo|watch|ssh|script|parallel)$/;
const FIND_GLOB = /^-i?(name|path|wholename|regex)$/;
const GREP_CMD = /(^|\/)(grep|egrep|fgrep|rg)$/;
const GREP_GLOB = /^(-g|--glob|--iglob|--include)$/;
const GREP_GLOB_AT = /^(-g|--glob=|--iglob=|--include=)(?=.)/;
const ENV_S = /^(-[A-Za-z]*S|--split-string=?)/;

// stdinShell(cmds) — whether a shell runs without -c: it reads its script
// from stdin or a file. The shell is the command word, found past { and
// wrappers (sudo, env, exec, xargs, ...) with their options and option
// values (sudo -u x rbash), NAME=value and numeric words, or any later word
// that is exactly a shell name. Its -c counts only before --, - or its first
// non-option word (bash -s -- -c reads stdin); -o / -O take a value; an
// option cluster with s reads stdin. sudo -s / -i / --shell / --login with
// no command, and su without -c, run a shell that reads stdin too. So does
// source / . of /dev/stdin, -, /dev/fd/0 or a <, <<, <<< or <( input.
const WRAPPER = /(^|\/)(sudo|doas|env|exec|builtin|command|nohup|time|nice|timeout|stdbuf|setsid|ionice|caffeinate|arch|xargs|eval)$/;
// Per wrapper: the short options that take a value, and the long ones.
const WRAP_VALUE = {
  sudo: ["uUgCphrtTDR", /^--(user|other-user|group|close-from|prompt|host|role|type|chdir|chroot|command-timeout)$/],
  doas: ["uC", null],
  env: ["uCSP", /^--(unset|chdir|split-string)$/],
  exec: ["a", null],
  time: ["fo", /^--(format|output)$/],
  nice: ["n", /^--adjustment$/],
  timeout: ["sk", /^--(signal|kill-after)$/],
  stdbuf: ["ioe", /^--(input|output|error)$/],
  ionice: ["cnpPu", /^--(class|classdata|pid|pgid|uid)$/],
  caffeinate: ["tw", null],
  xargs: ["ILnPdEsa", /^--(replace|max-lines|max-args|max-procs|delimiter|eof|max-chars|arg-file)$/],
};
const bare = (t) => t.replace(/[{}(]/g, "");
const wordsOf = (s) => split(lex(s, true).items, (x) => x.q === 0 && /\s/.test(x.c)).map(text);
function readsStdin(ts, at) {
  for (let j = at + 1; j < ts.length; j++) {
    const t = ts[j];
    if (t === "--" || t === "-" || !/^[-+]/.test(t)) return true;
    if (/^[-+][oO]$/.test(t)) j++;
    else if (/^-[A-Za-z]*s[A-Za-z]*$/.test(t)) return true;
    else if (SHELL_C.test(t)) return false;
  }
  return true;
}
// commandWord(ts) — the index of the command word past { and wrappers, and
// whether a sudo option asked for a shell (-s, -i, --shell, --login). An
// env -S / --split-string value is a command line: its words replace it in
// ts (in place), so env -S 'nice sh' is parsed as env nice sh.
function commandWord(ts) {
  let i = 0;
  let shellOpt = false;
  while (i < ts.length) {
    if (!bare(ts[i])) {
      i++;
      continue;
    }
    const w = WRAPPER.exec(ts[i]);
    if (!w) break;
    const sudo = w[2] === "sudo";
    const env = w[2] === "env";
    const [letters, longs] = WRAP_VALUE[w[2]] || ["", null];
    i++;
    while (i < ts.length) {
      const o = ts[i];
      if (o === "--") {
        i++;
        break;
      }
      if (env && /^--split-string(=|$)/.test(o)) {
        const eq = o.indexOf("=");
        ts.splice(i, eq < 0 ? 2 : 1, ...wordsOf(eq < 0 ? ts[i + 1] || "" : o.slice(eq + 1)));
      } else if (/^--./.test(o)) {
        if (sudo && /^--(shell|login)$/.test(o)) shellOpt = true;
        i += longs && longs.test(o) ? 2 : 1;
      } else if (/^-./.test(o)) {
        i++;
        for (let p = 1; p < o.length; p++) {
          if (sudo && /[si]/.test(o[p])) shellOpt = true;
          if (env && o[p] === "S") {
            const last = p === o.length - 1;
            ts.splice(i, last ? 1 : 0, ...wordsOf(last ? ts[i] || "" : o.slice(p + 1)));
            break;
          }
          if (letters.includes(o[p])) {
            if (p === o.length - 1) i++;
            break;
          }
        }
      } else if (/^([A-Za-z_][A-Za-z0-9_]*=|[0-9][0-9.]*[a-z]?$)/.test(o)) i++;
      else break;
    }
  }
  return { i, shellOpt };
}
function stdinShell(cmds) {
  return cmds.some((words) => {
    const ts = words.map(text);
    let { i, shellOpt } = commandWord(ts);
    if (i >= ts.length) return shellOpt;
    const c = ts[i].split(/[<>]/)[0];
    if (c === "source" || c === ".") return c !== ts[i] || ts.slice(i + 1).some((t) => SOURCE_STDIN.test(t));
    if (/(^|\/)su$/.test(c)) {
      return !ts.slice(i + 1).some((t) => SHELL_C.test(t) || /^--(session-)?command(=|$)/.test(t));
    }
    if (/(^|\/)busybox$/.test(c) && ts[i + 1] && SHELL.test(ts[i + 1])) i++;
    else if (!SHELL.test(c)) i = -1;
    if (i >= 0 && readsStdin(ts, i)) return true;
    return ts.some((t, k) => k > 0 && SHELL_WORD.test(bare(t)) && readsStdin(ts, k));
  });
}

// urlWord(w) — a quoted URL (scheme://, no whitespace, shell syntax or *):
// it names no file, so the -c and stdin rechecks skip it like a pattern.
// A * keeps it checked, as a glob a shell could expand (? and [ stay: a
// query string such as ?key=1 would read as a glob of a name).
const URL_RE = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s;&|<>()`$'"\\{}*]*$/;
const urlWord = (w) => w.some((x) => x.q !== 0) && URL_RE.test(text(w));
// segments(items) — the words of each command segment: the line split at
// | |& || && & ; and newline outside any ( $( <( >( or `...` (so sudo
// $(true; echo -s) -c '...' stays one segment; units() keeps >& and &> as
// redirections). An opener that never closes keeps the rest of the line in
// its segment.
const SEGMENT_END = new Set(["|", "|&", "||", "&&", "&", ";", "\n"]);
function segments(items) {
  const out = [[]];
  let depth = 0;
  let tick = false;
  for (const u of units(items)) {
    if (u.w) out[out.length - 1].push(u.w);
    else if (OPENERS.has(u.op)) depth++;
    else if (u.op === ")") depth = Math.max(0, depth - 1);
    else if (u.op === "`") tick = !tick;
    else if (!depth && !tick && SEGMENT_END.has(u.op)) out.push([]);
  }
  return out.filter((s) => s.length);
}
function nested(items, depth, cmds, opaque, filters) {
  const stdin = stdinShell(cmds);
  for (const words of segments(items)) {
    const hit = nestedSegment(words, depth, stdin, opaque, filters);
    if (hit) return hit;
  }
  return null;
}
function nestedSegment(words, depth, stdin, opaque, filters) {
  let shell = false;
  let env = false;
  let grep = false;
  let reentry = stdin;
  let dashC = false;
  for (let k = 0; k < words.length; k++) {
    const t = text(words[k]);
    if (SHELL_WORD.test(t)) shell = true;
    if (REENTRY.test(t)) reentry = true;
    if (SHELL_C.test(t)) dashC = true;
    if (GREP_CMD.test(t)) grep = true;
    if (/(^|\/)env$/.test(t)) env = true;
    let glob = null;
    if (FIND_GLOB.test(t) || (grep && GREP_GLOB.test(t))) glob = words[k + 1];
    else if (grep && GREP_GLOB_AT.test(t)) glob = words[k].slice(GREP_GLOB_AT.exec(t)[0].length);
    if (glob) {
      const g = MATCHER.globPattern(glob, true);
      if (g) return "quoted glob " + g;
    }
    let script = null;
    if (t === "eval") script = words.slice(k + 1).map(text).join(" ");
    else if (shell && SHELL_C.test(t)) {
      reentry = true;
      let j = k + 1;
      while (j < words.length && /^[-+]/.test(text(words[j]))) {
        if (text(words[j++]) === "--") break;
      }
      if (words[j]) script = text(words[j]);
    } else if (env && ENV_S.test(t)) {
      reentry = true;
      const rest = t.slice(ENV_S.exec(t)[0].length);
      if (rest) script = rest;
    } else if (
      (reentry || (dashC && !urlWord(words[k]) && !words[k].every((x) => opaque.has(x) || filters.has(x)))) &&
      words[k].some((x) => x.q !== 0)
    ) {
      script = t;
    }
    const hit = script === null ? null : recheck(script, depth);
    if (hit) return hit;
  }
  return null;
}

function recheck(script, depth) {
  return depth >= 8 ? "nested shell too deep to check" : checkCommand(script, depth + 1);
}

// substitutions(items) — the body of each $(...) and `...` inside double
// quotes: the shell runs it, so its words are checked as a command of their
// own ("$(cat a.key)" is one quoted token). An unclosed one runs to the end.
function substitutions(items) {
  const out = [];
  const dq = (k, c) => items[k] && items[k].q === 2 && items[k].c === c;
  for (let i = 0; i < items.length; i++) {
    let k = i + 1;
    if (dq(i, "`")) {
      while (k < items.length && !dq(k, "`")) k++;
    } else if (dq(i, "$") && dq(i + 1, "(")) {
      for (let open = 0; k < items.length; k++) {
        if (dq(k, "(")) open++;
        else if (dq(k, ")") && --open === 0) break;
      }
      i++;
    } else continue;
    out.push(text(items.slice(i + 1, k)));
    i = k;
  }
  return out;
}

// filterItems(items) — the items of each jq/yq filter: the first word after
// a jq or yq command word and its options, when fully quoted and without
// "/". A filter names no file. Not when an option reads the filter or
// modules from a file (-f, --from-file, -L) or is not a plain flag (a
// redirection such as -r<). A filter that loads a file (load, load_str,
// load_base64, import, include) is not skipped: each of its "..." string
// literals goes to loads, to be checked as a path and as a glob.
const FILTER_CMD = /(^|\/)(jq|yq)$/;
const LOADS = /\b(load(_str|_base64)?|import|include)\b/;
function filterItems(cmds) {
  const out = new Set();
  const loads = [];
  for (const words of cmds) {
    if (!FILTER_CMD.test(text(words[0]))) continue;
    // yq reads a lone argument naming an existing file as that file, so its
    // first word is only a filter after -n or when another argument follows.
    const yq = /yq$/.test(text(words[0]));
    let nullInput = false;
    for (let k = 1; k < words.length; k++) {
      const w = words[k];
      const t = text(w);
      if (t[0] === "-") {
        if (!/^--?[A-Za-z][\w-]*$/.test(t) || /^-[A-Za-z]*[fL]|^--from-file/.test(t)) break;
        if (/^(-[A-Za-z]*n[A-Za-z]*|--null-input)$/.test(t)) nullInput = true;
        continue;
      }
      if (LOADS.test(t)) {
        for (const m of t.matchAll(/"((?:[^"\\]|\\.)*)"/g)) loads.push(m[1]);
      } else if (
        w.every((x) => x.q !== 0) &&
        !t.includes("/") &&
        // A later positional only counts when no flag precedes it (it might
        // be that flag's value: yq '.x' -o json is still a lone argument).
        (!yq || nullInput || words.some((v, j) => j > k + 1 && !/^-/.test(text(v)) && !/^-/.test(text(words[j - 1])) || (j === k + 1 && !/^-/.test(text(v)))))
      ) {
        w.forEach((x) => out.add(x));
      }
      break;
    }
  }
  return { filters: out, loads };
}

// jqStdinProgram(cmds) — whether jq (past wrappers) reads its program from
// stdin, a /dev or /proc file or a <(...) input: with -f / --from-file its
// first positional word is the program file. That text is never checked,
// and it can import or include a file (echo ... | base64 -d | jq -nf
// /dev/stdin). A program in a regular file (jq -f prog.jq) is like sh x.sh.
const JQ_TWO_VALUES = /^--(arg|argjson|slurpfile|rawfile)$/;
const JQ_ONE_VALUE = /^(-L|--indent)$/;
function jqStdinProgram(cmds) {
  return cmds.some((words) => {
    const ts = words.map(text);
    const i = commandWord(ts).i;
    if (!/(^|\/)jq$/.test(ts[i] || "")) return false;
    let fromFile = false;
    let program = null;
    for (let k = i + 1; k < ts.length; k++) {
      const t = ts[k];
      if (t === "--") {
        if (program === null) program = ts[k + 1] || "";
        break;
      }
      if (JQ_TWO_VALUES.test(t)) k += 2;
      else if (JQ_ONE_VALUE.test(t)) k++;
      else if (/^(-[A-Za-z]*f[A-Za-z]*|--from-file)$/.test(t)) fromFile = true;
      else if (!/^-./.test(t) && program === null) program = t;
    }
    return fromFile && program !== null && /^(\/dev\/|\/proc\/|-$|<)/.test(program);
  });
}

// SAFE_CONSUMERS — command words (basenames) that read stdin and never run
// it. Any other command that receives stdin (an unknown one, a $-word, or
// none past the wrappers) makes the quoted words that feed it count as
// commands: rechecking can only deny more. A listed consumer must never run,
// or hand to a program, what it reads (so not sed e, awk system(), sort
// --compress-program, tar -I, git aliases, less/more LESSOPEN, ack/ag --pager,
// rg --pre or RIPGREP_CONFIG_PATH, shasum as a Perl script under PERL5OPT,
// yq load(.) of a name read from stdin), nor open files named by what it
// reads (so not md5sum/sha1sum/sha256sum -c, GNU wc --files0-from=-).
const SAFE_CONSUMERS = new Set([
  "head", "tail", "uniq", "cut", "tr", "grep", "egrep", "fgrep", "jq",
  "cat", "tee", "column", "paste", "fold", "nl", "rev", "xxd", "hexdump", "od", "strings",
  "diff", "comm", "join", "base64", "gzip",
  "gunzip", "zcat", "pbcopy", "xclip", "xsel",
]);

// units(items) — the line as words ({w}) and operators ({op}) made of
// unquoted characters: | |& || && & ; newline ( ) ` $( and the redirections
// < << <<< > <( >(.
function units(items) {
  const out = [];
  let word = [];
  const flush = () => {
    if (word.length) out.push({ w: word });
    word = [];
  };
  const at = (k, c) => unq(items[k], c);
  for (let i = 0; i < items.length; i++) {
    const x = items[i];
    if (x.q !== 0 || !/[\s;&|<>()`]/.test(x.c)) {
      word.push(x);
      continue;
    }
    let op = x.c;
    if (op === "(" && unq(word[word.length - 1], "$")) {
      word.pop();
      op = "$(";
    }
    flush();
    if (/\s/.test(op)) {
      if (op === "\n") out.push({ op });
      continue;
    }
    const two = (c, as) => at(i + 1, c) && ((op = as), i++, true);
    if (op === "|") two("|", "||") || two("&", "|&");
    else if (op === "&") two("&", "&&") || two(">", ">");
    else if (op === "<") {
      if (at(i + 1, "<") && at(i + 2, "<")) {
        op = "<<<";
        i += 2;
      } else if (two("<", "<<")) {
        if (at(i + 1, "-")) i++;
      } else two("(", "<(") || two("&", "<") || two(">", "<");
    } else if (op === ">") two("(", ">(") || two(">", ">") || two("|", ">") || two("&", ">");
    out.push({ op });
  }
  flush();
  return out;
}

const OPENERS = new Set(["(", "$(", "<(", ">("]);
const REDIRECT = new Set(["<", "<<", "<<<", ">"]);
const STOP = new Set(["||", "&&", "&", ";", "\n", "`"]);
const OPEN_KW = /^(\{|if|case|while|until|for|select)$/;
const CLOSE_KW = /^(\}|fi|esac|done)$/;
// closeOf(U, k) — the index of the ) that closes the opener at U[k].
function closeOf(U, k) {
  for (let j = k + 1, depth = 0; j < U.length; j++) {
    if (OPENERS.has(U[j].op)) depth++;
    else if (U[j].op === ")" && depth-- === 0) return j;
  }
  return U.length;
}
// start(U, k, chain) — where the simple command holding U[k] starts (at a
// control operator or an opener), or with chain where its pipeline starts
// (past | and grouped commands: (...), { ...; }, if/case/loops).
function start(U, k, chain) {
  let depth = 0;
  for (let j = k - 1; j >= 0; j--) {
    const u = U[j];
    const kw = chain && u.w && (j === 0 || (U[j - 1].op && !REDIRECT.has(U[j - 1].op))) ? text(u.w) : "";
    if (u.op === ")" || CLOSE_KW.test(kw)) depth++;
    else if (OPENERS.has(u.op) || OPEN_KW.test(kw)) {
      if (!depth) return j + 1;
      depth--;
    } else if (!depth && (STOP.has(u.op) || (!chain && /^\|&?$/.test(u.op)))) return j + 1;
  }
  return 0;
}
// consumerSafe(U, s) — whether the command that starts at U[s] is in
// SAFE_CONSUMERS: its first word (past redirections) must be the listed
// name itself, bare or in a system bin directory. A ( or { group is never
// safe (a later command in it reads the same stdin), nor is a NAME=value
// prefix (it can make a listed tool run code), a wrapper (xargs cat turns
// stdin into names) or another path (./cat).
const SAFE_DIR = /^(|\/bin\/|\/usr\/bin\/|\/usr\/local\/bin\/|\/opt\/homebrew\/bin\/)$/;
function consumerSafe(U, s) {
  const ts = [];
  for (let j = s; j < U.length; j++) {
    const u = U[j];
    if (u.w) ts.push(text(u.w));
    else if (REDIRECT.has(u.op)) {
      if (U[j + 1] && U[j + 1].w) j++;
    } else if (OPENERS.has(u.op)) {
      if (!ts.length) return false;
      j = closeOf(U, j);
    } else break;
  }
  const c = ts[0];
  if (!c || !bare(c) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(c) || commandWord(ts).i !== 0) return false;
  const slash = c.lastIndexOf("/") + 1;
  return SAFE_DIR.test(c.slice(0, slash)) && SAFE_CONSUMERS.has(c.slice(slash));
}
// heredoc(U, k) — the body of the << at U[k]: from the next line to the
// line that is its delimiter word.
function heredoc(U, k) {
  const delim = U[k + 1] && U[k + 1].w ? text(U[k + 1].w) : null;
  let s = k + 1;
  while (s < U.length && U[s].op !== "\n") s++;
  s++;
  for (let j = s; j < U.length; j++) {
    const line = j === s || U[j - 1].op === "\n";
    if (line && U[j].w && text(U[j].w) === delim && (!U[j + 1] || U[j + 1].op === "\n")) return [s, j];
  }
  return [s, U.length];
}

// stdinFeeds(items, depth, opaque, filters) — for each command that gets
// stdin from a pipe (| |&), a redirection (< <<< <<), or a process
// substitution (<( >(), when it is not a SAFE_CONSUMER: check every quoted
// word upstream (the pipeline before it, the here-string or < word, the
// here-doc body, the <( body) as a command, unless all its quoted items are
// a known pattern, message or filter. A line that defines an alias (alias,
// shopt -s expand_aliases) has no safe consumer: cat may be an alias.
function stdinFeeds(items, depth, opaque, filters) {
  const U = units(items);
  const aliased = U.some((u) => u.w && /^(alias|expand_aliases)$/.test(text(u.w)));
  const done = new Set();
  for (let p = 0; p < U.length; p++) {
    const op = U[p].op;
    let from;
    let to = p;
    let consumer = p + 1;
    if (op === "|" || op === "|&" || op === ">(") from = start(U, p, true);
    else if (op === "<(") [from, to, consumer] = [p + 1, closeOf(U, p), start(U, p, false)];
    else if (op === "<" || op === "<<<") [from, to, consumer] = [p + 1, p + 2, start(U, p, false)];
    else if (op === "<<") [from, to, consumer] = [...heredoc(U, p), start(U, p, false)];
    else continue;
    if (!aliased && consumerSafe(U, consumer)) continue;
    for (let j = from; j < Math.min(to, U.length); j++) {
      const w = U[j].w;
      if (!w || done.has(j) || urlWord(w) || w.every((x) => x.q === 0 || opaque.has(x) || filters.has(x))) continue;
      done.add(j);
      const hit = recheck(text(w), depth);
      if (hit) return hit;
    }
  }
  return null;
}

function checkItems(items, depth) {
  const splice = spliceCheck(items);
  if (splice) return splice;
  const words = split(items, (x) => x.q === 0 && /[\s;&|<>()`]/.test(x.c));
  const cmds = commands(items);
  const opaque = opaqueItems(cmds);
  const { filters, loads } = filterItems(cmds);
  if (jqStdinProgram(cmds)) return "jq program read from stdin";
  const inner = nested(items, depth, cmds, opaque, filters);
  if (inner) return inner;
  const fed = stdinFeeds(items, depth, opaque, filters);
  if (fed) return fed;
  for (const sub of substitutions(items)) {
    const hit = recheck(sub, depth);
    if (hit) return hit;
  }
  for (const lit of loads) {
    const hit = denied(lexGlob(lit), false);
    if (hit) return hit;
  }
  const sep = tokenSep(opaque);
  const st = { n: 0, deny: null };
  const expanded = [];
  for (const w of words) braceExpand(w, expanded, st, false);
  if (st.deny) return st.deny;
  const seen = new Set();
  for (const w of expanded) {
    for (const tok of split(w, sep)) {
      const filter = tok.every((x) => filters.has(x));
      const key = (filter ? "f" : "t") + tok.map((x) => (isGlob(x) ? "\0" : "") + x.c).join("");
      if (seen.has(key)) continue;
      seen.add(key);
      const hit = denied(tok, filter);
      if (hit) return hit;
    }
  }
  return null;
}

// ansiSpells(body) — whether a numeric escape in a $'...' body (\xHH, \uHHHH,
// \UHHHHHHHH, octal \nnn) yields a printable ASCII character: lex() cannot
// decode it, and such a character can spell a name (\x2e is ".") or, in a
// nested shell, a glob or quote (sh -c $'cat .e\x2a'). A control character
// (an ANSI colour, \033) cannot. A code point past U+10FFFF counts too.
function ansiSpells(body) {
  const esc = /\\(?:x([0-9A-Fa-f]{1,2})|u([0-9A-Fa-f]{1,4})|U([0-9A-Fa-f]{1,8})|([0-7]{1,3})|[\s\S])/g;
  let e;
  while ((e = esc.exec(body))) {
    const hex = e[1] || e[2] || e[3];
    if (!hex && !e[4]) continue;
    const code = hex ? parseInt(hex, 16) : parseInt(e[4], 8);
    // An octal escape past \377 may wrap to its low byte (\456 is ".").
    for (const c of hex ? [code] : [code, code & 0xff]) {
      if (c > 0x10ffff || (c >= 0x20 && c <= 0x7e)) return true;
    }
  }
  return false;
}

function checkCommand(raw, depth) {
  const ansi = /\$'((?:[^'\\]|\\[\s\S])*)/g;
  let m;
  while ((m = ansi.exec(raw))) {
    if (ansiSpells(m[1])) return "$'...' escape";
  }
  const line = raw.replace(/\\\r?\n/g, "");
  const lexed = lex(line, true);
  if (lexed.open) return checkItems(lex(line, false).items, depth);
  const hit = checkItems(lexed.items, depth);
  if (hit) return hit;
  // A ' or " in a comment or a here-doc body opens no quote in bash, so a
  // later line may be unquoted: check the multi-line command unquoted too.
  if (/\n/.test(line) && (/(^|[\s;&|()<>])#/.test(line) || /<</.test(line))) {
    return checkItems(lex(line, false).items, depth);
  }
  return null;
}

const payload = JSON.parse(require("fs").readFileSync(0, "utf8"));
const args = (payload.toolCall && payload.toolCall.args) || {};
let hit = typeof args.CommandLine === "string" ? checkCommand(args.CommandLine, 0) : null;
if (!hit && typeof args.Cwd === "string" && args.Cwd) {
  const cwd = denied([...args.Cwd].map((c) => ({ c, q: 1 })));
  if (cwd) hit = cwd + " (Cwd " + args.Cwd + ")";
}
if (hit) process.stdout.write(hit + "\n");
JS

TOOL_NAME="$(agy_field 'toolCall.name' || true)"
TOOL_NAME="${TOOL_NAME//$'\n'/}"
TOOL_NAME="${TOOL_NAME//$'\r'/}"

# run_command: one node pass over the raw CommandLine (and Cwd). A node
# failure denies: this hook is the only read barrier for run_command on AGY.
if [ "$TOOL_NAME" = run_command ]; then
  rc=0
  pattern="$(printf '%s' "$AGY_PAYLOAD" |
    node -e "$PRIVACY_AGY_JS" "$PLUGIN_ROOT/lib/privacy-glob.cjs" 2>/dev/null)" || rc=$?
  if [ "$rc" -ne 0 ]; then
    pattern="privacy-block could not check the command"
  fi
  if [ -n "$pattern" ]; then
    command_line="$(agy_field 'toolCall.args.CommandLine' || true)"
    agy_emit_deny "Access to '$command_line' blocked by privacy-block. File matches sensitive pattern: $pattern"
    exit 0
  fi
  agy_emit_allow
  exit 0
fi

# bash 3.2 + set -u: skip empty lines from a blank path list.
path_list="$(agy_path_args || true)"
while IFS= read -r path || [ -n "${path:-}" ]; do
  [ -z "${path:-}" ] && continue

  pattern="$(privacy_agy_denied_pattern "$path" || true)"
  if [ -n "$pattern" ]; then
    agy_emit_deny "Access to '$path' blocked by privacy-block. File matches sensitive pattern: $pattern"
    exit 0
  fi
done <<< "$path_list"

agy_emit_allow
