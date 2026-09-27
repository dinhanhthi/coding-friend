#!/usr/bin/env bash
# Report which showcase dependencies are installed and what they make possible.
# Prints a yes/no table, install hints for anything missing, and a final line:
#   CAPABILITY: video=<yes|no> poster_png_pdf=<yes|no> audio=<yes|no>
# Always exits 0: the caller decides what to do with the result.
set -u

OS="$(uname -s 2>/dev/null || echo unknown)"
case "$OS" in
  Darwin) PLATFORM=mac ;;
  Linux) PLATFORM=linux ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM=windows ;;
  *) PLATFORM=other ;;
esac

row() { printf '%-8s %-4s %s\n' "$1" "$2" "$3"; }

hint() {
  case "$PLATFORM" in
    mac) echo "  install $1: $2" ;;
    linux) echo "  install $1: $3" ;;
    windows) echo "  install $1: $4" ;;
    *) echo "  install $1: $2 | $3 | $4" ;;
  esac
}

# node
NODE_OK=no; NODE_INFO="not found"; NODE_OLD=no
if command -v node >/dev/null 2>&1; then
  NODE_OK=yes
  NODE_VER="$(node --version 2>/dev/null)"
  NODE_INFO="$(command -v node) $NODE_VER"
  NODE_MAJOR="$(echo "$NODE_VER" | sed 's/^v//; s/\..*//')"
  case "$NODE_MAJOR" in
    ''|*[!0-9]*) ;;
    *) [ "$NODE_MAJOR" -lt 18 ] && NODE_OLD=yes ;;
  esac
fi

# ffmpeg / ffprobe
FFMPEG_OK=no; FFMPEG_INFO="not found"
if command -v ffmpeg >/dev/null 2>&1; then
  FFMPEG_OK=yes
  FFMPEG_INFO="$(command -v ffmpeg) $(ffmpeg -version 2>/dev/null | head -1 | awk '{print $3}')"
fi
FFPROBE_OK=no; FFPROBE_INFO="not found"
if command -v ffprobe >/dev/null 2>&1; then
  FFPROBE_OK=yes
  FFPROBE_INFO="$(command -v ffprobe)"
fi

# chrome: same order as templates/capture.mjs
CHROME_OK=no; CHROME_INFO="not found"
found_chrome() { CHROME_OK=yes; CHROME_INFO="$1"; }
if [ -n "${CHROME_PATH:-}" ]; then
  if [ -e "$CHROME_PATH" ]; then found_chrome "$CHROME_PATH (CHROME_PATH)"
  else CHROME_INFO="CHROME_PATH points to a missing file: $CHROME_PATH"; fi
else
  case "$PLATFORM" in
    mac)
      for app in "Google Chrome.app/Contents/MacOS/Google Chrome" \
                 "Chromium.app/Contents/MacOS/Chromium" \
                 "Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary" \
                 "Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
        for root in "/Applications" "$HOME/Applications"; do
          if [ "$CHROME_OK" = no ] && [ -e "$root/$app" ]; then found_chrome "$root/$app"; fi
        done
      done
      ;;
    linux)
      for name in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge; do
        if [ "$CHROME_OK" = no ] && command -v "$name" >/dev/null 2>&1; then
          found_chrome "$(command -v "$name")"
        fi
      done
      ;;
    windows)
      PF86="$(printenv 'ProgramFiles(x86)' 2>/dev/null || printenv 'PROGRAMFILES(X86)' 2>/dev/null || true)"
      for root in "${PROGRAMFILES:-}" "$PF86" "${LOCALAPPDATA:-}"; do
        [ -n "$root" ] || continue
        if command -v cygpath >/dev/null 2>&1; then root="$(cygpath -u "$root")"; fi
        for exe in "Google/Chrome/Application/chrome.exe" "Microsoft/Edge/Application/msedge.exe"; do
          if [ "$CHROME_OK" = no ] && [ -e "$root/$exe" ]; then found_chrome "$root/$exe"; fi
        done
      done
      ;;
  esac
fi

# python3 / numpy
PY_OK=no; PY_INFO="not found"
if command -v python3 >/dev/null 2>&1; then
  PY_OK=yes
  PY_INFO="$(command -v python3) $(python3 --version 2>&1 | awk '{print $2}')"
fi
NUMPY_OK=no; NUMPY_INFO="not found"
if [ "$PY_OK" = yes ] && python3 -c "import numpy" >/dev/null 2>&1; then
  NUMPY_OK=yes
  NUMPY_INFO="$(python3 -c "import numpy; print(numpy.__version__)" 2>/dev/null)"
fi

row DEP OK INFO
row node "$NODE_OK" "$NODE_INFO"
row ffmpeg "$FFMPEG_OK" "$FFMPEG_INFO"
row ffprobe "$FFPROBE_OK" "$FFPROBE_INFO"
row chrome "$CHROME_OK" "$CHROME_INFO"
row python3 "$PY_OK" "$PY_INFO"
row numpy "$NUMPY_OK" "$NUMPY_INFO"
echo

if [ "$NODE_OLD" = yes ]; then
  echo "WARN: node $NODE_VER is older than 18; puppeteer-core needs Node.js 18 or newer."
fi
[ "$NODE_OK" = yes ] || hint node "brew install node" "sudo apt install nodejs npm" "winget install OpenJS.NodeJS.LTS"
if [ "$FFMPEG_OK" = no ] || [ "$FFPROBE_OK" = no ]; then
  hint "ffmpeg (includes ffprobe)" "brew install ffmpeg" "sudo apt install ffmpeg" "winget install Gyan.FFmpeg"
fi
if [ "$CHROME_OK" = no ]; then
  hint chrome "brew install --cask google-chrome" "sudo apt install chromium (or install Google Chrome)" "winget install Google.Chrome"
  echo "  or set CHROME_PATH=/path/to/chrome"
fi
[ "$PY_OK" = yes ] || hint python3 "brew install python" "sudo apt install python3" "winget install Python.Python.3.12"
if [ "$NUMPY_OK" = no ]; then
  hint numpy "python3 -m pip install numpy" "sudo apt install python3-numpy (or python3 -m pip install numpy)" "py -m pip install numpy"
fi

yn() { if "$@"; then echo yes; else echo no; fi; }
all_yes() { for v in "$@"; do [ "$v" = yes ] || return 1; done; return 0; }
VIDEO="$(yn all_yes "$NODE_OK" "$FFMPEG_OK" "$FFPROBE_OK" "$CHROME_OK")"
POSTER="$(yn all_yes "$NODE_OK" "$CHROME_OK")"
AUDIO="$(yn all_yes "$PY_OK" "$NUMPY_OK")"
echo "CAPABILITY: video=$VIDEO poster_png_pdf=$POSTER audio=$AUDIO"
exit 0
