# E2E Tests

End-to-end tests for the `coding-friend-cli`. Unlike unit tests (which mock dependencies), E2E tests run actual CLI commands against real temp directories to catch integration bugs.

## Running locally

From the `cli/` directory:

```bash
npm run test:e2e
```

This uses a separate Vitest config (`vitest.e2e.config.ts`) with longer timeouts (60s per test). E2E tests are excluded from the regular `npm test` run.

## Running in Docker (isolated)

For a clean, reproducible environment (no host pollution):

```bash
cd cli/e2e
docker compose up --build --abort-on-container-exit
```

This builds a `node:20-slim` image, installs + builds the CLI from source, links `cf` globally, and runs all E2E tests inside the container.

## Structure

```
e2e/
├── README.md                    # This file
├── Dockerfile                   # Docker image for isolated E2E runs
├── docker-compose.yml           # Compose config for easy Docker runs
├── helpers.ts                   # runCf() helper — captures stdout, stderr, exitCode
├── config-validation.test.ts    # Tests for Zod config schema warnings
└── memory.test.ts               # Tests for cf memory commands
```

## Writing new tests

Each test should:

1. Create a temp directory with the minimal project structure needed
2. Run `cf` commands via the `runCf()` helper
3. Assert on stdout, stderr, and/or exit code
4. Clean up the temp directory in `afterEach`

Example:

```typescript
import { runCf } from "./helpers.js";

it("shows help output", () => {
  const result = runCf(["help"]);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain("Usage:");
});
```

The `runCf()` helper runs `npx tsx ../src/index.ts <args>` (source mode). In Docker, it runs against the built `dist/` via `npm link`.

### Checking warnings (stderr)

`log.warn` and `log.error` write to stderr. Combine both streams when asserting on warnings:

```typescript
const result = runCf(["memory", "status"], { cwd: testDir });
const output = result.stdout + result.stderr;
expect(output).toContain("some warning");
```

## Priority test cases

Ordered by importance (confirmed real bugs first):

1. `cf update` — known issues with plugin update flow
2. `cf install` / `cf uninstall` — destructive, hard to reverse
3. `cf memory start-daemon` / `stop-daemon` / `status` — daemon lifecycle
4. Config validation — invalid types, unknown keys, typo detection
