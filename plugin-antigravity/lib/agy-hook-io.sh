#!/usr/bin/env bash
# agy-hook-io.sh — Antigravity hook stdin/stdout helpers.
#
# Source this file from `.agy.sh` adapters. Do not execute it.
# Never exit non-zero on parse failure (fail-open). Security callers
# (privacy-block, scout-block) decide deny/allow themselves.
#
# Requires node for JSON parse/escape. Missing or broken node yields
# empty field/path output and still-valid emit JSON.

# agy_read_payload — read hook stdin into AGY_PAYLOAD (raw JSON text).
agy_read_payload() {
  AGY_PAYLOAD="$(cat || true)"
}

# agy_field <jsonpath> — print a primitive (or JSON for objects) at a
# dot-path such as toolCall.name, invocationNum, workspacePaths.0.
# Bracket indexes (workspacePaths[0]) are accepted. Missing/invalid → empty.
agy_field() {
  printf '%s' "${AGY_PAYLOAD-}" | AGY_JSONPATH="${1-}" node -e '
    const fs = require("fs");
    let s = "";
    try { s = fs.readFileSync(0, "utf8"); } catch {}
    let j;
    try { j = JSON.parse(s); } catch { process.exit(0); }
    const path = process.env.AGY_JSONPATH || "";
    if (!path) process.exit(0);
    const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
    let cur = j;
    for (const k of keys) {
      if (cur == null) process.exit(0);
      cur = cur[k];
    }
    if (cur == null) process.exit(0);
    const out = (typeof cur === "object") ? JSON.stringify(cur) : String(cur);
    process.stdout.write(out + "\n");
  ' 2>/dev/null || true
}

# agy_path_args — print documented path-key strings under toolCall.args,
# one per line. Keys: AbsolutePath, TargetFile, SearchPath,
# SearchDirectory, DirectoryPath, Pattern, Cwd, CommandLine. Nested
# objects/arrays are walked so ReplacementChunks[].TargetFile is
# collected; CodeContent, Query, and other non-path strings are skipped.
# For run_command, CommandLine is always included even when it is not
# path-like (`cat .env`). Keep in sync with extractAgyPaths in
# plugin/hooks/scout-block.agy.cjs.
agy_path_args() {
  printf '%s' "${AGY_PAYLOAD-}" | node -e '
    const fs = require("fs");
    let s = "";
    try { s = fs.readFileSync(0, "utf8"); } catch {}
    let j;
    try { j = JSON.parse(s); } catch { process.exit(0); }
    const PATH_KEYS = {
      AbsolutePath: 1,
      TargetFile: 1,
      SearchPath: 1,
      SearchDirectory: 1,
      DirectoryPath: 1,
      Pattern: 1,
      Cwd: 1,
      CommandLine: 1,
    };
    function collect(v, out, key) {
      if (typeof v === "string") {
        if (v && key && PATH_KEYS[key]) out.push(v);
        return;
      }
      if (Array.isArray(v)) {
        for (const x of v) collect(x, out, key);
        return;
      }
      if (v && typeof v === "object") {
        for (const k of Object.keys(v)) collect(v[k], out, k);
      }
    }
    const toolCall = j && j.toolCall;
    const args = toolCall && toolCall.args;
    const out = [];
    collect(args, out);
    if (
      toolCall &&
      toolCall.name === "run_command" &&
      args &&
      typeof args.CommandLine === "string" &&
      args.CommandLine
    ) {
      if (out.indexOf(args.CommandLine) === -1) out.push(args.CommandLine);
    }
    if (out.length) process.stdout.write(out.join("\n") + "\n");
  ' 2>/dev/null || true
}

agy_emit_allow() {
  printf '%s\n' '{"decision":"allow"}'
}

# agy_emit_deny <reason> — {"decision":"deny","reason":"..."} (JSON-escaped).
agy_emit_deny() {
  local out=""
  out="$(printf '%s' "${1-}" | node -e '
    const fs = require("fs");
    let s = "";
    try { s = fs.readFileSync(0, "utf8"); } catch {}
    process.stdout.write(JSON.stringify({ decision: "deny", reason: s }));
  ' 2>/dev/null)" || out=""
  if [ -z "$out" ]; then
    out='{"decision":"deny","reason":""}'
  fi
  printf '%s\n' "$out"
}

# agy_emit_ask <reason> — {"decision":"ask","reason":"..."} (JSON-escaped).
agy_emit_ask() {
  local out=""
  out="$(printf '%s' "${1-}" | node -e '
    const fs = require("fs");
    let s = "";
    try { s = fs.readFileSync(0, "utf8"); } catch {}
    process.stdout.write(JSON.stringify({ decision: "ask", reason: s }));
  ' 2>/dev/null)" || out=""
  if [ -z "$out" ]; then
    out='{"decision":"ask","reason":""}'
  fi
  printf '%s\n' "$out"
}

agy_emit_empty() {
  printf '%s\n' '{}'
}

# agy_emit_inject <text> — PreInvocation injectSteps with escaped text.
agy_emit_inject() {
  local out=""
  out="$(printf '%s' "${1-}" | node -e '
    const fs = require("fs");
    let s = "";
    try { s = fs.readFileSync(0, "utf8"); } catch {}
    process.stdout.write(JSON.stringify({ injectSteps: [{ ephemeralMessage: s }] }));
  ' 2>/dev/null)" || out=""
  if [ -z "$out" ]; then
    out='{"injectSteps":[{"ephemeralMessage":""}]}'
  fi
  printf '%s\n' "$out"
}
