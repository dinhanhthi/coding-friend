import { describe, it, expect } from "vitest";
import { slugify, truncate, capitalize, camelToKebab } from "../string-utils";

describe("slugify", () => {
  it("converts a string to a URL slug", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("foo   bar")).toBe("foo-bar");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  hello  ")).toBe("hello");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });
});

describe("truncate", () => {
  it("truncates a long string and adds ellipsis", () => {
    expect(truncate("Hello World", 5)).toBe("Hello...");
  });

  it("returns the full string if shorter than limit", () => {
    expect(truncate("Hi", 10)).toBe("Hi");
  });

  it("handles exact length", () => {
    expect(truncate("Hello", 5)).toBe("Hello");
  });
});

describe("capitalize", () => {
  it("capitalizes the first letter", () => {
    expect(capitalize("hello")).toBe("Hello");
  });

  it("handles empty string", () => {
    expect(capitalize("")).toBe("");
  });

  it("handles already capitalized", () => {
    expect(capitalize("Hello")).toBe("Hello");
  });
});

describe("camelToKebab", () => {
  it("converts camelCase to kebab-case", () => {
    expect(camelToKebab("helloWorld")).toBe("hello-world");
  });

  it("handles multiple uppercase letters", () => {
    expect(camelToKebab("myFooBar")).toBe("my-foo-bar");
  });

  it("handles single word", () => {
    expect(camelToKebab("hello")).toBe("hello");
  });
});
