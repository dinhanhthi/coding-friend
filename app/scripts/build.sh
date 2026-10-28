#!/usr/bin/env bash
#
# Build "Coding Friend.app" (and its .dmg) with the Tauri CLI.
#
#   bash scripts/build.sh [extra tauri build args]    # e.g. --debug --bundles app
#
# - Universal (arm64 + x86_64) when both rustup targets are installed, else the
#   host architecture only.
# - Ad-hoc signed ("-" in tauri.conf.json) unless APPLE_SIGNING_IDENTITY is set.
# - Updater artifacts (.app.tar.gz + .sig) only when a Tauri signing key is in
#   the environment. This script never reads or prints the key or its password.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

app_name="Coding Friend.app"
want=(aarch64-apple-darwin x86_64-apple-darwin)

# --- targets ----------------------------------------------------------------
# A missing target degrades to a single-arch build with a warning. Without
# rustup (a Homebrew toolchain, say) only rustc's own host triple is available.
if command -v rustup >/dev/null 2>&1; then
	installed="$(rustup target list --installed)"
else
	echo "warning: rustup not found — only this Mac's own target is available" >&2
	installed="$(rustc -vV | sed -n 's/^host: //p')"
fi
n=0
for t in "${want[@]}"; do
	if grep -qx "$t" <<<"$installed"; then
		n=$((n + 1))
	else
		echo "warning: target $t is not installed — 'rustup target add $t' to include it" >&2
	fi
done
if [ "$n" -eq 0 ]; then
	echo "error: no macOS target installed" >&2
	exit 1
fi
universal=0
if [ "$n" -eq "${#want[@]}" ]; then
	universal=1
else
	echo "warning: the bundle will NOT be universal (host architecture only)" >&2
fi

# --- tauri CLI ---------------------------------------------------------------
tauri="$root/node_modules/.bin/tauri"
if [ ! -x "$tauri" ]; then
	echo "error: no Tauri CLI at $tauri — run 'npm ci' in app/" >&2
	exit 1
fi

tauri_args=(build)
# universal-apple-darwin hard-fails if a slice is missing. One target: omit
# --target so the CLI builds the host triple.
if [ "$universal" -eq 1 ]; then
	tauri_args+=(--target universal-apple-darwin)
fi

# --- config overrides ----------------------------------------------------------
# One merged --config object. python3 builds the JSON so a signing identity
# containing a quote cannot produce a malformed override.
#
# tauri.conf.json pins bundle.macOS.signingIdentity to "-" (ad-hoc). A real
# release overrides it here explicitly instead of relying on how the
# APPLE_SIGNING_IDENTITY env var ranks against the config value.
#
# tauri.conf.json sets bundle.createUpdaterArtifacts: true, which makes
# `tauri build` fail without a private key. tauri-cli v2 reads the key from
# TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH. Only their
# presence is tested; the values are never read.
has_key=0
if [ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ] || [ -n "${TAURI_SIGNING_PRIVATE_KEY_PATH:-}" ]; then
	has_key=1
else
	echo "note: no TAURI_SIGNING_PRIVATE_KEY — building without updater artifacts (.app.tar.gz/.sig)" >&2
fi

config="$(CF_HAS_KEY="$has_key" python3 -c '
import json, os
cfg = {}
identity = os.environ.get("APPLE_SIGNING_IDENTITY", "")
if identity:
    cfg.setdefault("bundle", {}).setdefault("macOS", {})["signingIdentity"] = identity
if os.environ["CF_HAS_KEY"] != "1":
    cfg.setdefault("bundle", {})["createUpdaterArtifacts"] = False
print(json.dumps(cfg) if cfg else "")
')"
if [ -n "$config" ]; then
	tauri_args+=(--config "$config")
fi

# --- build -------------------------------------------------------------------
# Pin the target dir to an absolute path so the shared Cargo cache
# (~/.cargo/config.toml build.target-dir) or an inherited CARGO_TARGET_DIR
# cannot move the bundle out of src-tauri/target/.
export CARGO_TARGET_DIR="$root/src-tauri/target"

profile=release
for arg in "$@"; do
	case "$arg" in
	--debug | -d) profile=debug ;;
	# The script picks the target itself (universal or host) and reports the
	# bundle from that folder; a second target would build somewhere else.
	--target | --target=* | -t)
		echo "error: --target is not supported; the script builds universal when both rust targets are installed, else for this Mac" >&2
		exit 2
		;;
	esac
done
if [ "$universal" -eq 1 ]; then
	bundle_dir="$CARGO_TARGET_DIR/universal-apple-darwin/$profile/bundle"
else
	bundle_dir="$CARGO_TARGET_DIR/$profile/bundle"
fi

# The bundle dir is pure output. Clearing it keeps a .dmg of an older version
# or updater artifacts of an earlier keyed build from being reported below.
rm -rf "$bundle_dir"

# Extra args pass straight through to `tauri build`. The ${1+...} / ${arr[@]+...}
# forms keep bash 3.2 (macOS /bin/bash) happy under set -u when they are empty.
"$tauri" "${tauri_args[@]}" ${1+"$@"}

# --- report ------------------------------------------------------------------
app="$bundle_dir/macos/$app_name"
if [ ! -d "$app" ]; then
	echo "error: bundle not created at $app" >&2
	exit 1
fi

echo "built $app"
exe="$(plutil -extract CFBundleExecutable raw -o - "$app/Contents/Info.plist")"
lipo -info "$app/Contents/MacOS/$exe" || true

shopt -s nullglob
dmgs=("$bundle_dir"/dmg/*.dmg)
shopt -u nullglob
for dmg in ${dmgs[@]+"${dmgs[@]}"}; do
	echo "built $dmg"
done
for extra in "$app.tar.gz" "$app.tar.gz.sig"; do
	if [ -e "$extra" ]; then
		echo "built $extra"
	elif [ "$has_key" -eq 1 ]; then
		echo "note: not produced: $extra" >&2
	fi
done
