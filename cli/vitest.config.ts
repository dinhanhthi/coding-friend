import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
    // Many tests drive real git and child processes; under a loaded machine
    // the 5 s default times out tests that are not racy, just slow.
    testTimeout: 20_000,
  },
});
