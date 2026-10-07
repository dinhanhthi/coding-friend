import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/version-info.js", () => ({
  collectVersionInfo: vi.fn((cli: string) => ({
    cli,
    contractVersion: 1,
    hosts: {
      claude: { installed: true, version: "0.46.0" },
      codex: { installed: false, version: null },
      omp: { installed: true, version: null },
      agy: { installed: false, version: null },
      devin: { installed: true, version: "0.43.0" },
    },
  })),
}));

import { versionCommand } from "../version.js";

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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("versionCommand", () => {
  it("prints the cli line and one line per host in human mode", async () => {
    await versionCommand("1.42.0", {});
    expect(stdout).toEqual([]);
    expect(logs).toEqual([
      "CLI    1.42.0",
      "claude 0.46.0",
      "codex  (not installed)",
      "omp    (installed)",
      "agy    (not installed)",
      "devin  0.43.0",
    ]);
  });

  it("writes a single ok envelope in json mode", async () => {
    await versionCommand("1.42.0", { json: true });
    expect(logs).toEqual([]);
    expect(stdout).toHaveLength(1);
    const env = JSON.parse(stdout[0]);
    expect(env.ok).toBe(true);
    expect(env.error).toBeNull();
    expect(env.data.cli).toBe("1.42.0");
    expect(env.data.hosts.devin).toEqual({ installed: true, version: "0.43.0" });
  });
});
