# Coding Friend desktop app

An optional macOS app for Coding Friend. It is a window onto the `cf` CLI: every action calls `cf … --json`, and the app keeps no logic or data that the CLI does not have. The plugin and the CLI remain the full product; you never need the app to use any Coding Friend feature.

It needs `cf` (the `coding-friend-cli` npm package) with `cf doctor`. If `cf` is missing or too old, the app shows the command to install or update it.

**Only in the app:** the project dashboard, the menu bar (tray) item and the app's own self-update. Doctor and Version/Update are views of `cf doctor --json` and `cf update --check|--yes --json`.

## Development

The frontend is Vite + React 19 + Tailwind v4, with the website's design tokens (`src/tokens.css`, copied from `website/src/app/tokens.css`; keep them in sync). It follows the system light/dark appearance.

```bash
cd app
npm ci
npm run ui:dev        # Vite dev server on http://localhost:1430
npm run typecheck
npm test              # vitest (src/**/*.test.ts)
npm run format:check
npm run ui:build      # typecheck + production frontend build
```

`app/` is its own npm project with its own `package-lock.json`; the repository root is not a workspace.

## Tauri shell

The Rust side lives in `src-tauri/`. It never takes command lines from the frontend: each Tauri command builds a fixed `cf … --json` argv, runs it without a shell (stdin closed, cwd `$HOME`, PATH taken from your login shell so a Finder launch still finds `node` and `cf`), kills the whole process group on timeout, and decides the result from the JSON envelope, not the exit code. A doctor fix runs only when its argv exactly matches one of the three fixes `cf doctor` may offer.

The Rust side treats the webview as untrusted. Actions that change your setup (`cf update --yes`, a doctor fix, removing a project) first show a native confirm dialog from Rust with the exact command line, and run one at a time; Cancel runs nothing (the command returns the `cancelled` error kind). Paths never come from the page, except when removing a project (below): adding a project and choosing the `cf` binary open native pickers from Rust, so the window has no dialog permission at all. Removing a project takes the path of a listed project from the page; Rust refuses it unless it is absolute (and not an option), canonicalizes it when the folder still exists, and shows it in the native confirm before running `cf project remove -- <path>`.

`cf` is looked up in this order: the `CF_APP_CF_BIN` environment variable (must be an absolute path to a file named `cf`), then `cfBinPath` in `~/Library/Application Support/dev.dinhanhthi.coding-friend/settings.json` (chosen in the app's folder picker: pick the folder that contains `cf`), then `cf` on the login-shell PATH. A chosen `cf` is saved only when it is named `cf`, is executable, belongs to you, is not group- or world-writable, and answers `cf version --json`; the same checks run on every launch, so an edited settings.json cannot point the app at another program.

```bash
cd app
npm run tauri dev                                   # app window + Vite dev server
npm run bundle                                      # release .app/.dmg into src-tauri/target
cargo test --manifest-path src-tauri/Cargo.toml     # Rust tests
```

Debug builds include the Tauri MCP bridge (127.0.0.1 only); release builds do not.

## Building a bundle

`npm run bundle` runs `scripts/build.sh`, which wraps `tauri build`; extra arguments pass through (`npm run bundle -- --debug --bundles app`), except `--target`, which the script picks itself. The script prints where the `.app` and `.dmg` landed.

- **Universal** (`universal-apple-darwin`, under `src-tauri/target/universal-apple-darwin/`) when both `aarch64-apple-darwin` and `x86_64-apple-darwin` rustup targets are installed; otherwise the host architecture only (under `src-tauri/target/release/`), with a warning.
- **Ad-hoc signed** by default (`signingIdentity: "-"` in `tauri.conf.json`). Set `APPLE_SIGNING_IDENTITY` to sign with a real identity; the script passes it as a `--config` override.
- **Updater artifacts** (`.app.tar.gz` and `.sig`) only when `TAURI_SIGNING_PRIVATE_KEY` is set, to the key itself or a path to the key file (the documented Tauri v2 variable; its password goes in `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). Without it the script turns `createUpdaterArtifacts` off, so local and VM builds need no key.

## Cargo build cache

This machine shares one Cargo target directory across Rust projects (`~/.cargo/config.toml` sets `build.target-dir`), so `cargo build` / `cargo test` leave no `src-tauri/target/` here. `src-tauri/Cargo.toml` repeats the same dev profile, which keeps the cache small; keep it identical to `~/.cargo/config.toml`:

```toml
[profile.dev]
opt-level = 1
split-debuginfo = "off"
incremental = false

[profile.dev.package."*"]
debug = "line-tables-only"
incremental = false
```

- `npm run bundle` pins `CARGO_TARGET_DIR=<repo>/app/src-tauri/target`, so bundles stay in the repo (gitignored).
- Build one project at a time. Never run `cargo clean` (it wipes every project's cache); clean with `cargo sweep`.

## Release

Releases are built and published from a Mac, never from CI, and only from a tag on `main`:

```bash
.coding-friend/skills/cf-ship-custom/scripts/release-app-local.sh app-vX.Y.Z --dry-run   # build, notarize, verify, no GitHub writes
.coding-friend/skills/cf-ship-custom/scripts/release-app-local.sh app-vX.Y.Z             # publish
```

- **Version:** `app/package.json` (bumped with `bump.sh app <version>`); `tauri.conf.json` reads it, the Cargo version stays fixed. The tag must equal it.
- **Materials** (never committed, all in the gitignored `docs/release-secrets/`): `release.secrets`, read by `_release-materials.sh` (`APPLE_API_ISSUER`, `APPLE_API_KEY`, optional `APPLE_SIGNING_TEAM`), and the App Store Connect API key as `AuthKey.p8` (Apple's download is named `AuthKey_<id>.p8`; copy or rename it). Also one "Developer ID Application" identity in the keychain; the updater key `~/.tauri/coding-friend.key` (passed to Tauri by path in `TAURI_SIGNING_PRIVATE_KEY`) with its password in `~/.tauri/coding-friend.key.password` (both mode 600); and `minisign` (`brew install minisign`), which a real run requires to verify the updater signature. The script compares `coding-friend.key.pub` with the `pubkey` in `tauri.conf.json` and never prints a secret.
- **Release model:** each version is a GitHub release `app-vX.Y.Z` created with `--latest=false`, so the CLI and plugin releases stay "Latest". A fixed pre-release `app-latest` holds `latest.json`, which the app's updater reads; the script uploads it last with `--clobber`, then checks the endpoint.
- **Checking a release:** the downloaded DMG's app passes `spctl -a -t exec -vv` ("Notarized Developer ID") and `xcrun stapler validate`; `lipo -info` shows `x86_64 arm64`; `curl -fsSL https://github.com/dinhanhthi/coding-friend/releases/download/app-latest/latest.json` shows the new version.
- **Notes:** the `## vX.Y.Z` section of `app/CHANGELOG.md`, or a placeholder.
