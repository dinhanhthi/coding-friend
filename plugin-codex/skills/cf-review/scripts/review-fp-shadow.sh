#!/usr/bin/env bash
# review-fp-shadow.sh — opt-in shadow check of a finished $cf-review report:
# asks `cf decide review-fp` whether each finding shows in the code, and the
# CLI only LOGS the answers. Purely observational.
#
# Usage:
#   bash review-fp-shadow.sh --check
#   bash review-fp-shadow.sh --snapshot-dir <dir> --report <file>
#
# --check reads ONLY the global config ($HOME/.coding-friend/config.json) with
# one `node -e`: on when decision.provider is a string other than "off" AND
# decision.reviewShadow is true; only then is `cf` looked up on PATH. When the
# shadow is off it costs one node call and never spawns `cf`.
#
# Run mode calls `cf decide review-fp` under run-with-timeout.sh (25s), throws
# its output away and reports only whether a Coding Friend envelope came back
# with ok:true and data.ok:true (any other `cf`, e.g. Cloud Foundry, is skipped).
#
# Every `cf` call carries --json: the CLI's postAction auto-update hook skips
# JSON runs, so a review never triggers an update check or `npm install -g`.
#
# Env: HOME (locates the global config).
#
# Output: one line — SHADOW=on|off (--check), SHADOW=logged|skipped (run).
#
# Exit: always 0. Fail-open: this never changes the report, the review status,
# the fix loop or the commit gate.

set -u

SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
[ "$SCRIPT_DIR" = "${BASH_SOURCE[0]}" ] && SCRIPT_DIR="."
SCRIPT_DIR=$(cd "$SCRIPT_DIR" && pwd)
SHADOW_SECS=25

# Single-quoted so bash 3.2 parses it verbatim: double quotes only inside.
CONFIG_JS='const fs = require("fs");
let d = null;
try { d = JSON.parse(fs.readFileSync(process.argv[1], "utf8")).decision; } catch (e) {}
const on = Boolean(d) && typeof d === "object" && typeof d.provider === "string"
  && d.provider !== "off" && d.reviewShadow === true;
process.stdout.write(on ? "on" : "off");
'

ENVELOPE_JS='let e = null;
try { e = JSON.parse(require("fs").readFileSync(0, "utf8").trim()); } catch (err) {}
const ok = Boolean(e) && e.contractVersion === 1 && e.ok === true
  && Boolean(e.data) && e.data.ok === true;
process.stdout.write(ok ? "logged" : "skipped");
'

shadow_on() {
  local node_bin state
  [ -n "${HOME:-}" ] || return 1
  node_bin="$(command -v node 2>/dev/null)" || return 1
  state="$("$node_bin" -e "$CONFIG_JS" -- "$HOME/.coding-friend/config.json" 2>/dev/null)" || return 1
  [ "$state" = "on" ] || return 1
  command -v cf >/dev/null 2>&1
}

check=0
snapshot_dir=""
report=""
bad=0
while [ $# -gt 0 ]; do
  case "$1" in
    --check) check=1 ;;
    --snapshot-dir | --report)
      case "${2-}" in
        "" | -*) bad=1 ;;
        *)
          if [ "$1" = "--report" ]; then report="$2"; else snapshot_dir="$2"; fi
          shift
          ;;
      esac
      ;;
    *) bad=1 ;;
  esac
  shift
done

if [ "$check" = 1 ]; then
  if shadow_on; then echo "SHADOW=on"; else echo "SHADOW=off"; fi
  exit 0
fi

if [ "$bad" = 1 ] || [ -z "$snapshot_dir" ] || [ -z "$report" ] || ! shadow_on; then
  echo "SHADOW=skipped"
  exit 0
fi

out="$(bash "$SCRIPT_DIR/run-with-timeout.sh" "$SHADOW_SECS" \
  cf decide review-fp --json --snapshot-dir "$snapshot_dir" --report "$report" \
  </dev/null 2>/dev/null)"
result="$(printf '%s' "$out" | node -e "$ENVELOPE_JS" 2>/dev/null)"
[ "$result" = "logged" ] || result="skipped"
echo "SHADOW=$result"
exit 0
