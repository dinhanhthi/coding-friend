import assert from "node:assert/strict";
import test from "node:test";

import { formatDuration } from "../src/duration.js";

test("formats hours, minutes and seconds", () => {
  assert.equal(formatDuration(3725), "1h 2m 5s");
});

test("skips units with a zero value", () => {
  assert.equal(formatDuration(3605), "1h 5s");
});

test("returns 0s for zero, negative and non-finite input", () => {
  assert.equal(formatDuration(0), "0s");
  assert.equal(formatDuration(-5), "0s");
  assert.equal(formatDuration(Number.NaN), "0s");
});

test("keeps only the largest units when maxParts is set", () => {
  assert.equal(formatDuration(3725, { maxParts: 2 }), "1h 2m");
  assert.equal(formatDuration(3725, { maxParts: 1 }), "1h");
  assert.equal(formatDuration(3605, { maxParts: 2 }), "1h 5s");
});

test("falls back to every unit when maxParts is not a usable count", () => {
  assert.equal(formatDuration(3725, { maxParts: 0 }), "1h 2m 5s");
  assert.equal(formatDuration(3725, { maxParts: 2.5 }), "1h 2m 5s");
  assert.equal(formatDuration(3725, { maxParts: 99 }), "1h 2m 5s");
});
