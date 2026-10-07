import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getLogMode,
  log,
  printBanner,
  printBoxed,
  setLogMode,
} from "../log.js";

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
  setLogMode("human");
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

describe("log mode", () => {
  it("routes every log helper, printBanner and printBoxed to stderr in json mode", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setLogMode("json");

    for (const fn of Object.values(log)) fn("msg");
    printBanner("title", { color: identity });
    printBoxed("box", { color: identity });

    expect(getLogMode()).toBe("json");
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(Object.keys(log).length + 6);
    errorSpy.mockRestore();
  });

  it("switches back to console.log in human mode", () => {
    setLogMode("json");
    setLogMode("human");

    log.dim("back");

    expect(getLogMode()).toBe("human");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
