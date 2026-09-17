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

test("accepts the retryFailed option", async () => {
  const handlers = { runTask: async (task) => task.id };
  const { results } = await runBatch([{ id: "a" }], handlers, {
    retryFailed: true,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].attempts, 1);
});

test("writes each finished value into the cache when one is given", async () => {
  const written = [];
  const handlers = {
    runTask: async (task) => task.id,
    cache: { set: (key, value) => written.push([key, value]) },
  };

  await runBatch([{ id: "a" }, { id: "b" }], handlers);

  assert.deepEqual(written, [
    ["a", "a"],
    ["b", "b"],
  ]);
});
