import { describe, it, expect } from "vitest";
import { chunk, unique, groupBy } from "../array-utils";

describe("chunk", () => {
  it("splits an array into chunks of given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns a single chunk if size is larger than array", () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it("returns empty array for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });
});

describe("unique", () => {
  it("removes duplicate values", () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
  });

  it("works with strings", () => {
    expect(unique(["a", "b", "a"])).toEqual(["a", "b"]);
  });

  it("returns empty array for empty input", () => {
    expect(unique([])).toEqual([]);
  });
});

describe("groupBy", () => {
  it("groups objects by a key", () => {
    const data = [
      { type: "fruit", name: "apple" },
      { type: "veggie", name: "carrot" },
      { type: "fruit", name: "banana" },
    ];
    const result = groupBy(data, "type");
    expect(result).toEqual({
      fruit: [
        { type: "fruit", name: "apple" },
        { type: "fruit", name: "banana" },
      ],
      veggie: [{ type: "veggie", name: "carrot" }],
    });
  });

  it("returns empty object for empty input", () => {
    expect(groupBy([], "key")).toEqual({});
  });
});
