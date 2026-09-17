import assert from "node:assert/strict";
import test from "node:test";

import { runBatch } from "../src/batch-runner.js";

test("runs every task in order and reports the last value", async () => {
  const seen = [];
  const handlers = {
    runTask: async (task) => {
      seen.push(task.id);
      return task.id.toUpperCase();
    },
  };

  const { results, lastValue } = await runBatch(
    [{ id: "a" }, { id: "b" }],
    handlers,
  );

  assert.deepEqual(seen, ["a", "b"]);
  assert.equal(results.length, 2);
  assert.equal(lastValue, "B");
});

test("returns an undefined last value for an empty task list", async () => {
  const { results, lastValue } = await runBatch([], { runTask: async () => 1 });
  assert.equal(results.length, 0);
  assert.equal(lastValue, undefined);
});
