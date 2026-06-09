#!/usr/bin/env bash
# normalize-codex-review.sh — convert a raw `codex review` result into the
# standard Coding Friend 4-section format the reducer expects.
# Usage: bash normalize-codex-review.sh <raw-codex-result-file>
#
# Codex output shape (verified, CLI v0.130.0):
#   <summary paragraph(s)>
#
#   Full review comments:
#
#   - [P1] <title> — /abs/path/file.js:2-2
#     <explanation, possibly multi-line, indented>
#   - [P2] ...
#
# Severity mapping: [P1] → 🚨 Critical, [P2] → ⚠️ Important, [P3] → 💡 Suggestion.
# Every finding is tagged [Codex] for provenance.
#
# If no [P#] findings parse but the file is non-empty, the whole text is emitted
# under Summary with a 💡 note — content is never dropped.

set -u

RAW_FILE="${1:-}"
if [ -z "$RAW_FILE" ] || [ ! -f "$RAW_FILE" ]; then
  echo "normalize-codex-review: missing or unreadable result file: ${RAW_FILE:-<none>}" >&2
  exit 2
fi

awk '
  function flush_finding() {
    if (cur_sev == "") return
    line = "- **[Codex]** [" cur_loc "] " cur_title
    if (cur_expl != "") line = line " — " cur_expl
    # P2 → Important, P3 → Suggestion. Anything else (P1, P0, or an unknown
    # scheme) maps to Critical so an unexpected top severity fails loud, never
    # silently demoted to a Suggestion.
    if (cur_sev == "P2")      imp[++ni]  = line
    else if (cur_sev == "P3") sug[++ns]  = line
    else                      crit[++nc] = line
    cur_sev = ""; cur_title = ""; cur_loc = ""; cur_expl = ""
  }

  BEGIN { in_comments = 0; nc = 0; ni = 0; ns = 0; nsum = 0; found_any = 0 }

  # Marker line that precedes the structured bullets.
  /^[[:space:]]*Full review comments:[[:space:]]*$/ { flush_finding(); in_comments = 1; next }

  # A finding bullet: "- [P1] <title> — <loc>"  (loc = trailing path:line after em/hyphen dash)
  /^[[:space:]]*-[[:space:]]*\[P[0-9]\]/ {
    flush_finding()
    found_any = 1
    line = $0
    sub(/^[[:space:]]*-[[:space:]]*/, "", line)        # strip leading "- "
    match(line, /\[P[0-9]\]/)
    cur_sev = substr(line, RSTART + 1, 2)              # "P1" / "P2" / "P3"
    rest = substr(line, RSTART + RLENGTH)
    sub(/^[[:space:]]*/, "", rest)
    # Split "<title> — <loc>" on the LAST " — " (em dash) or " - " (hyphen) separator.
    # The em dash is the UTF-8 byte sequence e2 80 94, surrounded by spaces → 5 bytes total.
    sep_pos = 0; sep_len = 0
    n = length(rest)
    emdash = " " sprintf("%c%c%c", 226, 128, 148) " "   # " \xe2\x80\x94 "
    for (i = 1; i <= n - 2; i++) {
      if (substr(rest, i, 5) == emdash) { sep_pos = i; sep_len = 5 }
      else if (substr(rest, i, 3) == " - ") { sep_pos = i; sep_len = 3 }
    }
    if (sep_pos > 0) {
      cur_title = substr(rest, 1, sep_pos - 1)
      cur_loc   = substr(rest, sep_pos + sep_len)
    } else {
      cur_title = rest
      cur_loc   = "location not specified"
    }
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", cur_title)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", cur_loc)
    next
  }

  # Indented continuation line = explanation for the current finding.
  {
    if (cur_sev != "" && $0 ~ /^[[:space:]]+[^[:space:]]/) {
      expl = $0
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", expl)
      if (expl != "") cur_expl = (cur_expl == "" ? expl : cur_expl " " expl)
      next
    }
    s = $0
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", s)
    if (s == "") next
    # Pre-marker, non-blank lines form the summary paragraph.
    if (in_comments == 0) summary[++nsum] = s
    # Post-marker non-finding lines are held aside; only surfaced if no finding
    # parsed (so we never drop content on a parse miss — see plan "never drop").
    else tail[++ntail] = s
  }

  END {
    flush_finding()
    # Parse miss: marker present but no [P#] bullets → fold held lines into summary.
    if (!found_any) for (i = 1; i <= ntail; i++) summary[++nsum] = tail[i]

    print "## 🔍 Codex Review"
    print ""
    print "### 🚨 Critical Issues"
    if (nc == 0) print "None."
    else for (i = 1; i <= nc; i++) print crit[i]
    print ""
    print "### ⚠️ Important Issues"
    if (ni == 0) print "None."
    else for (i = 1; i <= ni; i++) print imp[i]
    print ""
    print "### 💡 Suggestions"
    if (ns == 0 && found_any) print "None."
    else if (ns > 0) for (i = 1; i <= ns; i++) print sug[i]
    if (!found_any) {
      if (nsum > 0) print "- **[Codex]** Codex returned unstructured output (see Summary below)."
      else print "- **[Codex]** Codex returned no parseable findings and no output."
    }
    print ""
    print "### 📋 Summary"
    if (nsum == 0) print "Codex review: (no summary text returned)."
    else {
      printf "Codex review: "
      for (i = 1; i <= nsum; i++) printf "%s%s", summary[i], (i < nsum ? " " : "\n")
    }
  }
' "$RAW_FILE"
