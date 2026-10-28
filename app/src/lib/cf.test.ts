import { describe, expect, it } from "vitest";

import {
  INSTALL_COMMAND,
  RUNNABLE_FIXES,
  UPDATE_COMMAND,
  isCopyableCommand,
  isRunnableFix,
} from "./cf";

describe("isCopyableCommand", () => {
  it.each([
    "cf mcp",
    "cf memory start-daemon",
    "cf install --user",
    INSTALL_COMMAND,
    UPDATE_COMMAND,
  ])("accepts %s", (hint) => {
    expect(isCopyableCommand(hint)).toBe(true);
  });

  it.each([
    "/cf-learn",
    "Upgrade codex to >= 0.161",
    "cf mcp; rm -rf ~",
    "cf $(x)",
    "cf mcp\nrm -rf ~",
  ])("rejects %j", (hint) => {
    expect(isCopyableCommand(hint)).toBe(false);
  });
});

describe("isRunnableFix", () => {
  it.each(RUNNABLE_FIXES.map((fix) => [fix]))("accepts %j", (argv) => {
    expect(isRunnableFix(argv)).toBe(true);
  });

  it.each([
    [["install", "supervisor", "--json"]],
    [["supervisor", "install", "--json", "--force"]],
    [["update", "--yes", "--json"]],
  ])("rejects %j", (argv) => {
    expect(isRunnableFix(argv)).toBe(false);
  });
});
