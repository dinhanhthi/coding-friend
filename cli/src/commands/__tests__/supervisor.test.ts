import { describe, it, expect } from "vitest";
import { spawn, spawnSync } from "child_process";
import { processIdentity, watchdogArgv } from "../supervisor.js";

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function waitDead(pid: number, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (!alive(pid)) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return !alive(pid);
}

describe.skipIf(process.platform === "win32")("tick watchdog", () => {
  it("kills the tick only while its pid still has the identity captured at start", async () => {
    const child = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1e3)"],
      {
        stdio: "ignore",
      },
    );
    const pid = child.pid!;
    try {
      const identity = processIdentity(pid);
      expect(identity).not.toBe("");

      // Same pid, other identity (pid reused): never killed.
      const [sh, ...args] = watchdogArgv(pid, `${identity} (reused)`, 0);
      spawnSync(sh, args);
      expect(await waitDead(pid, 300)).toBe(false);

      const [sh2, ...args2] = watchdogArgv(pid, identity, 0);
      spawnSync(sh2, args2);
      expect(await waitDead(pid, 2000)).toBe(true);
    } finally {
      child.kill("SIGKILL");
    }
  });
});
