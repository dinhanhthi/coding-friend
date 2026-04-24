import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { printBoxed } from "../log.js";

const identity = (s: string): string => s;

let logSpy: ReturnType<typeof vi.spyOn>;
let output: string[];

beforeEach(() => {
  output = [];
  logSpy = vi.spyOn(console, "log").mockImplementation((msg: unknown) => {
    output.push(String(msg));
  });
});

afterEach(() => {
  logSpy.mockRestore();
});

describe("printBoxed", () => {
  it("wraps a single line in a frame with 1-char padding", () => {
    printBoxed("hello", { color: identity });

    expect(output).toEqual(["┌───────┐", "│ hello │", "└───────┘"]);
  });

  it("pads shorter lines so the right border aligns", () => {
    printBoxed("aa\nbbbb\ncc", { color: identity });

    expect(output).toEqual([
      "┌──────┐",
      "│ aa   │",
      "│ bbbb │",
      "│ cc   │",
      "└──────┘",
    ]);
  });

  it("strips leading and trailing blank lines", () => {
    printBoxed("\n\nhi\n\n", { color: identity });

    expect(output).toEqual(["┌────┐", "│ hi │", "└────┘"]);
  });

  it("respects a custom padding option", () => {
    printBoxed("x", { color: identity, padding: 3 });

    expect(output).toEqual(["┌───────┐", "│   x   │", "└───────┘"]);
  });

  it("treats emoji as two visual columns for alignment", () => {
    printBoxed("🎉\nab", { color: identity });

    const [top, row1, row2, bot] = output;
    expect(top.length).toBe(bot.length);
    expect(row1.length).toBe(row2.length);
    expect(row1.startsWith("│ 🎉")).toBe(true);
  });

  it("does not throw on empty content", () => {
    expect(() => printBoxed("", { color: identity })).not.toThrow();
    expect(() => printBoxed("\n\n", { color: identity })).not.toThrow();
  });

  it("prints nothing for content that is only whitespace newlines", () => {
    printBoxed("\n\n\n", { color: identity });
    expect(output).toEqual([]);
  });
});
