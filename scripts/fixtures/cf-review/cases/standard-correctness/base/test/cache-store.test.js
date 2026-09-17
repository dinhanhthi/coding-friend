import assert from "node:assert/strict";
import test from "node:test";

import { CacheStore } from "../src/cache-store.js";

function fakeClock(start = 0) {
  let now = start;
  const clock = () => now;
  clock.advance = (ms) => {
    now += ms;
  };
  return clock;
}

test("returns a stored value inside the ttl", () => {
  const clock = fakeClock();
  const store = new CacheStore(1000, clock);
  store.set("a", 1);
  clock.advance(500);
  assert.equal(store.get("a"), 1);
});

test("drops a value once the ttl has passed", () => {
  const clock = fakeClock();
  const store = new CacheStore(1000, clock);
  store.set("a", 1);
  clock.advance(1500);
  assert.equal(store.get("a"), undefined);
  assert.equal(store.size, 0);
});

test("returns undefined for an unknown key", () => {
  const store = new CacheStore(1000, fakeClock());
  assert.equal(store.get("missing"), undefined);
});
