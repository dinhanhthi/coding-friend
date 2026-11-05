import { atom, update } from "claude-code";
import type { EngineInterface, On } from "claude-code";

import type { ModsQuotaWindow } from "../types";
import { isInteractive } from "./register";
import type { ModsContext } from "./register";
import {
  crossedLevel,
  formatReset,
  levelKey,
  shouldWrite,
  toSnapshot,
} from "./lib/quota.mjs";

// Quota sensor: on each rate-limit move, write the shared Claude quota
// snapshot (headless too), and when a person is at the prompt toast each new
// 80/90/95% level and keep the windows in $.state for the band.

const quotaState = atom(
  { plugin: "coding-friend-mods", key: "quota" } as const,
  null,
);

// Atomic write as the statusline does it: dir 0700, file 0600, mktemp in the
// same dir + mv, never through a symlink or onto a non-regular file.
// $1 = dir, $2 = file, stdin = JSON.
const WRITE =
  'umask 077; mkdir -p "$1" && chmod 700 "$1" || exit 0; [ -L "$2" ] && exit 0; ' +
  '[ -e "$2" ] && [ ! -f "$2" ] && exit 0; ' +
  't=$(mktemp "$1/.claude.XXXXXX") || exit 0; trap \'rm -f "$t"\' EXIT; ' +
  'cat > "$t" && mv -f "$t" "$2"';

const WINDOW_KINDS = ["five_hour", "seven_day"] as const;

export function registerQuota(on: On, _ctx: ModsContext): void {
  on("session.measure", async ($, e, next) => {
    try {
      if (e.changed.includes("rateLimits")) {
        await sense($, e.rateLimits);
      }
    } catch {
      // Fail-soft: a broken sensor never breaks the session.
    }
    return next(e);
  });
}

async function sense(
  $: EngineInterface,
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[],
): Promise<void> {
  const home = await $.env.get("HOME");
  const configDir = claudeConfigDir(await $.env.get("CLAUDE_CONFIG_DIR"), home);
  if (configDir === null) return;
  const nowS = Math.floor((await $.clock.now()) / 1000);
  const next = toSnapshot(rateLimits, nowS, configDir);
  if (next === null) return;

  await writeSnapshot($, next, nowS, home);

  if (!(await isInteractive($))) return;
  const windows = parseWindows(next.json);
  await update($, quotaState, () => windows);
  for (const w of windows) {
    const key = `level:${levelKey(w.kind, w.resetsAt)}`;
    const stored = await $.store.get(key);
    const level = crossedLevel(
      typeof stored === "number" ? stored : null,
      w.percentUsed,
    );
    if (level === null) continue;
    const label = w.kind === "five_hour" ? "5h" : "7d";
    $.ui.toast(
      `Claude ${label} quota ${level}% · resets ${formatReset(w.kind, w.resetsAt, nowS)}`,
    );
    await $.store.set(key, level);
  }
}

async function writeSnapshot(
  $: EngineInterface,
  next: { json: string; windowsText: string },
  nowS: number,
  home: string | undefined,
): Promise<void> {
  const custom = await $.env.get("CF_QUOTA_DIR");
  // Like the statusline's ${CF_QUOTA_DIR:-$HOME/.coding-friend/quota}
  const dir = custom ? custom : home ? `${home}/.coding-friend/quota` : null;
  if (dir === null) return;
  const file = `${dir}/claude.json`;
  let existing: string | null = null;
  try {
    // A link or a non-regular file (a FIFO would block the read) is never
    // read and never written, as in the WRITE script.
    const st = await $.fs.stat(file);
    if (st.kind !== "file" || st.isLink) return;
    existing = await $.fs.read(file);
  } catch {
    existing = null; // missing (stat rejects ENOENT) or unreadable
  }
  if (!shouldWrite(existing, next, nowS)) return;
  try {
    // $.process is CLI only: on desktop/Windows the call throws or rejects,
    // and the snapshot is skipped silently.
    await $.process.run(["/bin/sh", "-c", WRITE, "sh", dir, file], {
      stdin: next.json + "\n",
      timeoutMs: 5000,
    });
  } catch {
    // A failed write never breaks the session.
  }
}

/** The Claude config dir as plugin/lib/cf-paths.sh `cf_claude_dir` resolves it. */
function claudeConfigDir(
  raw: string | undefined,
  home: string | undefined,
): string | null {
  const dir = (raw ?? "").trim();
  if (dir === "") return home ? `${home}/.claude` : null;
  if (dir === "~") return home ?? null;
  if (dir.startsWith("~/")) return home ? `${home}/${dir.slice(2)}` : null;
  return dir;
}

/** The windows of a snapshot written by toSnapshot, in kind order. */
function parseWindows(json: string): ModsQuotaWindow[] {
  const windows = JSON.parse(json).windows as Record<
    string,
    { percentUsed: number; resetsAt: number }
  >;
  const out: ModsQuotaWindow[] = [];
  for (const kind of WINDOW_KINDS) {
    const w = windows[kind];
    if (w) out.push({ kind, percentUsed: w.percentUsed, resetsAt: w.resetsAt });
  }
  return out;
}
