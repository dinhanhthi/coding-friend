import { describe, it, expect } from "vitest";
import { flattenJson, filterKeys, sortByField } from "../transform";

describe("flattenJson", () => {
  it("flattens a nested object", () => {
    const input = { a: { b: 1, c: { d: 2 } } };
    expect(flattenJson(input)).toEqual({
      "a.b": 1,
      "a.c.d": 2,
    });
  });

  it("returns flat object unchanged", () => {
    const input = { x: 1, y: 2 };
    expect(flattenJson(input)).toEqual({ x: 1, y: 2 });
  });

  it("handles empty object", () => {
    expect(flattenJson({})).toEqual({});
  });
});

describe("filterKeys", () => {
  it("keeps only specified keys", () => {
    const input = { name: "Alice", age: 30, email: "a@b.com" };
    expect(filterKeys(input, ["name", "email"])).toEqual({
      name: "Alice",
      email: "a@b.com",
    });
  });

  it("ignores keys that do not exist", () => {
    const input = { a: 1 };
    expect(filterKeys(input, ["a", "b"])).toEqual({ a: 1 });
  });
});

describe("sortByField", () => {
  it("sorts objects by a numeric field", () => {
    const input = [
      { name: "Charlie", age: 35 },
      { name: "Alice", age: 25 },
      { name: "Bob", age: 30 },
    ];
    const result = sortByField(input, "age");
    expect(result.map((r) => r.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("sorts objects by a string field", () => {
    const input = [{ name: "Charlie" }, { name: "Alice" }, { name: "Bob" }];
    const result = sortByField(input, "name");
    expect(result.map((r) => r.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  // NOTE: Missing test for null values — sortByField crashes on nulls
});
