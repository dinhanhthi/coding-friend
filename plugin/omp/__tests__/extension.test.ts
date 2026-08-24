import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn(),
}));

import createExtension from "../extension.js";
import type { HookAPI } from "../pi-types.js";

const spawnSyncMock = vi.mocked(spawnSync);
const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(TEST_DIR, "../..");
const EXTENSION_SOURCE = resolve(TEST_DIR, "../extension.ts");

type HookHandler = (...args: unknown[]) => unknown;

function spawnResult(
  overrides: {
    status?: number | null;
    stdout?: string;
    stderr?: string;
    error?: Error;
  } = {},
) {
  return {
    pid: 123,
    output: ["", overrides.stdout ?? "", overrides.stderr ?? ""] as [
      string | null,
      string,
      string,
    ],
    stdout: overrides.stdout ?? "",
    stderr: overrides.stderr ?? "",
    status: overrides.status === undefined ? 0 : overrides.status,
    signal: null,
    error: overrides.error,
  };
}

function loadExtension(sendMessage: HookAPI["sendMessage"] = vi.fn()) {
  const registered: Record<string, HookHandler> = {};
  const pi: HookAPI = {
    on(event, handler) {
      registered[event] = handler;
    },
    sendMessage,
  };
  createExtension(pi);
  return { registered, sendMessage, pi };
}

const tmpDirs: string[] = [];

function makeTemp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

beforeEach(() => {
  vi.stubEnv("CODING_FRIEND_PLUGIN_ROOT", PLUGIN_ROOT);
  spawnSyncMock.mockReset();
  spawnSyncMock.mockReturnValue(spawnResult());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const dir of tmpDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("omp extension spawnSync adapter", () => {
  it("blocks tool_call when privacy-block.sh is missing", () => {
    vi.stubEnv("CODING_FRIEND_PLUGIN_ROOT", makeTemp("cf-omp-no-hooks-"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { registered } = loadExtension();

    const result = registered.tool_call?.({
      toolName: "Read",
      input: { file_path: ".env" },
    });

    expect(result).toEqual(
      expect.objectContaining({
        block: true,
        reason: expect.stringMatching(/missing|privacy-block/i),
      }),
    );
    expect(spawnSyncMock).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
  });

  it("maps privacy-block exit 2 to { block: true }", () => {
    spawnSyncMock.mockImplementation((_cmd, args) => {
      const file = String(args?.[0] ?? "");
      if (file.endsWith("privacy-block.sh")) {
        return spawnResult({ status: 2, stderr: "blocked by privacy-block" });
      }
      return spawnResult();
    });
    const { registered } = loadExtension();

    const result = registered.tool_call?.({
      toolName: "Read",
      input: { file_path: ".env" },
    });

    expect(result).toEqual({
      block: true,
      reason: "blocked by privacy-block",
    });
  });

  it("blocks tool_call when privacy-block spawnSync sets error", () => {
    spawnSyncMock.mockReturnValue(
      spawnResult({
        status: null,
        error: new Error("spawn ENOENT"),
        stderr: "",
      }),
    );
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { registered } = loadExtension();

    const result = registered.tool_call?.({
      toolName: "Read",
      input: { file_path: ".env" },
    });

    expect(result).toEqual(
      expect.objectContaining({
        block: true,
        reason: "spawn ENOENT",
      }),
    );
    expect(err).toHaveBeenCalled();
  });

  it("blocks tool_call when privacy-block status is null", () => {
    spawnSyncMock.mockReturnValue(spawnResult({ status: null, stderr: "" }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { registered } = loadExtension();

    const result = registered.tool_call?.({
      toolName: "Read",
      input: { file_path: ".env" },
    });

    expect(result).toMatchObject({ block: true });
    expect(err).toHaveBeenCalled();
  });

  it("sets CF_HOST=omp on spawned hook env", () => {
    const { registered } = loadExtension();
    registered.tool_call?.({
      toolName: "Read",
      input: { file_path: "src/app.ts" },
    });

    expect(spawnSyncMock).toHaveBeenCalled();
    for (const call of spawnSyncMock.mock.calls) {
      const options = call[2] as { env?: NodeJS.ProcessEnv } | undefined;
      expect(options?.env?.CF_HOST).toBe("omp");
    }
  });

  function lastHookInput(): Record<string, unknown> {
    expect(spawnSyncMock).toHaveBeenCalled();
    const options = spawnSyncMock.mock.calls[0]?.[2] as
      | { input?: string }
      | undefined;
    return JSON.parse(String(options?.input ?? "{}")) as Record<
      string,
      unknown
    >;
  }

  it("maps omp input.path to tool_input.file_path for privacy-block", () => {
    const { registered } = loadExtension();
    registered.tool_call?.({
      toolName: "read",
      input: { path: ".env" },
    });

    const parsed = lastHookInput();
    expect(parsed.tool_name).toBe("read");
    expect(parsed.tool_input).toEqual(
      expect.objectContaining({ path: ".env", file_path: ".env" }),
    );
    const privacyCall = spawnSyncMock.mock.calls.find((call) =>
      String(call[1]?.[0] ?? "").endsWith("privacy-block.sh"),
    );
    expect(privacyCall).toBeDefined();
    const privacyInput = JSON.parse(
      String((privacyCall?.[2] as { input?: string } | undefined)?.input ?? "{}"),
    ) as { tool_input?: { file_path?: string } };
    expect(privacyInput.tool_input?.file_path).toBe(".env");
  });

  it("maps omp paths[] and hashline input to file_path", () => {
    const { registered } = loadExtension();
    registered.tool_call?.({
      toolName: "glob",
      input: { paths: [".aws/credentials"] },
    });
    expect(
      (
        JSON.parse(
          String(
            (spawnSyncMock.mock.calls[0]?.[2] as { input?: string })?.input ??
              "{}",
          ),
        ) as { tool_input?: { file_path?: string } }
      ).tool_input?.file_path,
    ).toBe(".aws/credentials");

    spawnSyncMock.mockClear();
    spawnSyncMock.mockReturnValue(spawnResult());
    registered.tool_call?.({
      toolName: "edit",
      input: { input: "[.ssh/id_rsa#HEAD]" },
    });
    expect(
      (
        JSON.parse(
          String(
            (spawnSyncMock.mock.calls[0]?.[2] as { input?: string })?.input ??
              "{}",
          ),
        ) as { tool_input?: { file_path?: string } }
      ).tool_input?.file_path,
    ).toBe(".ssh/id_rsa");
  });

  it("strips omp :raw selectors and hashlines inside Begin Patch", () => {
    const { registered } = loadExtension();
    registered.tool_call?.({
      toolName: "read",
      input: { path: ".env:raw" },
    });
    expect(
      (
        JSON.parse(
          String(
            (spawnSyncMock.mock.calls[0]?.[2] as { input?: string })?.input ??
              "{}",
          ),
        ) as { tool_input?: { file_path?: string } }
      ).tool_input?.file_path,
    ).toBe(".env");

    spawnSyncMock.mockClear();
    spawnSyncMock.mockReturnValue(spawnResult());
    registered.tool_call?.({
      toolName: "edit",
      input: {
        input: "*** Begin Patch\n[.env#A1B2]\nPUT 1.=1:\n+x\n*** End Patch",
      },
    });
    expect(
      (
        JSON.parse(
          String(
            (spawnSyncMock.mock.calls[0]?.[2] as { input?: string })?.input ??
              "{}",
          ),
        ) as { tool_input?: { file_path?: string } }
      ).tool_input?.file_path,
    ).toContain(".env");
  });

  it("blocks tool_call when scout-block exits 2 after privacy allows", () => {
    spawnSyncMock.mockImplementation((_cmd, args) => {
      const file = String(args?.[0] ?? "");
      if (file.endsWith("privacy-block.sh")) {
        return spawnResult({ status: 0, stdout: "{}" });
      }
      if (file.endsWith("scout-block.cjs")) {
        return spawnResult({ status: 2, stderr: "blocked by scout-block" });
      }
      return spawnResult();
    });
    const { registered } = loadExtension();

    const result = registered.tool_call?.({
      toolName: "read",
      input: { path: "node_modules/pkg/index.js" },
    });

    expect(result).toEqual({
      block: true,
      reason: "blocked by scout-block",
    });
    const scripts = spawnSyncMock.mock.calls.map((call) =>
      String(call[1]?.[0] ?? ""),
    );
    expect(scripts.some((file) => file.endsWith("privacy-block.sh"))).toBe(
      true,
    );
    expect(scripts.some((file) => file.endsWith("scout-block.cjs"))).toBe(
      true,
    );
  });

  it("does not use eval or shell: true", () => {
    const source = readFileSync(EXTENSION_SOURCE, "utf8");
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toMatch(/shell:\s*true/);

    const { registered } = loadExtension();
    registered.tool_call?.({
      toolName: "Read",
      input: { file_path: "src/app.ts" },
    });

    expect(spawnSyncMock).toHaveBeenCalled();
    for (const call of spawnSyncMock.mock.calls) {
      expect(Array.isArray(call[1])).toBe(true);
      const options = call[2] as { shell?: boolean } | undefined;
      expect(options?.shell).not.toBe(true);
    }
  });
});

describe("omp extension event contracts", () => {
  it("registers official compact event names", () => {
    const { registered } = loadExtension();
    expect(registered["session_before_compact"]).toBeTypeOf("function");
    expect(registered["session.compacting"]).toBeTypeOf("function");
    expect(registered["session_compact"]).toBeTypeOf("function");
  });

  it("sends top-level session_id without compacting messages", () => {
    const { registered } = loadExtension();
    registered["session_before_compact"]?.({
      sessionId: "real-session",
      messages: [{ session_id: "attacker-owned" }],
    });

    const compactCall = spawnSyncMock.mock.calls.find((call) =>
      String(call[1]?.[0] ?? "").endsWith("memory-capture.sh"),
    );
    expect(compactCall).toBeDefined();
    const parsed = JSON.parse(
      String((compactCall?.[2] as { input?: string } | undefined)?.input ?? "{}"),
    ) as { session_id?: string; messages?: unknown };
    expect(parsed.session_id).toBe("real-session");
    expect(parsed.messages).toBeUndefined();
  });

  it("injects session_start context via sendMessage, not additionalContext", () => {
    spawnSyncMock.mockReturnValue(
      spawnResult({
        stdout: JSON.stringify({
          hookSpecificOutput: { additionalContext: "bootstrap context" },
        }),
      }),
    );
    const sendMessage = vi.fn();
    const { registered } = loadExtension(sendMessage);

    const result = registered.session_start?.({ type: "session_start" });

    expect(result).toBeUndefined();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "coding-friend.session-init",
        content: "bootstrap context",
      }),
    );
  });
});
