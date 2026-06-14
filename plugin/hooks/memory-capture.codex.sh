#!/usr/bin/env bash
# Codex PreCompact auto-capture: save a lightweight episode memory from Codex JSONL.
# Only active when memory.autoCapture is enabled.

set -euo pipefail

INPUT=$(cat)
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-${PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}}"

# shellcheck source=../lib/cf-paths.sh
source "$PLUGIN_ROOT/lib/cf-paths.sh"
cf_resolve_paths

CONFIG_FILE="$CF_CONFIG_FILE"
AUTO_CAPTURE="false"

if [[ -f "$CONFIG_FILE" ]]; then
  AUTO_CAPTURE=$(CF_CONFIG_FILE="$CONFIG_FILE" node -e "
    try {
      const c = JSON.parse(require('fs').readFileSync(process.env.CF_CONFIG_FILE,'utf8'));
      console.log(c.memory?.autoCapture ? 'true' : 'false');
    } catch { console.log('false'); }
  " 2>/dev/null || echo "false")
fi

if [[ "$AUTO_CAPTURE" != "true" ]]; then
  exit 0
fi

TMP_INPUT=$(mktemp "${TMPDIR:-/tmp}/cf-codex-memory-input.XXXXXX")
trap 'rm -f "$TMP_INPUT"' EXIT
printf '%s' "$INPUT" > "$TMP_INPUT"

CF_HOOK_INPUT_FILE="$TMP_INPUT" \
CF_DOCS_ROOT="$CF_DOCS_ROOT" \
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}" \
node <<'NODE'
const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

// Sessions live under CODEX_HOME/sessions/YYYY/MM/DD/*.jsonl. This runs on a
// synchronous PreCompact hook, so walk date directories newest-first and stop
// at the first match instead of reading the whole tree.
function listDirsDesc(dir) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

function findTranscriptInDay(dayDir, sessionId) {
  let entries;
  try {
    entries = fs.readdirSync(dayDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const files = entries.filter(
    (entry) => entry.isFile() && entry.name.endsWith(".jsonl"),
  );
  // Codex rollout filenames usually embed the session id — match those
  // without reading file contents.
  const byName = files.find((entry) => entry.name.includes(sessionId));
  if (byName) return path.join(dayDir, byName.name);
  for (const entry of files) {
    const full = path.join(dayDir, entry.name);
    try {
      if (fs.readFileSync(full, "utf8").includes(sessionId)) return full;
    } catch {
      // ignore unreadable files
    }
  }
  return null;
}

function findTranscript(sessionId) {
  if (!sessionId) return null;
  const sessionsDir = path.join(process.env.CODEX_HOME || "", "sessions");
  for (const year of listDirsDesc(sessionsDir)) {
    const yearDir = path.join(sessionsDir, year);
    for (const month of listDirsDesc(yearDir)) {
      const monthDir = path.join(yearDir, month);
      for (const day of listDirsDesc(monthDir)) {
        const found = findTranscriptInDay(path.join(monthDir, day), sessionId);
        if (found) return found;
      }
    }
  }
  return null;
}

function extractText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    for (const key of ["text", "message", "content", "output", "summary"]) {
      const text = extractText(value[key]);
      if (text) return text;
    }
  }
  return "";
}

function truncate(text, max = 700) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}...` : cleaned;
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function slugify(value) {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
  return slug || "codex-session";
}

function parseTranscript(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\n/).filter(Boolean);
  const snippets = [];
  let cwd = "";
  let timestamp = "";

  for (const line of lines) {
    let item;
    try {
      item = JSON.parse(line);
    } catch {
      continue;
    }
    const payload = item.payload || {};

    if (item.type === "session_meta") {
      cwd = payload.cwd || cwd;
      timestamp = payload.timestamp || timestamp;
      continue;
    }

    let label = item.type || "entry";
    let text = "";
    if (item.type === "response_item") {
      label = payload.type || label;
      if (payload.type === "reasoning") continue;
      text = extractText(payload);
    } else if (item.type === "event_msg") {
      label = payload.type || label;
      text = extractText(payload);
    } else {
      text = extractText(payload);
    }

    text = truncate(text);
    if (text) snippets.push({ label, text });
    if (snippets.length >= 16) break;
  }

  return { snippets, cwd, timestamp };
}

const input = readJson(process.env.CF_HOOK_INPUT_FILE) || {};
const sessionId = input.session_id || input.sessionId || "";
const transcriptPath =
  input.transcript_path && fs.existsSync(input.transcript_path)
    ? input.transcript_path
    : findTranscript(sessionId);

if (!transcriptPath) process.exit(0);

const { snippets, cwd, timestamp } = parseTranscript(transcriptPath);
if (snippets.length === 0) process.exit(0);

const created = new Date().toISOString().slice(0, 16).replace("T", " ");
const titleSeed =
  snippets.find((s) => s.label.includes("user"))?.text || snippets[0].text;
const title = `Codex session: ${truncate(titleSeed, 70)}`;
const description = truncate(titleSeed, 100);
const memoryDir = path.join(process.env.CF_DOCS_ROOT, "memory", "bugs");
fs.mkdirSync(memoryDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
const sessionSuffix = sessionId ? `-${slugify(sessionId).slice(0, 12)}` : "";
const filePath = path.join(
  memoryDir,
  `${slugify(title)}-${stamp}${sessionSuffix}.md`,
);

const body = [
  "---",
  `title: ${yamlString(title)}`,
  `description: ${yamlString(description)}`,
  "tags: [codex, auto-capture, session]",
  `created: ${yamlString(created)}`,
  `updated: ${yamlString(created)}`,
  "type: episode",
  "importance: 2",
  "source: auto-capture",
  "---",
  "",
  `# ${title}`,
  "",
  "## Session",
  "",
  `- Session ID: ${sessionId || "unknown"}`,
  `- CWD: ${cwd || input.cwd || "unknown"}`,
  `- Transcript: ${transcriptPath}`,
  timestamp ? `- Transcript timestamp: ${timestamp}` : "",
  "",
  "## Captured Signals",
  "",
  ...snippets.map((snippet) => `- ${snippet.label}: ${snippet.text}`),
  "",
].filter((line) => line !== "");

fs.writeFileSync(filePath, `${body.join("\n")}\n`);
NODE
