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
