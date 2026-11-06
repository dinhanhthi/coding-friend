import { describe, it, expect } from "vitest";
import { CommanderError } from "commander";
import { shouldSkipPostAction, toUsageEnvelope } from "../json-guard.js";

describe("shouldSkipPostAction", () => {
  it("skips when the action command has --json", () => {
    expect(shouldSkipPostAction({ opts: () => ({ json: true }) })).toBe(true);
  });

  it("does not skip in human mode", () => {
    expect(shouldSkipPostAction({ opts: () => ({}) })).toBe(false);
  });
});

describe("toUsageEnvelope", () => {
  it("turns a commander usage error into a USAGE envelope", () => {
    const err = new CommanderError(
      1,
      "commander.unknownOption",
      "error: unknown option '--json'",
    );
    expect(toUsageEnvelope(err)).toEqual({
      contractVersion: 1,
      ok: false,
      data: null,
      error: { code: "USAGE", message: "error: unknown option '--json'" },
    });
  });

  it.each([
    [0, "commander.helpDisplayed"],
    [0, "commander.version"],
    [1, "commander.help"],
  ])(
    "returns null for help/version display (exit %i, %s)",
    (exitCode, code) => {
      expect(
        toUsageEnvelope(new CommanderError(exitCode, code, "x")),
      ).toBeNull();
    },
  );
});
