/**
 * Contract tests for the coding-friend-mods pure quota helpers (plan M task 3.2):
 * toast levels once per window, the snapshot overwrite rules shared with the
 * statusline, and byte parity of the `"windows":` text with the statusline writer.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  crossedLevel,
  formatReset,
  levelKey,
  shouldWrite,
  toSnapshot,
} from "../../plugin-mods/hooks/lib/quota.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const STATUSLINE = path.join(repoRoot, "plugin/hooks/statusline.sh");

test("a level toasts once per window and a new window starts again", () => {
  const store = new Map();
  const observe = (kind, resetsAt, percent) => {
    const key = levelKey(kind, resetsAt);
    const level = crossedLevel(store.get(key) ?? 0, percent);
    if (level !== null) store.set(key, level);
    return level;
  };

  assert.equal(observe("five_hour", "2026-11-05T17:40:00Z", 91), 90);
  assert.equal(observe("five_hour", "2026-11-05T17:40:00Z", 91.5), null);
  assert.equal(observe("five_hour", "2026-11-05T17:40:00Z", 96), 95);
  assert.equal(observe("five_hour", "2026-11-05T22:40:00Z", 91), 90);

  // The toast's reset time: HH:MM for 5h, the day too for a 7d reset days away
  const nowS = 1_800_000_000;
  assert.match(formatReset("five_hour", nowS + 3600, nowS), /^\d{2}:\d{2}$/);
  assert.match(
    formatReset("seven_day", nowS + 3 * 86400, nowS),
    /^[A-Z][a-z]{2} \d{1,2} \d{2}:\d{2}$/,
  );
});

test("shouldWrite: newer wins, a corrupt future measuredAt is overwritten, same windows within 300 s skip", () => {
  const now = 1_800_000_000;
  const next = toSnapshot(
    [{ kind: "five_hour", percentUsed: 50, resetsAt: "2027-01-15T08:00:00Z" }],
    now,
    "/cfg",
  );
  const existing = (measuredAt, windowsText) =>
    `{"schemaVersion":1,"provider":"claude","configDir":"/cfg","windows":${windowsText},"source":"statusline","measuredAt":${measuredAt}}\n`;
  const other = '{"five_hour":{"percentUsed":40,"resetsAt":1800003600}}';

  assert.equal(shouldWrite(null, next, now), true);
  assert.equal(shouldWrite("{not json", next, now), true);
  assert.equal(shouldWrite(existing(now + 100, other), next, now), false);
  assert.equal(shouldWrite(existing(now + 1000, other), next, now), true);
  assert.equal(
    shouldWrite(existing(now - 100, next.windowsText), next, now),
    false,
  );
  assert.equal(
    shouldWrite(existing(now - 300, next.windowsText), next, now),
    true,
  );
  assert.equal(shouldWrite(existing(now - 100, other), next, now), true);
});

const NO_SYSTEM_JQ_REASON = ["/usr/bin", "/bin"].some((dir) =>
  fs.existsSync(path.join(dir, "jq")),
)
  ? null
  : "no jq in /usr/bin or /bin, so the statusline snapshot writer cannot run";

test(
  "toSnapshot writes the same windows text as the statusline",
  { skip: NO_SYSTEM_JQ_REASON ?? false },
  () => {
    const fiveIso = "2026-11-05T17:40:00.000Z";
    const sevenIso = "2026-11-08T19:00:00.000Z";
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cf-mods-quota-"));
    try {
      for (const d of ["home", "cwd"]) fs.mkdirSync(path.join(root, d));
      const configDir = path.join(root, "claude-config");
      const quotaDir = path.join(root, "quota");
      const result = spawnSync("bash", [STATUSLINE], {
        cwd: path.join(root, "cwd"),
        input: JSON.stringify({
          session_id: "sess-1",
          current_dir: "/work/proj",
          model: { display_name: "Opus" },
          rate_limits: {
            seven_day: {
              used_percentage: 100.4,
              resets_at: Math.floor(Date.parse(sevenIso) / 1000),
            },
            five_hour: { used_percentage: 42, resets_at: fiveIso },
          },
        }),
        encoding: "utf8",
        timeout: 10000,
        env: {
          HOME: path.join(root, "home"),
          PATH: "/usr/bin:/bin",
          CLAUDE_CONFIG_DIR: configDir,
          CF_ORCHESTRATOR_DIR: path.join(root, "store"),
          CF_QUOTA_DIR: quotaDir,
        },
      });
      assert.equal(result.status, 0, result.stderr);
      const written = fs
        .readFileSync(path.join(quotaDir, "claude.json"), "utf8")
        .trimEnd();

      const now = 1_800_000_000;
      const snap = toSnapshot(
        [
          { kind: "spend_limit", percentUsed: 12, resetsAt: fiveIso },
          { kind: "five_hour", percentUsed: 42, resetsAt: fiveIso },
          { kind: "seven_day", percentUsed: 100.4, resetsAt: sevenIso },
        ],
        now,
        configDir,
      );
      assert.ok(snap);

      const start = written.indexOf('"windows":') + '"windows":'.length;
      const end = written.indexOf(',"source":', start);
      assert.equal(written.slice(start, end), snap.windowsText);
      assert.equal(
        written
          .replace('"source":"statusline"', '"source":"mod"')
          .replace(/"measuredAt":\d+/, `"measuredAt":${now}`),
        snap.json,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
