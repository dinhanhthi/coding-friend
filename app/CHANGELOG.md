# Changelog (App)

> Plugin changelog: [`plugin/CHANGELOG.md`](../plugin/CHANGELOG.md) · CLI changelog: [`cli/CHANGELOG.md`](../cli/CHANGELOG.md)

## v0.1.1 (2026-11-08)

- New look: system font, overlay titlebar, source-list sidebar with a Rex-style selected item, and full-width split views with pane headers [#48ad7cf9](https://github.com/dinhanhthi/coding-friend/commit/48ad7cf9) [#4c5ffe1f](https://github.com/dinhanhthi/coding-friend/commit/4c5ffe1f) [#dd760749](https://github.com/dinhanhthi/coding-friend/commit/dd760749)
- Fix the scrollbar gutter, the Doctor rows and long names in lists [#270887d7](https://github.com/dinhanhthi/coding-friend/commit/270887d7)
- Harden the bridge to `cf`: ids starting with `/` and invisible Unicode format characters are refused, docs named like `-notes.md` open, a second link is refused while one confirm dialog is open, and the reply confirm shows the question taken from the task, quoted and cut [#7440c21a](https://github.com/dinhanhthi/coding-friend/commit/7440c21a)
- Show a hint when `cf` times out because macOS may be asking for folder access [#7440c21a](https://github.com/dinhanhthi/coding-friend/commit/7440c21a)
- The note editor disables its actions while refreshing and refuses a body over 1 MiB before the confirm dialog [#7440c21a](https://github.com/dinhanhthi/coding-friend/commit/7440c21a)
- The task panel stops polling when the task is gone, keeps stable list keys, hides Cancel once the task is finished and ignores an answer about another task; detail panes scroll to the top on a new selection and the Sessions storage badge refreshes after a save [#7f5a71f3](https://github.com/dinhanhthi/coding-friend/commit/7f5a71f3)

## v0.1.0 (2026-11-06)

- First release of the Coding Friend desktop app (macOS, Tauri): a project dashboard, Doctor and Version/Update views, a tray icon and signed self-update, all built on the `cf` CLI's JSON interface [#b2b6d9ab](https://github.com/dinhanhthi/coding-friend/commit/b2b6d9ab) [#51cf3526](https://github.com/dinhanhthi/coding-friend/commit/51cf3526) [#5115d054](https://github.com/dinhanhthi/coding-friend/commit/5115d054) [#14b61d2f](https://github.com/dinhanhthi/coding-friend/commit/14b61d2f)
- Add a config editor, memory and learn screens, and per-project health checks [#d0eed030](https://github.com/dinhanhthi/coding-friend/commit/d0eed030) [#f15d7caf](https://github.com/dinhanhthi/coding-friend/commit/f15d7caf) [#58a6471e](https://github.com/dinhanhthi/coding-friend/commit/58a6471e)
- Add a Sessions view with redacted export, save and load, plus storage and sync status [#641aa6ea](https://github.com/dinhanhthi/coding-friend/commit/641aa6ea)
- Add a task panel with live follow, replies to worker questions and cancel [#650a911b](https://github.com/dinhanhthi/coding-friend/commit/650a911b)
