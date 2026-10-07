import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return { ...actual, writeSync: vi.fn() };
});

import { writeSync } from "fs";
import { CliError, runHuman, runJson } from "../output.js";
import { getLogMode, log } from "../log.js";

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let savedExitCode: typeof process.exitCode;

beforeEach(() => {
  savedExitCode = process.exitCode;
  stdoutSpy = vi
    .spyOn(process.stdout, "write")
    .mockImplementation(() => true);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.exitCode = savedExitCode;
  vi.restoreAllMocks();
  vi.mocked(writeSync).mockReset();
});

function stdoutEnvelope(): unknown {
  expect(stdoutSpy).toHaveBeenCalledTimes(1);
  return JSON.parse(String(stdoutSpy.mock.calls[0][0]));
}

describe("runJson", () => {
  it("writes an ok envelope exactly once to stdout", async () => {
    await runJson(() => ({ a: 1 }));

    expect(stdoutEnvelope()).toEqual({
      contractVersion: 1,
      ok: true,
      data: { a: 1 },
      error: null,
    });
    expect(process.exitCode).toBe(savedExitCode);
  });

  it("writes an error envelope and sets exitCode 1 for CliError", async () => {
    await runJson(async () => {
      throw new CliError("NOT_FOUND", "no such thing");
    });

    expect(stdoutEnvelope()).toEqual({
      contractVersion: 1,
      ok: false,
      data: null,
      error: { code: "NOT_FOUND", message: "no such thing" },
    });
    expect(process.exitCode).toBe(1);
  });

  it("maps non-CliError errors to INTERNAL", async () => {
    await runJson(() => {
      throw new Error("boom");
    });

    expect(stdoutEnvelope()).toMatchObject({
      ok: false,
      error: { code: "INTERNAL", message: "boom" },
    });
  });

  it("redirects console.log to stderr during fn and restores it after", async () => {
    const originalLog = console.log;

    await runJson(() => {
      console.log("noise", 42);
      return null;
    });

    expect(errorSpy).toHaveBeenCalledWith("noise", 42);
    expect(console.log).toBe(originalLog);
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
  });

  it("restores console.log even when fn throws", async () => {
    const originalLog = console.log;

    await runJson(() => {
      throw new Error("x");
    });

    expect(console.log).toBe(originalLog);
    expect(getLogMode()).toBe("human");
  });

  it("switches log mode to json during fn and restores it after", async () => {
    let modeInside: string | undefined;

    await runJson(() => {
      modeInside = getLogMode();
      log.info("hello");
      return null;
    });

    expect(modeInside).toBe("json");
    expect(errorSpy).toHaveBeenCalledWith(expect.anything(), "hello");
    expect(getLogMode()).toBe("human");
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
  });

  it("exit fallback writes UNEXPECTED_EXIT when no envelope was written", async () => {
    const onceSpy = vi.spyOn(process, "once");

    await runJson(() => {
      const call = onceSpy.mock.calls.find(([event]) => event === "exit");
      const handler = call?.[1] as (code: number) => void;
      handler(0);
      return { late: true };
    });

    expect(writeSync).toHaveBeenCalledTimes(1);
    const [fd, text] = vi.mocked(writeSync).mock.calls[0];
    expect(fd).toBe(1);
    expect(JSON.parse(String(text))).toMatchObject({
      contractVersion: 1,
      ok: false,
      data: null,
      error: { code: "UNEXPECTED_EXIT" },
    });
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});

describe("runHuman", () => {
  it("exits 1 on CliError without printing anything", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await runHuman(() => {
      throw new CliError("INVALID_ARGS", "bad");
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("rethrows non-CliError errors", async () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(() => undefined as never);

    await expect(
      runHuman(() => {
        throw new Error("other");
      }),
    ).rejects.toThrow("other");
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
