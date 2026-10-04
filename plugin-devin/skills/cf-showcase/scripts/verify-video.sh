#!/usr/bin/env bash
# Probe a rendered showcase video.
# Usage: verify-video.sh <file> [--duration S] [--fps 60] [--size WxH] [--max-mb 50] [--tolerance 0.1]
# Checks duration, fps, resolution, audio stream, black frames outside fades,
# loudness (when audio exists) and file size. Prints PASS/FAIL/WARN per check.
# Exit 0 = all checks passed, 1 = at least one FAIL, 2 = cannot run (bad args, missing file or tool).
set -u

usage() {
  echo "usage: verify-video.sh <file> [--duration S] [--fps 60] [--size WxH] [--max-mb 50] [--tolerance 0.1]" >&2
  exit 2
}

FILE=""; WANT_DUR=""; WANT_FPS=60; WANT_SIZE=""; MAX_MB=50; TOL=0.1
while [ $# -gt 0 ]; do
  case "$1" in
    --duration) [ $# -ge 2 ] || usage; WANT_DUR="$2"; shift 2 ;;
    --fps) [ $# -ge 2 ] || usage; WANT_FPS="$2"; shift 2 ;;
    --size) [ $# -ge 2 ] || usage; WANT_SIZE="$2"; shift 2 ;;
    --max-mb) [ $# -ge 2 ] || usage; MAX_MB="$2"; shift 2 ;;
    --tolerance) [ $# -ge 2 ] || usage; TOL="$2"; shift 2 ;;
    -h|--help) usage ;;
    -*) echo "unknown flag: $1" >&2; usage ;;
    *) [ -z "$FILE" ] || usage; FILE="$1"; shift ;;
  esac
done

[ -n "$FILE" ] || usage
if [ ! -f "$FILE" ]; then echo "error: file not found: $FILE" >&2; exit 2; fi
for tool in ffprobe ffmpeg; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "error: $tool not found on PATH (brew install ffmpeg | sudo apt install ffmpeg | winget install Gyan.FFmpeg)" >&2
    exit 2
  fi
done

FAILS=0; WARNS=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; FAILS=$((FAILS + 1)); }
warn() { echo "WARN  $1"; WARNS=$((WARNS + 1)); }
info() { echo "INFO  $1"; }
# awk-based float test: fcmp "<expr>" -> exit 0 when true
fcmp() { awk "BEGIN { exit !($1) }"; }

probe() { ffprobe -v error "$@" -of default=noprint_wrappers=1:nokey=1 "$FILE" 2>/dev/null | head -1; }

DUR="$(probe -show_entries format=duration)"
WIDTH="$(probe -select_streams v:0 -show_entries stream=width)"
HEIGHT="$(probe -select_streams v:0 -show_entries stream=height)"
RATE="$(probe -select_streams v:0 -show_entries stream=r_frame_rate)"
AUDIO_STREAMS="$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$FILE" 2>/dev/null | wc -l | tr -d ' ')"

echo "file: $FILE"
if [ -z "$WIDTH" ] || [ -z "$DUR" ]; then
  fail "ffprobe: no readable video stream"
  echo "SUMMARY: FAIL ($FAILS failed)"
  exit 1
fi

# duration
if [ -n "$WANT_DUR" ]; then
  if fcmp "($DUR - $WANT_DUR) <= $TOL && ($WANT_DUR - $DUR) <= $TOL"; then
    pass "duration ${DUR}s (want ${WANT_DUR}s +/- ${TOL}s)"
  else
    fail "duration ${DUR}s (want ${WANT_DUR}s +/- ${TOL}s)"
  fi
else
  info "duration ${DUR}s (no --duration given)"
fi

# fps
FPS="$(echo "$RATE" | awk -F/ '{ if ($2 == "" || $2 == 0) print $1; else printf "%.3f", $1 / $2 }')"
if fcmp "($FPS - $WANT_FPS) < 0.01 && ($WANT_FPS - $FPS) < 0.01"; then
  pass "fps $RATE (want $WANT_FPS)"
else
  fail "fps $RATE = $FPS (want $WANT_FPS)"
fi

# size
if [ -n "$WANT_SIZE" ]; then
  if [ "${WIDTH}x${HEIGHT}" = "$WANT_SIZE" ]; then
    pass "size ${WIDTH}x${HEIGHT}"
  else
    fail "size ${WIDTH}x${HEIGHT} (want $WANT_SIZE)"
  fi
else
  info "size ${WIDTH}x${HEIGHT} (no --size given)"
fi

# audio stream
if [ "$AUDIO_STREAMS" -gt 0 ]; then
  info "audio stream: yes"
else
  info "audio stream: no (silent video)"
fi

# black frames: a segment touching the first or last 0.5 s is a fade and allowed only
# when it lasts at most 1.5 s; any interior segment, or a longer edge segment, fails
BLACK="$(ffmpeg -hide_banner -nostats -i "$FILE" -vf blackdetect=d=0.25:pix_th=0.10 -an -f null - 2>&1 \
  | grep -o 'black_start:[0-9.e+-]* black_end:[0-9.e+-]*' \
  | sed 's/black_start://; s/black_end://')"
BAD_BLACK=""
if [ -n "$BLACK" ]; then
  BAD_BLACK="$(echo "$BLACK" | awk -v d="$DUR" '{ edge = ($1 <= 0.5 || $2 >= d - 0.5) }
    !edge || ($2 - $1) > 1.5 { printf "%s-%ss ", $1, $2 }')"
fi
if [ -n "$BAD_BLACK" ]; then
  fail "black frames outside short start/end fades: $BAD_BLACK"
elif [ -n "$BLACK" ]; then
  pass "black frames only in short start/end fades (<= 1.5s)"
else
  pass "no black frames"
fi

# loudness
if [ "$AUDIO_STREAMS" -gt 0 ]; then
  LOUD="$(ffmpeg -hide_banner -nostats -i "$FILE" -filter_complex ebur128=peak=true -f null - 2>&1)"
  LUFS="$(echo "$LOUD" | awk '/Integrated loudness:/ { f = 1 } f && /I:/ { v = $2; f = 0 } END { print v }')"
  PEAK="$(echo "$LOUD" | awk '/True peak:/ { f = 1 } f && /Peak:/ { v = $2; f = 0 } END { print v }')"
  if [ -z "$LUFS" ]; then
    warn "loudness: could not read ebur128 output"
  elif fcmp "$LUFS >= -20 && $LUFS <= -14"; then
    pass "loudness ${LUFS} LUFS, true peak ${PEAK:-?} dBFS (target -20..-14)"
  else
    warn "loudness ${LUFS} LUFS, true peak ${PEAK:-?} dBFS (outside -20..-14; adjust audio.py --lufs)"
  fi
fi

# file size
BYTES="$(wc -c < "$FILE" | tr -d ' ')"
MB="$(awk -v b="$BYTES" 'BEGIN { printf "%.2f", b / 1048576 }')"
if fcmp "$BYTES <= $MAX_MB * 1048576"; then
  pass "file size ${MB} MB (max $MAX_MB MB)"
else
  fail "file size ${MB} MB (max $MAX_MB MB; re-encode with a higher CRF)"
fi

if [ "$FAILS" -gt 0 ]; then
  echo "SUMMARY: FAIL ($FAILS failed, $WARNS warnings)"
  exit 1
fi
echo "SUMMARY: PASS ($WARNS warnings)"
exit 0
