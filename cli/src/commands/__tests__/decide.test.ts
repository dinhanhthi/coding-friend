import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { appendDecisionLog } from "../../lib/decide-log.js";
import { decideLogCommand, decideTestCommand } from "../decide.js";

let root: string;

beforeEach(() => {
  process.exitCode = undefined;
  root = mkdtempSync(join(tmpdir(), "cf-decide-cmd-"));
  vi.stubEnv("HOME", join(root, "home"));
  vi.stubEnv("CF_DECISIONS_DIR", join(root, "decisions"));
  // UTC+7, no DST: local midnight of 2026-11-05 is 2026-11-04T17:00Z.
  vi.stubEnv("TZ", "Asia/Ho_Chi_Minh");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

async function captureJson(
  fn: () => Promise<void>,
): Promise<Record<string, unknown>> {
  const writes: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  }) as typeof process.stdout.write);
  try {
    await fn();
  } finally {
    vi.mocked(process.stdout.write).mockRestore();
  }
  return JSON.parse(writes.join(""));
}

const logJson = (since: string) =>
  captureJson(() => decideLogCommand({ since, json: true }));

describe("cf decide log --since", () => {
  it("reads a bare date as local midnight", async () => {
    // 2026-11-04T20:00Z is 2026-11-05 03:00 local: on the --since day.
    appendDecisionLog({
      v: 1,
      ts: "2026-11-04T20:00:00.000Z",
      point: "test",
      provider: "local",
      model: "kev-latest",
      ok: true,
    });

    const env = await logJson("2026-11-05");

    expect(env).toMatchObject({
      ok: true,
      data: {
        since: "2026-11-04T17:00:00.000Z",
        lines: { test: 1 },
      },
    });
  });

  it("refuses a bare date that does not exist", async () => {
    const env = await logJson("2026-02-31");

    expect(env).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
  });
});

describe("cf decide test config check", () => {
  // A non-http(s) baseUrl is a config error, not a closed gate.
  it("reports an ftp baseUrl as invalid config, never the allowRemote gate", async () => {
    const dir = join(root, "home", ".coding-friend");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({
        decision: { provider: "local", baseUrl: "ftp://127.0.0.1" },
      }),
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const env = (await captureJson(() =>
      decideTestCommand({ json: true }),
    )) as { ok: boolean; error: { code: string; message: string } };

    expect(env).toMatchObject({ ok: false, error: { code: "INVALID_ARGS" } });
    expect(env.error.message).toContain("decision.baseUrl is not a valid");
    expect(env.error.message).not.toContain("gate");
    expect(env.error.message).not.toContain("allowRemote");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
