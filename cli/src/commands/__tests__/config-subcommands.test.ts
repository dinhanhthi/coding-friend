import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CliError } from "../../lib/output.js";

vi.mock("../../lib/config-ops.js", async (orig) => ({
  ...(await orig<typeof import("../../lib/config-ops.js")>()),
  getConfigView: vi.fn(() => ({ key: "tdd", value: true, source: "local" })),
  setConfigValue: vi.fn(() => {
    throw new CliError(
      "INVALID_ARGS",
      "cf config set needs --global or --local",
    );
  }),
}));

vi.mock("../../lib/config.js", () => ({
  getConfigJsonSchema: vi.fn(() => ({ type: "object" })),
}));

import {
  configGetCommand,
  configSetCommand,
  configSchemaCommand,
} from "../config-subcommands.js";

let stdout: string[];
let logs: string[];

beforeEach(() => {
  stdout = [];
  logs = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    stdout.push(String(chunk));
    return true;
  });
  vi.spyOn(console, "log").mockImplementation((...args) => {
    logs.push(args.join(" "));
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("config subcommands", () => {
  it("get prints a one-line value in human mode", async () => {
    await configGetCommand("tdd", {});
    expect(stdout).toEqual([]);
    expect(logs).toEqual(["tdd = true (local)"]);
  });

  it("get writes a single ok envelope in json mode", async () => {
    await configGetCommand("tdd", { json: true });
    expect(logs).toEqual([]);
    const env = JSON.parse(stdout.join(""));
    expect(env).toMatchObject({
      ok: true,
      data: { key: "tdd", value: true, source: "local" },
    });
  });

  it("set reports a CliError as an error envelope in json mode", async () => {
    await configSetCommand("tdd", "true", { json: true });
    const env = JSON.parse(stdout.join(""));
    expect(env).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
    expect(process.exitCode).toBe(1);
  });

  it("set logs the error before exiting 1 in human mode", async () => {
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    await configSetCommand("tdd", "true", {});
    expect(logs.join("\n")).toContain(
      "cf config set needs --global or --local",
    );
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("schema pretty-prints the JSON schema in human mode", async () => {
    await configSchemaCommand({});
    expect(logs).toEqual([JSON.stringify({ type: "object" }, null, 2)]);
  });
});
