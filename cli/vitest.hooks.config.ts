import { defineConfig } from "vitest/config";

/**
 * Dedicated vitest config for plugin tests.
 *
 * Picks up `.test.cjs` under `plugin/` __tests__ dirs and
 * `plugin/omp/__tests__/*.test.ts`. `.cjs` files use implicit `describe` /
 * `it` / `expect` globals — they do not import from `"vitest"`. We enable
 * `globals: true` so vitest injects those APIs, which keeps the `.cjs` files
 * simple and avoids the `ERR_REQUIRE_ESM` pitfall of requiring ESM-only
 * vitest from CJS.
 *
 * Run with: npm run test:hooks (or as part of `npm test`).
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "../plugin/**/__tests__/**/*.test.cjs",
      "../plugin/omp/__tests__/**/*.test.ts",
    ],
    // Hook tests shell out to real scripts — keep them serial to avoid races
    // on shared tmp paths / env.
    fileParallelism: false,
  },
});
