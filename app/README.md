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
npm run bundle                                      # release .app/.dmg into the Cargo target dir (external SSD)
cargo test --manifest-path src-tauri/Cargo.toml     # Rust tests
```

Debug builds include the Tauri MCP bridge (127.0.0.1 only); release builds do not.

## Settings and the Config tab

**Settings** (sidebar) edits the global config, `~/.coding-friend/config.json`. A project's **Config** tab edits that project's `.coding-friend/config.json` and shows where each effective value comes from (local or global). The editors are built from `cf config schema --json`; values are read with `cf config get --json`, plus `--project-dir=<path>` for a project, so the CLI resolves it to the main repo root.

Every change goes through `cf config set --global|--local [--project-dir=<path>] --json -- <key> <value>`, after a native confirm dialog from Rust that shows the exact command line; Cancel writes nothing. Reset deletes the key from that file (value `null`), so the value falls back to the next layer. Rust takes `--project-dir` only for a project in the registry, and the key only when it is a well-formed dotted key.

`learn.outputDir` and `docsDir` are read-only in the app, and Rust refuses to write them (or a parent key such as `learn`, since `config set` writes a whole object): they decide where Coding Friend writes files, so a change from the webview could move memory, docs or learn notes. Change `docsDir` with `cf config set` in a terminal, and `learn.outputDir` from the Learn view ("Where learn notes live", below); the row's **Open Learn** button goes there.

## Docs tab

A project's **Docs** tab shows the markdown files of its docs folder (`docsDir`, default `docs`), read-only. The file tree on the left is grouped by top-level folder (`plans`, `memory`, `research`, `context`, `later`, …); the selected file shows on the right. The list comes from `cf docs list --json --project-dir=<path>` and a file from `cf docs show --json --project-dir=<path> -- <relpath>`; Rust takes the project only from the registry, and the CLI refuses any path that leaves the docs folder (see `cli/README.md`, "Machine interface").

These files are written by agents and may arrive through cloud sync or a git pull, so the app renders them as untrusted content:

- Frontmatter is shown as plain text above the body.
- Markdown is rendered without raw HTML (it is dropped, not run) and without rehype plugins. Images are shown as `[image: alt]` text and never fetched.
- No link is a real `<a href>`, so nothing in a file can navigate the window. A relative link to another `.md` or `.markdown` file in the tree opens that file in the tree. An `https:` link opens in the system browser only after a native confirm from Rust that shows the full URL; Cancel opens nothing. Every other link (`http:`, `file:`, `mailto:`, anchors, absolute paths, a `..` that leaves the tree) is shown as plain text.

## Memory tab

A project's **Memory** tab lists the project's memories from `cf memory list --json --project-dir=<path>`, grouped by category. Typing in the search box runs `cf memory search --json --project-dir=<path> -- <query>` after a short pause; an empty box shows the list again without calling `cf`. The selected memory comes from `cf memory show`: its frontmatter as plain text, its body rendered like the Docs tab (untrusted markdown, no raw HTML, no images, `https:` links only after a native confirm).

**Edit** opens the body (never the frontmatter: only `updated:` changes, set by the CLI) in a text box. A draft stays per memory while you switch to other memories in the tab. **Save** runs `cf memory edit --stdin --if-match <sha256> --project-dir=<path> -- <id>` with the body on stdin; the `sha256` is the one the memory had when the edit began. If the file changed since then, the CLI answers `CONFLICT` and nothing is written: the draft stays, and you can **Copy draft** to the clipboard, then **Reload latest** (which discards the draft). **Delete** runs `cf memory delete --yes --if-match <sha256> --project-dir=<path> -- <id>`.

When the memory search index is not watched by the memory daemon, a save or delete says the index may be stale and shows the command to rebuild it in a terminal (`cd '<project>' && cf memory rebuild`, copyable, never run by the app).

## Health tab

A project's **Health** tab shows `cf doctor --json --project-dir=<path>` (30-second timeout): only the `project` checks (registered, local config, docs folder, memory folder, the project's `.mcp.json`), with the same ok/warn/fail counts and rows as the Doctor view. Rust takes the project only from the registry. These checks never carry a fix, so the tab has no fix buttons: a hint shows as a command you can copy (a plain `cf` or `npm` command) or as text, and the app never runs it. The refresh button runs the check again. A `cf` too old for `--project-dir` gets a message to update it from the Version view. The global **Doctor** view is unchanged (see `cli/README.md`, "Doctor").

Every project tab is always shown. When the project folder is missing, the Config, Docs, Memory and Health tabs say so instead of calling `cf`.

## Learn view

**Learn** (sidebar) shows the global learn notes, the ones `/cf-learn` writes to `learn.outputDir`: listed by category from `cf learn list --json`, read with `cf learn show`, edited and deleted like memories (`cf learn edit --stdin --if-match <sha256> -- <id>`, `cf learn delete --yes --if-match <sha256> -- <id>`, same draft and `CONFLICT` handling). Files a cloud app has not downloaded yet are counted as "N not downloaded" and never opened, so listing does not trigger a download. A note that looks like a sync conflict copy of another (`note 2.md`, `note (conflicted copy …).md`, …) carries a **conflict** badge.

### Where learn notes live

The card at the top shows the current folder (`cf learn status --json`) and how notes are stored there:

- **git**: the folder is inside a git repo. With `learn.autoCommit` on, each save or delete commits that one note (never `git add -A`); the result says whether it was committed, or why not. The app never pushes: run `cf learn push` in a terminal (the card shows the command).
- **folder**: any other folder. Saves only write files and nothing is committed (git runs only to detect the mode); a cloud app (iCloud Drive, Google Drive, Dropbox, OneDrive) can sync the folder. A git repo inside a cloud folder gets a warning, since cloud sync and git can damage each other's files.

**Choose folder…** opens a native folder picker from Rust. On macOS the card also suggests a `coding-friend-learn` folder inside each cloud drive it finds (other systems get no suggestions); a suggested folder that does not exist yet is created by the first note. Rust accepts a suggestion only when it equals one that Rust itself read from `cf learn status`. Either way the change is `cf config set --global --json -- learn.outputDir <folder>`. Notes already in the old folder are not moved.

Every save, delete and folder change asks first: a native confirm from Rust shows the exact command line (and, for a save, the size of the body, never the body itself), and Cancel writes nothing. One such command runs at a time.

## Building a bundle

`npm run bundle` runs `scripts/build.sh`, which wraps `tauri build`; extra arguments pass through (`npm run bundle -- --debug --bundles app`), except `--target`, which the script picks itself. The script prints where the `.app` and `.dmg` landed.

- **Universal** (`universal-apple-darwin`, under `<target>/universal-apple-darwin/`) when both `aarch64-apple-darwin` and `x86_64-apple-darwin` rustup targets are installed; otherwise the host architecture only (under `<target>/release/`), with a warning. `<target>` is Cargo's target dir (see [Target on the external SSD](#target-on-the-external-ssd)): `/Volumes/Thi2TB/cargo-target/coding-friend` on Thi's Mac.
- **Ad-hoc signed** by default (`signingIdentity: "-"` in `tauri.conf.json`). Set `APPLE_SIGNING_IDENTITY` to sign with a real identity; the script passes it as a `--config` override.
- **Updater artifacts** (`.app.tar.gz` and `.sig`) only when `TAURI_SIGNING_PRIVATE_KEY` is set, to the key itself or a path to the key file (the documented Tauri v2 variable; its password goes in `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). Without it the script turns `createUpdaterArtifacts` off, so local and VM builds need no key.

## Cargo build cache

This repo builds on an external SSD (next section), so `cargo build` / `cargo test` leave no `src-tauri/target/` here. `~/.cargo/config.toml` (outside git) sets no `target-dir`, only the dev profile. `src-tauri/Cargo.toml` repeats the same dev profile, which keeps the cache small; keep it identical to `~/.cargo/config.toml`:

```toml
[profile.dev]
opt-level = 1
split-debuginfo = "off"
incremental = false

[profile.dev.package."*"]
debug = "line-tables-only"
incremental = false
```

- Build one project at a time. Clean with `cargo sweep`.

## Target on the external SSD

This repo's build output lives on an external SSD to free space on the internal disk. A repo-root `.cargo/config.toml` (gitignored, one per machine) sends every build there. That covers `npm run tauri dev`, `cargo test`, `cargo clippy`, rust-analyzer and `npm run bundle`:

```sh
cp .cargo/config.toml.example .cargo/config.toml   # in the repo root; set the volume path if it differs
mkdir -p /Volumes/Thi2TB/cargo-target/coding-friend
```

Cargo reads config files from the current directory upward, and `$HOME` has the lowest priority. This `target-dir` therefore applies whether you run from the repo root, `app/` or `app/src-tauri/`. Check it in `src-tauri/`:

```sh
cargo metadata --no-deps --format-version 1 | jq -r .target_directory
```

An environment `CARGO_TARGET_DIR` still overrides both. `scripts/build.sh` unsets it, asks `cargo metadata` for the target dir, then runs `tauri build`; `release-app-local.sh` reads the bundle from the same place. The universal release bundle lands at `/Volumes/Thi2TB/cargo-target/coding-friend/universal-apple-darwin/release/bundle/macos/Coding Friend.app`, with the `.dmg` under `bundle/dmg/`. Without the repo config (CI, another machine) the target falls back to `src-tauri/target/`.

Unplug and replug: macOS mounts the volume at `/Volumes/Thi2TB` again. The path and Cargo's fingerprints stay valid, so the next build reuses the cache. While the SSD is out, builds fail (`failed to create directory /Volumes/Thi2TB/…`): `/Volumes` is root-owned, so Cargo cannot create the path. Nothing falls back to the internal disk. Plug the SSD in and rerun.

- **The SSD mounts as `Thi2TB 1`:** another volume with the same name is mounted. Eject that one (`diskutil list`, `diskutil unmount`), then remount the SSD so it gets `/Volumes/Thi2TB` back.
- **The volume was renamed:** update `target-dir` in `.cargo/config.toml`.
- **Builds still go to the internal disk:** `CARGO_TARGET_DIR` is set in the environment (`echo $CARGO_TARGET_DIR`).
- **Free space:** run `cargo sweep` in `src-tauri/`. It follows the same config. You can also delete `/Volumes/Thi2TB/cargo-target/coding-friend`. `cargo clean` only clears this repo's SSD directory.
- **Spotlight** indexes the SSD. If the SSD holds only caches, `sudo mdutil -i off /Volumes/Thi2TB` stops that (optional).

`node_modules` stays on the internal disk: a copy on another volume would not save space. `~/.tauri` holds updater signing keys, not a cache.

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
