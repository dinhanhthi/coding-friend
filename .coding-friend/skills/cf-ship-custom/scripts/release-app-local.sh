#!/usr/bin/env bash
# release-app-local.sh — build, sign, notarize and publish a Coding Friend
# desktop app release from this Mac. There is no CI path for app releases.
#
# Usage (from the repo, HEAD detached at the tag, clean tree):
#   bash .coding-friend/skills/cf-ship-custom/scripts/release-app-local.sh <app-vX.Y.Z> [--dry-run] [--resume]
#   e.g. ... release-app-local.sh app-v0.1.0
#
#   --dry-run  Build, sign, notarize and verify, write the release assets to a
#              scratch dir, but touch no GitHub Release (prints what it would
#              do). The build still submits one REAL notarization to Apple.
#   --resume   A previous run died after creating the draft release: delete that
#              draft (never the tag; drafts are invisible to clients) and redo
#              the build and upload.
#
# Only stable `app-vX.Y.Z` tags are accepted, and only when the tag is on
# origin and its commit is on origin/main.
#
# Release model:
#   app-vX.Y.Z   a normal release (never marked Latest, so the CLI/plugin
#                release stays Latest) with the DMG, the updater tarball, its
#                .sig and latest.json.
#   app-latest   a pre-release owned by this script. Its only job is to host
#                latest.json at the updater endpoint in tauri.conf.json:
#                  https://github.com/<owner>/<repo>/releases/download/app-latest/latest.json
#                latest.json is uploaded there LAST, so installed apps only see
#                a new version once all its assets are published.
#
# Local materials (never committed, never printed):
#   docs/release-secrets/release.secrets  KEY=value lines, mode 600, read by
#     _release-materials.sh: APPLE_API_ISSUER, APPLE_API_KEY (the key id), and
#     optionally APPLE_SIGNING_TEAM (picks the Developer ID identity when the
#     keychain has several). CF_RELEASE_SECRETS=<path> points at another file.
#   docs/release-secrets/AuthKey.p8       App Store Connect API key (notarization).
#   ~/.tauri/coding-friend.key            Updater (minisign) private key; passed
#                                         to Tauri by path in
#                                         TAURI_SIGNING_PRIVATE_KEY, never read here.
#   ~/.tauri/coding-friend.key.password   Its password.
#   ~/.tauri/coding-friend.key.pub        Its public key; must equal
#     plugins.updater.pubkey in app/src-tauri/tauri.conf.json, and the built .sig
#     is checked against it before any upload.
#   Login keychain                        "Developer ID Application" identity.
#   minisign on PATH (brew install minisign)  Verifies the updater .sig; required
#     for a real run, a dry run falls back to a key id check.
#
# First run: codesign asks to use the login-keychain key; click "Always Allow"
# once. The first universal release build is cold; later releases reuse it.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"

LATEST_TAG="app-latest"

die() {
  echo "Error: $*" >&2
  exit 1
}

step() {
  echo ""
  echo "==> $*"
}

usage() {
  echo "Usage: bash $SCRIPT_PATH <app-vX.Y.Z> [--dry-run] [--resume]" >&2
  exit 2
}

# ─── latest.json ──────────────────────────────────────────────────────────────
#
# Same shape as tauri-action's: every darwin platform key points at the one
# universal .app.tar.gz. Notes and signature are passed as files, never on a
# command line.

write_latest_json() {
  local out="$1" version="$2" notes_file="$3" sig_file="$4" url="$5"
  python3 -I - "$out" "$version" "$notes_file" "$sig_file" "$url" <<'PY'
import json, sys
from datetime import datetime, timezone
out, version, notes_file, sig_file, url = sys.argv[1:]
with open(notes_file) as f:
    notes = f.read().strip()
with open(sig_file) as f:
    signature = f.read().strip()
entry = {"signature": signature, "url": url}
keys = ["darwin-aarch64", "darwin-x86_64", "darwin-universal",
        "darwin-aarch64-app", "darwin-x86_64-app", "darwin-universal-app"]
data = {
    "version": version,
    "notes": notes,
    "pub_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": {k: dict(entry) for k in keys},
}
with open(out, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
}

assert_latest_json() {
  python3 -I - "$1" "$2" "$3" <<'PY'
import json, sys
path, version, url = sys.argv[1:]
with open(path) as f:
    data = json.load(f)
if data.get("version") != version:
    sys.exit("latest.json version is %r, expected %r" % (data.get("version"), version))
platforms = data["platforms"]
expected = {"darwin-aarch64", "darwin-x86_64", "darwin-universal",
            "darwin-aarch64-app", "darwin-x86_64-app", "darwin-universal-app"}
if set(platforms) != expected:
    sys.exit("latest.json platforms are %s, expected %s" % (sorted(platforms), sorted(expected)))
for key, entry in platforms.items():
    if not entry.get("signature"):
        sys.exit("latest.json %s has an empty signature" % key)
    if entry.get("url") != url:
        sys.exit("latest.json %s url is %r, expected %r" % (key, entry.get("url"), url))
PY
}

# ─── Release notes ────────────────────────────────────────────────────────────
#
# The "## v<version>" section of app/CHANGELOG.md (up to the next "## "), or a
# placeholder when the file or the section is missing.

write_notes() {
  local changelog="$1" version="$2" out="$3"
  python3 -I - "$changelog" "$version" "$out" <<'PY'
import os, re, sys
changelog, version, out = sys.argv[1:]
body = []
if os.path.isfile(changelog):
    head = re.compile(r"^## v" + re.escape(version) + r"(?![0-9A-Za-z.\-])")
    inside = False
    with open(changelog) as f:
        for line in f:
            if line.startswith("## "):
                if inside:
                    break
                inside = bool(head.match(line))
                continue
            if inside:
                body.append(line)
notes = "".join(body).strip()
if not notes:
    notes = "Coding Friend desktop app v%s." % version
    print("note: no '## v%s' section in app/CHANGELOG.md; using a placeholder" % version)
with open(out, "w") as f:
    f.write(notes + "\n")
PY
}

# ─── Updater signature ────────────────────────────────────────────────────────
#
# Tauri wraps both the public key (tauri.conf.json) and the .sig in one more
# layer of base64 around the minisign text ("untrusted comment: ..." + a base64
# payload line). With minisign installed, the signature is fully verified.
# Without it (dry runs only; a real run requires minisign in preflight), the
# key id is compared: bytes 2..10 of the payload, in both the public key
# ("Ed" + id + key) and the signature ("Ed"/"ED" + id + sig).

updater_sig_tool() {
  python3 -I - "$@" <<'PY'
import base64, sys

def minisign_text(wrapped):
    text = base64.b64decode("".join(wrapped.split()), validate=True).decode()
    lines = [l for l in text.splitlines() if l.strip()]
    if len(lines) < 2 or not lines[0].startswith("untrusted comment:"):
        sys.exit("not a minisign file")
    return text, base64.b64decode(lines[1], validate=True)

mode, pubkey, sig_file = sys.argv[1:4]
pub_text, pub = minisign_text(pubkey)
with open(sig_file) as f:
    sig_text, sig = minisign_text(f.read())
if len(pub) != 42 or pub[:2] != b"Ed":
    sys.exit("malformed minisign public key")
if len(sig) != 74 or sig[:2] not in (b"Ed", b"ED"):
    sys.exit("malformed minisign signature")
if mode == "decode":
    out_dir = sys.argv[4]
    with open(out_dir + "/key.pub", "w") as f:
        f.write(pub_text)
    with open(out_dir + "/file.minisig", "w") as f:
        f.write(sig_text)
elif pub[2:10] == sig[2:10]:
    print("match")
else:
    print("mismatch")
    sys.exit(1)
PY
}

verify_updater_sig() {
  local file="$1" sig="$2" pubkey="$3" dry_run="$4" tmp rc=0
  if command -v minisign >/dev/null 2>&1; then
    tmp="$(mktemp -d -t coding-friend-minisign)"
    updater_sig_tool decode "$pubkey" "$sig" "$tmp" || rc=1
    if [[ $rc -eq 0 ]]; then
      minisign -Vq -p "$tmp/key.pub" -m "$file" -x "$tmp/file.minisig" || rc=1
    fi
    rm -f "$tmp/key.pub" "$tmp/file.minisig"
    rmdir "$tmp"
    [[ $rc -eq 0 ]] || die "$sig does not verify against the updater public key (minisign -V)"
    echo "ok: updater signature verified (minisign)"
  else
    [[ $dry_run -eq 1 ]] || die "minisign is required to verify the updater signature (brew install minisign)"
    updater_sig_tool keyid "$pubkey" "$sig" >/dev/null \
      || die "$sig was not made by the updater key pinned in tauri.conf.json (key id mismatch)"
    echo "WARNING: minisign is not installed: only the signature's key id was checked," >&2
    echo "WARNING: not the signature itself. A real run requires it: 'brew install minisign'." >&2
    echo "ok: updater signature key id matches"
  fi
}

# ─── Endpoint check ───────────────────────────────────────────────────────────
#
# The download URL redirects to a CDN that may serve the previous file for a
# moment after --clobber, so retry a few times.

check_endpoint() {
  local url="$1" version="$2" i got
  for i in 1 2 3 4 5 6; do
    if got="$(curl -fsSL "$url" | python3 -I -c 'import json, sys; print(json.load(sys.stdin)["version"])' 2>/dev/null)" \
      && [[ "$got" == "$version" ]]; then
      echo "ok: $url serves version $version"
      return 0
    fi
    echo "endpoint serves version '${got:-?}', want $version (attempt $i/6); retrying in 10s…"
    sleep 10
  done
  return 1
}

# ─── Tools ────────────────────────────────────────────────────────────────────
#
# A real run also needs minisign to verify the updater signature before any
# upload; a dry run may fall back to the key id check.

check_tools() {
  local dry_run="$1" cmd
  for cmd in gh git npm cargo rustup xcrun python3 curl hdiutil lipo spctl security plutil; do
    command -v "$cmd" >/dev/null 2>&1 || die "$cmd not found on PATH"
  done
  if [[ $dry_run -eq 0 ]]; then
    command -v minisign >/dev/null 2>&1 \
      || die "minisign not found on PATH; a real release requires it to verify the updater signature (brew install minisign)"
  fi
}

# ─── Cleanup and recovery ─────────────────────────────────────────────────────
#
# Bash keeps one EXIT trap, so it does everything: detach the DMG and, when a
# GitHub write already happened, say how to finish or undo the release.

MOUNT=""
TAG=""
TAG_COMMIT=""
REPO_SLUG=""
ASSET_DIR=""
ENDPOINT=""
DRAFT_CREATED=0
PUBLISHED=0
LATEST_UPLOADED=0

cleanup() {
  local rc=$?
  if [[ -n "$MOUNT" ]]; then
    hdiutil detach "$MOUNT" -quiet 2>/dev/null || hdiutil detach "$MOUNT" -force -quiet 2>/dev/null || true
  fi
  if [[ $rc -eq 0 ]]; then
    return
  fi
  if [[ $DRAFT_CREATED -eq 1 && $PUBLISHED -eq 0 ]]; then
    echo "" >&2
    echo "The draft release $TAG exists but was not published (clients cannot see it). Recover with:" >&2
    echo "  bash $SCRIPT_PATH $TAG --resume" >&2
    echo "or drop it (the tag stays):" >&2
    echo "  gh release -R $REPO_SLUG delete $TAG --yes" >&2
  elif [[ $PUBLISHED -eq 1 && $LATEST_UPLOADED -eq 0 ]]; then
    echo "" >&2
    echo "$TAG is published, but installed apps will not see it until latest.json is on $LATEST_TAG." >&2
    echo "Finish with (assets are in $ASSET_DIR):" >&2
    echo "  gh release -R $REPO_SLUG view $LATEST_TAG >/dev/null 2>&1 || gh release -R $REPO_SLUG create $LATEST_TAG --prerelease --latest=false --target $TAG_COMMIT --title \"Coding Friend app updater\" --notes \"Updater feed for the Coding Friend desktop app. Managed by release-app-local.sh.\"" >&2
    echo "  gh release -R $REPO_SLUG upload $LATEST_TAG \"$ASSET_DIR/latest.json\" --clobber" >&2
    echo "  curl -fsSL $ENDPOINT" >&2
  elif [[ $LATEST_UPLOADED -eq 1 ]]; then
    echo "" >&2
    echo "latest.json was uploaded to $LATEST_TAG, but the endpoint did not serve $TAG's version yet. Check with:" >&2
    echo "  curl -fsSL $ENDPOINT" >&2
    echo "and if it stays stale, upload again:" >&2
    echo "  gh release -R $REPO_SLUG upload $LATEST_TAG \"$ASSET_DIR/latest.json\" --clobber" >&2
  fi
}

main() {
  local arg dry_run=0 resume=0

  # ─── Arguments ──────────────────────────────────────────────────────────────

  for arg in "$@"; do
    case "$arg" in
      --dry-run) dry_run=1 ;;
      --resume) resume=1 ;;
      -*) usage ;;
      *)
        [[ -z "$TAG" ]] || usage
        TAG="$arg"
        ;;
    esac
  done
  [[ -n "$TAG" ]] || usage

  # ─── Paths ──────────────────────────────────────────────────────────────────

  REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "run this from inside the coding-friend repository"
  local app_dir="$REPO_ROOT/app"
  local conf="$app_dir/src-tauri/tauri.conf.json"
  [[ -f "$conf" ]] || die "app/src-tauri/tauri.conf.json not found under REPO_ROOT=$REPO_ROOT"
  [[ -f "$app_dir/scripts/build.sh" ]] || die "app/scripts/build.sh not found"
  # Set after check_tools: cargo's target dir (the external SSD via the
  # repo-root .cargo/config.toml), the same one build.sh resolves.
  local bundle_dir
  local version="${TAG#app-v}"

  # shellcheck source=_release-materials.sh
  source "$SCRIPT_DIR/_release-materials.sh"
  trap cleanup EXIT

  # ─── Preflight ──────────────────────────────────────────────────────────────
  #
  # Every refusal here happens before any build or GitHub write.

  step "Preflight"
  [[ "$(uname)" == "Darwin" ]] || die "macOS only"
  [[ "$TAG" =~ ^app-v[0-9]+\.[0-9]+\.[0-9]+$ ]] \
    || die "tag must be app-vX.Y.Z (got '$TAG'); prereleases are not supported"

  check_tools "$dry_run"

  local target_dir
  target_dir="$(unset CARGO_TARGET_DIR; cargo metadata --no-deps --format-version 1 --manifest-path "$app_dir/src-tauri/Cargo.toml" |
    python3 -c 'import json, sys; print(json.load(sys.stdin)["target_directory"])')" \
    || die "cargo metadata failed for app/src-tauri"
  bundle_dir="$target_dir/universal-apple-darwin/release/bundle"

  TAG_COMMIT="$(git -C "$REPO_ROOT" rev-parse -q --verify "refs/tags/$TAG^{commit}")" \
    || die "tag $TAG does not exist locally"
  local local_tag_obj remote_tag_obj
  local_tag_obj="$(git -C "$REPO_ROOT" rev-parse "refs/tags/$TAG")"
  remote_tag_obj="$(git -C "$REPO_ROOT" ls-remote --exit-code --tags origin "refs/tags/$TAG" | awk '{print $1; exit}')" \
    || die "tag $TAG is not on origin (git push origin $TAG)"
  [[ "$remote_tag_obj" == "$local_tag_obj" ]] || die "tag $TAG on origin differs from the local tag"
  [[ "$(git -C "$REPO_ROOT" rev-parse HEAD)" == "$TAG_COMMIT" ]] \
    || die "HEAD is not $TAG's commit (git checkout --detach $TAG)"
  git -C "$REPO_ROOT" fetch -q origin main || die "git fetch origin main failed"
  git -C "$REPO_ROOT" merge-base --is-ancestor "$TAG_COMMIT" origin/main \
    || die "$TAG's commit is not on origin/main; app releases only ship from main"
  [[ -z "$(git -C "$REPO_ROOT" status --porcelain)" ]] \
    || die "working tree is not clean (git status)"

  # status --porcelain ignores gitignored paths, so it cannot see the installed
  # packages; npm ci reinstalls them from the tag's package-lock.json.
  (cd "$app_dir" && npm ci) \
    || die "npm ci in app/ failed (package-lock.json out of date?)"
  [[ -z "$(git -C "$REPO_ROOT" status --porcelain)" ]] \
    || die "npm ci changed the working tree (git status)"

  local pkg_version
  pkg_version="$(python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1]))["version"])' \
    "$app_dir/package.json")" || die "could not read the version from app/package.json"
  [[ "$pkg_version" == "$version" ]] \
    || die "app/package.json version is $pkg_version, tag is $TAG"

  local targets target
  targets="$(rustup target list --installed)"
  for target in aarch64-apple-darwin x86_64-apple-darwin; do
    grep -qx "$target" <<<"$targets" || die "rust target $target missing (rustup target add $target)"
  done
  echo "ok: $TAG at $TAG_COMMIT (on origin/main), clean tree, version $version"

  # ─── Materials ──────────────────────────────────────────────────────────────
  #
  # Before any GitHub call, so missing materials always surface first. Only
  # names and ok/missing are printed.

  step "Materials"
  if ! load_release_secrets --optional APPLE_SIGNING_TEAM -- APPLE_API_ISSUER APPLE_API_KEY; then
    die "release secrets incomplete (see the header of this script)"
  fi

  local api_key_path="$REPO_ROOT/docs/release-secrets/AuthKey.p8"
  [[ -f "$api_key_path" ]] || die "missing: $api_key_path"
  export APPLE_API_KEY_PATH="$api_key_path"
  echo "ok: APPLE_API_KEY_PATH"

  # No `| head` under pipefail: awk consumes all input instead.
  local identities identity count
  identities="$(security find-identity -v -p codesigning login.keychain || true)"
  if [[ -n "${APPLE_SIGNING_TEAM:-}" ]]; then
    [[ "$APPLE_SIGNING_TEAM" =~ ^[A-Z0-9]{10}$ ]] || die "APPLE_SIGNING_TEAM is not a 10-character team id"
    identity="$(awk -F'"' -v team="($APPLE_SIGNING_TEAM)" '
      /Developer ID Application/ && substr($2, length($2) - length(team) + 1) == team { print $2; exit }
    ' <<<"$identities")"
    [[ -n "$identity" ]] \
      || die "no 'Developer ID Application' identity for team $APPLE_SIGNING_TEAM in the login keychain"
  else
    count="$(awk -F'"' '/Developer ID Application/ { n++ } END { print n + 0 }' <<<"$identities")"
    [[ "$count" -eq 1 ]] \
      || die "found $count 'Developer ID Application' identities in the login keychain; set APPLE_SIGNING_TEAM in the secrets file to pick one"
    identity="$(awk -F'"' '/Developer ID Application/ { print $2; exit }' <<<"$identities")"
  fi
  export APPLE_SIGNING_IDENTITY="$identity"
  echo "ok: APPLE_SIGNING_IDENTITY ($identity)"

  # Tauri v2 documents TAURI_SIGNING_PRIVATE_KEY ("can be either a string or a
  # path to the file") and TAURI_SIGNING_PRIVATE_KEY_PASSWORD. The key goes by
  # path, so its content is never read here; the password goes into the
  # environment with $(<file), which drops the trailing newline and never puts
  # the value on a command line.
  local tauri_key="$HOME/.tauri/coding-friend.key"
  [[ -s "$tauri_key" ]] || die "missing: $tauri_key"
  [[ -f "$tauri_key.password" ]] || die "missing: $tauri_key.password"
  unset TAURI_SIGNING_PRIVATE_KEY_PATH
  export TAURI_SIGNING_PRIVATE_KEY="$tauri_key"
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$(<"$tauri_key.password")"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD
  echo "ok: TAURI_SIGNING_PRIVATE_KEY (path)"
  echo "ok: TAURI_SIGNING_PRIVATE_KEY_PASSWORD"

  # Tauri writes the .pub file as base64 of the minisign public key, the same
  # encoding tauri.conf.json pins, so the two compare as plain strings. A
  # mismatch ships an update every installed build rejects.
  local updater_pubkey conf_pubkey
  [[ -s "$tauri_key.pub" ]] || die "missing: $tauri_key.pub"
  updater_pubkey="$(tr -d '[:space:]' <"$tauri_key.pub")"
  conf_pubkey="$(python3 -I -c 'import json, sys; print(json.load(open(sys.argv[1]))["plugins"]["updater"]["pubkey"])' \
    "$conf" | tr -d '[:space:]')" \
    || die "could not read plugins.updater.pubkey from tauri.conf.json"
  [[ -n "$conf_pubkey" && "$updater_pubkey" == "$conf_pubkey" ]] \
    || die "$tauri_key.pub does not match plugins.updater.pubkey in tauri.conf.json"
  echo "ok: updater public key matches tauri.conf.json"

  # API-key notarization must be the only auth path.
  unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID

  # Every `gh release` call below pins this repo with -R, so another default
  # remote (a fork) can never receive the release.
  REPO_SLUG="$(gh repo view --json nameWithOwner --jq .nameWithOwner)" \
    || die "gh repo view failed (gh auth status)"
  [[ -n "$REPO_SLUG" ]] || die "gh repo view returned no nameWithOwner"

  ENDPOINT="https://github.com/$REPO_SLUG/releases/download/$LATEST_TAG/latest.json"
  local conf_endpoints
  conf_endpoints="$(python3 -I -c 'import json, sys; print("\n".join(json.load(open(sys.argv[1]))["plugins"]["updater"]["endpoints"]))' \
    "$conf")" || die "could not read plugins.updater.endpoints from tauri.conf.json"
  [[ "$conf_endpoints" == "$ENDPOINT" ]] \
    || die "plugins.updater.endpoints in tauri.conf.json is not exactly $ENDPOINT"
  echo "ok: updater endpoint $ENDPOINT"

  # ─── Release state ──────────────────────────────────────────────────────────

  # A dry run only reports the state (read-only); a real run acts on it.
  step "Release state"
  local err_file is_draft
  err_file="$(mktemp -t coding-friend-gh)"
  if is_draft="$(gh release -R "$REPO_SLUG" view "$TAG" --json isDraft --jq .isDraft 2>"$err_file")"; then
    rm -f "$err_file"
    if [[ $dry_run -eq 1 ]]; then
      echo "note: release $TAG already exists (isDraft=$is_draft); a real run would need --resume (draft) or refuse (published)"
    else
      if [[ "$is_draft" == "true" ]]; then
        if [[ $resume -eq 0 ]]; then
          echo "A draft release $TAG already exists (an earlier run died). Recover with:" >&2
          echo "  bash $SCRIPT_PATH $TAG --resume" >&2
          exit 1
        fi
        echo "Deleting the unpublished draft $TAG (the tag stays)…"
        gh release -R "$REPO_SLUG" delete "$TAG" --yes
      else
        die "release $TAG is already published"
      fi
    fi
  elif grep -q "release not found" "$err_file"; then
    rm -f "$err_file"
    echo "ok: no release for $TAG yet"
  else
    cat "$err_file" >&2
    rm -f "$err_file"
    die "gh release -R $REPO_SLUG view $TAG failed"
  fi

  # Read-only, so dry runs check it too: app-latest must stay a pre-release
  # (never Latest, never a draft the updater cannot download from).
  local latest_state latest_exists=0
  err_file="$(mktemp -t coding-friend-gh)"
  if latest_state="$(gh release -R "$REPO_SLUG" view "$LATEST_TAG" --json isDraft,isPrerelease --jq '"\(.isDraft) \(.isPrerelease)"' 2>"$err_file")"; then
    rm -f "$err_file"
    [[ "$latest_state" == "false true" ]] \
      || die "release $LATEST_TAG exists but is not a published pre-release (isDraft isPrerelease = $latest_state)"
    latest_exists=1
    echo "ok: $LATEST_TAG is a pre-release"
  elif grep -q "release not found" "$err_file"; then
    rm -f "$err_file"
    echo "ok: no $LATEST_TAG release yet (created on publish)"
  else
    cat "$err_file" >&2
    rm -f "$err_file"
    die "gh release -R $REPO_SLUG view $LATEST_TAG failed"
  fi

  # ─── Build ──────────────────────────────────────────────────────────────────
  #
  # build.sh clears the bundle dir, builds universal (both targets are
  # checked above), signs with APPLE_SIGNING_IDENTITY, notarizes through the
  # APPLE_API_* env and writes the updater artifacts.

  step "Build (signs, notarizes, staples)"
  bash "$app_dir/scripts/build.sh"

  local app="$bundle_dir/macos/Coding Friend.app"
  local tarball="$bundle_dir/macos/Coding Friend.app.tar.gz"
  local dmgs dmg
  shopt -s nullglob
  dmgs=("$bundle_dir"/dmg/*.dmg)
  shopt -u nullglob
  [[ ${#dmgs[@]} -eq 1 ]] || die "expected exactly one .dmg in $bundle_dir/dmg, found ${#dmgs[@]}"
  dmg="${dmgs[0]}"
  [[ -d "$app" ]] || die "build produced no $app"
  [[ -f "$tarball" ]] || die "build produced no $tarball"
  [[ -s "$tarball.sig" ]] || die "updater signature $tarball.sig is missing or empty"
  verify_updater_sig "$tarball" "$tarball.sig" "$conf_pubkey" "$dry_run"

  # ─── Verify the DMG (what users receive) ────────────────────────────────────

  step "Verify the DMG"
  local spctl_out
  # The DMG container itself. Tauri notarizes and staples the .app; whether the
  # DMG carries its own ticket depends on the bundler, so this is a loud
  # warning, and the app inside the DMG below is the hard gate.
  if spctl_out="$(spctl -a -vv -t open --context context:primary-signature "$dmg" 2>&1)" \
    && [[ "$spctl_out" == *"Notarized Developer ID"* ]]; then
    echo "ok: DMG is a notarized Developer ID image"
  else
    echo "WARNING: the DMG container is not assessed as notarized:" >&2
    echo "$spctl_out" >&2
    echo "WARNING: continuing because the app inside is checked next." >&2
  fi

  local attach_plist
  attach_plist="$(hdiutil attach -nobrowse -readonly -plist "$dmg")"
  MOUNT="$(python3 -I -c '
import plistlib, sys
for e in plistlib.loads(sys.stdin.buffer.read()).get("system-entities", []):
    if e.get("mount-point"):
        print(e["mount-point"])
        break
' <<<"$attach_plist")"
  [[ -n "$MOUNT" ]] || die "could not find the mount point of $dmg"

  local dmg_app="$MOUNT/Coding Friend.app"
  [[ -d "$dmg_app" ]] || die "Coding Friend.app not found in the DMG"
  spctl_out="$(spctl -a -vv -t exec "$dmg_app" 2>&1)" || die "spctl rejected the app: $spctl_out"
  [[ "$spctl_out" == *"Notarized Developer ID"* ]] || die "app is not notarized: $spctl_out"
  echo "ok: app is notarized Developer ID"
  xcrun stapler validate "$dmg_app" >/dev/null || die "notarization ticket is not stapled to the app"
  echo "ok: stapled"
  local exe archs
  exe="$(plutil -extract CFBundleExecutable raw "$dmg_app/Contents/Info.plist")"
  archs="$(lipo -archs "$dmg_app/Contents/MacOS/$exe")"
  [[ " $archs " == *" x86_64 "* && " $archs " == *" arm64 "* ]] \
    || die "app is not universal (archs: $archs)"
  echo "ok: universal ($archs)"
  local dmg_version
  dmg_version="$(plutil -extract CFBundleShortVersionString raw "$dmg_app/Contents/Info.plist")"
  [[ "$dmg_version" == "$version" ]] || die "app in the DMG is version $dmg_version, tag is $TAG"
  echo "ok: app version $dmg_version"
  hdiutil detach "$MOUNT" -quiet
  MOUNT=""

  # ─── Assets ─────────────────────────────────────────────────────────────────
  #
  # Asset names have no spaces: GitHub rewrites spaces in asset names, which
  # would break the URL written into latest.json.

  step "Assets"
  local work_dir notes_file
  work_dir="$(mktemp -d -t coding-friend-release)"
  ASSET_DIR="$work_dir/assets"
  notes_file="$work_dir/notes.md"
  mkdir "$ASSET_DIR"

  local asset_tar="Coding-Friend_${version}_universal.app.tar.gz"
  local asset_dmg="Coding-Friend_${version}_universal.dmg"
  local asset_url="https://github.com/$REPO_SLUG/releases/download/$TAG/$asset_tar"
  cp "$dmg" "$ASSET_DIR/$asset_dmg"
  # Renaming keeps the minisign signature valid: it covers bytes, not the name.
  cp "$tarball" "$ASSET_DIR/$asset_tar"
  cp "$tarball.sig" "$ASSET_DIR/$asset_tar.sig"

  write_notes "$app_dir/CHANGELOG.md" "$version" "$notes_file"
  write_latest_json "$ASSET_DIR/latest.json" "$version" "$notes_file" "$ASSET_DIR/$asset_tar.sig" "$asset_url"
  assert_latest_json "$ASSET_DIR/latest.json" "$version" "$asset_url"
  echo "ok: $ASSET_DIR"
  ls -l "$ASSET_DIR"

  if [[ $dry_run -eq 1 ]]; then
    echo ""
    echo "Dry run complete. Assets: $ASSET_DIR (notes: $notes_file)"
    echo "No GitHub Release was touched, but a real notarization was submitted to Apple."
    echo "A real run would now:"
    echo "  gh release -R $REPO_SLUG create $TAG --verify-tag --draft --latest=false --title \"Coding Friend $TAG\" --notes-file <notes>"
    echo "  gh release -R $REPO_SLUG upload $TAG $asset_dmg $asset_tar $asset_tar.sig latest.json"
    echo "  gh release -R $REPO_SLUG edit $TAG --draft=false --latest=false"
    if [[ $latest_exists -eq 0 ]]; then
      echo "  gh release -R $REPO_SLUG create $LATEST_TAG --prerelease --latest=false --target $TAG_COMMIT …"
    fi
    echo "  gh release -R $REPO_SLUG upload $LATEST_TAG latest.json --clobber"
    echo "  curl -fsSL $ENDPOINT   # expect version $version"
    return 0
  fi

  # ─── Publish ────────────────────────────────────────────────────────────────
  #
  # Draft first: clients never see a draft, so a partial upload stays invisible
  # until all 4 assets are confirmed. latest.json goes to app-latest last.

  step "Publish $TAG"
  gh release -R "$REPO_SLUG" create "$TAG" --verify-tag --draft --latest=false \
    --title "Coding Friend $TAG" --notes-file "$notes_file"
  DRAFT_CREATED=1
  gh release -R "$REPO_SLUG" upload "$TAG" "$ASSET_DIR/$asset_dmg" "$ASSET_DIR/$asset_tar" \
    "$ASSET_DIR/$asset_tar.sig" "$ASSET_DIR/latest.json"

  local uploaded name
  uploaded="$(gh release -R "$REPO_SLUG" view "$TAG" --json assets --jq '.assets[].name')"
  for name in "$asset_dmg" "$asset_tar" "$asset_tar.sig" latest.json; do
    grep -qxF "$name" <<<"$uploaded" || die "asset $name is missing from the draft release"
  done
  echo "ok: 4 assets uploaded"

  gh release -R "$REPO_SLUG" edit "$TAG" --draft=false --latest=false
  PUBLISHED=1
  echo "ok: published https://github.com/$REPO_SLUG/releases/tag/$TAG"

  step "Publish the updater feed ($LATEST_TAG)"
  if [[ $latest_exists -eq 0 ]]; then
    gh release -R "$REPO_SLUG" create "$LATEST_TAG" --prerelease --latest=false --target "$TAG_COMMIT" \
      --title "Coding Friend app updater" \
      --notes "Updater feed for the Coding Friend desktop app. Managed by release-app-local.sh; do not edit by hand."
    echo "ok: created pre-release $LATEST_TAG"
  fi
  gh release -R "$REPO_SLUG" upload "$LATEST_TAG" "$ASSET_DIR/latest.json" --clobber
  LATEST_UPLOADED=1
  check_endpoint "$ENDPOINT" "$version" || die "the updater endpoint does not serve version $version"

  echo ""
  echo "Released $TAG: https://github.com/$REPO_SLUG/releases/tag/$TAG"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
